/**
 * The only way to declare an admin reducer.
 *
 * defineAdminReducer wraps a body with, in order: the staff allowlist check
 * for the declared capability, the body, and one audit_event row describing
 * the call. Authors never write an authorization check or an audit line;
 * both are structural. The reducer guardrail test fails CI for any reducer
 * declared without this helper.
 *
 * Denied and failed calls are NOT in audit_event. A reducer that throws
 * rolls back everything it did, including any row it inserted (verified on
 * 2026-09-05), so a denial cannot be persisted by the call it denies. Those
 * go to the host log via console.warn instead, with the reducer name and the
 * staff id only, and unknown callers are recorded once per connection in
 * access_event.
 */
import {
	type ColumnBuilder,
	type Infer,
	SenderError,
	type TypeBuilder,
} from "spacetimedb/server";
import { type Ctx, requireStaff, type StaffContext } from "./auth";
import { auditDetails, type Capability } from "./auth-rules";
import spacetimedb from "./schema";

// biome-ignore lint/suspicious/noExplicitAny: mirrors the SDK's own ParamsObj, which is not exported
type AnyBuilder = TypeBuilder<any, any> | ColumnBuilder<any, any, any>;
type ParamsObj = Record<string, AnyBuilder>;

/** What a body reports back for the audit row. All optional. */
export interface AuditTarget {
	table?: string;
	id?: bigint;
	/** Extra fields for `details`. Same PII rule as arguments: IDs and keys only. */
	details?: Record<string, unknown>;
}

export interface AdminReducerOpts<P extends ParamsObj> {
	/** The reducer's database name, snake_case. Also the audit `action`. */
	name: string;
	/** The capability the caller must hold. */
	capability: Capability;
	args: P;
	/** Argument names that must not reach the audit log (emails, names, ...). */
	redact?: readonly (keyof P & string)[];
}

export type AdminReducerBody<P extends ParamsObj> = (
	ctx: Ctx,
	staff: StaffContext,
	args: Infer<P>,
) => AuditTarget | undefined;

function message(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

export function defineAdminReducer<P extends ParamsObj>(
	opts: AdminReducerOpts<P>,
	body: AdminReducerBody<P>,
) {
	return spacetimedb.reducer({ name: opts.name }, opts.args, (ctx, rawArgs) => {
		let staff: StaffContext;
		try {
			staff = requireStaff(ctx, opts.capability);
		} catch (e) {
			console.warn(`[denied] ${opts.name}: ${message(e)}`);
			throw e;
		}

		const args = rawArgs as unknown as Infer<P>;
		let target: AuditTarget;
		try {
			target = body(ctx, staff, args) ?? {};
		} catch (e) {
			const kind = e instanceof SenderError ? "refused" : "failed";
			console.warn(
				`[${kind}] ${opts.name} by staff ${staff.staffId}: ${message(e)}`,
			);
			throw e;
		}

		ctx.db.audit_event.insert({
			id: 0n,
			at: ctx.timestamp,
			actor_staff_id: staff.staffId,
			action: opts.name,
			target_table: target.table ?? "",
			target_id: target.id ?? 0n,
			details: auditDetails(
				args as Record<string, unknown>,
				opts.redact ?? [],
				target.details ?? {},
			),
		});
	});
}
