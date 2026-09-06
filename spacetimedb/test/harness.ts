/**
 * Integration-test harness for the SpacetimeDB module.
 *
 * Tests run against a real local SpacetimeDB instance rather than a mock, so
 * reducer semantics — `ctx.sender`, unique constraints, index order — are the
 * host's, not an approximation. See docs/decision-log.md, "Module tests".
 *
 * Preconditions: a local instance is listening (`spacetime start --in-memory`)
 * and the `spacetime` CLI is on PATH. CI starts one; locally, run
 * `pnpm module:local` in another terminal first.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const LOCAL_SERVER = "http://127.0.0.1:3000";
const MODULE_PATH = resolve(import.meta.dirname, "..");

type Access = "Public" | "Private";

export interface DescribedTable {
	name: string;
	access: Access;
}

function spacetime(args: string[], opts: { json?: boolean } = {}): string {
	// --no-config: ignore the repo's spacetime.json so tests always target the
	// local server named here, never whatever a developer last pointed the CLI at.
	return execFileSync("spacetime", [...args, "--no-config"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", opts.json ? "ignore" : "pipe"],
		timeout: 120_000,
	});
}

/** Publish the module under test to the local instance, wiping any prior data. */
export function publish(database: string): void {
	spacetime([
		"publish",
		database,
		"--server",
		LOCAL_SERVER,
		"--module-path",
		MODULE_PATH,
		"--delete-data=always",
		"--yes",
	]);
}

/** Return every user table in the published database with its access level. */
export function describeTables(database: string): DescribedTable[] {
	const raw = spacetime(
		["describe", database, "--server", LOCAL_SERVER, "--json"],
		{ json: true },
	);
	const parsed = JSON.parse(raw) as {
		sections: Array<Record<string, unknown>>;
	};
	const tablesSection = parsed.sections.find((s) => "Tables" in s);
	const tables = (tablesSection?.Tables ?? []) as Array<{
		source_name: string;
		table_access: Record<Access, unknown[]>;
	}>;
	return tables.map((t) => ({
		name: t.source_name,
		access: "Public" in t.table_access ? "Public" : "Private",
	}));
}

export interface DescribedReducer {
	name: string;
	clientCallable: boolean;
}

/** Every reducer in the published database. Lifecycle hooks are not client-callable. */
export function describeReducers(database: string): DescribedReducer[] {
	const raw = spacetime(
		["describe", database, "--server", LOCAL_SERVER, "--json"],
		{
			json: true,
		},
	);
	const parsed = JSON.parse(raw) as {
		sections: Array<Record<string, unknown>>;
	};
	const section = parsed.sections.find((s) => "Reducers" in s);
	const reducers = (section?.Reducers ?? []) as Array<{
		source_name: string;
		visibility: Record<string, unknown[]>;
	}>;
	return reducers.map((r) => ({
		name: r.source_name,
		clientCallable: "ClientCallable" in r.visibility,
	}));
}

/** Run a SQL query against the database and return the rows of the first result set. */
export function sql<Row = Record<string, unknown>>(
	database: string,
	query: string,
): Row[] {
	const raw = spacetime(
		["sql", database, "--server", LOCAL_SERVER, "--format", "json", query],
		{
			json: true,
		},
	);
	const [first] = JSON.parse(raw) as Array<{ rows: Row[] }>;
	return first?.rows ?? [];
}

/**
 * Call a reducer through the CLI. Arguments are JSON values, one per reducer
 * parameter. By default the call is made as the CLI's logged-in identity,
 * which is also the identity that published the module, i.e. the seeded first
 * staff member. `anonymous: true` uses a fresh identity that owns nothing.
 * Returns the error text on failure, or null on success.
 */
export function call(
	database: string,
	reducer: string,
	args: unknown[],
	opts: { anonymous?: boolean } = {},
): string | null {
	try {
		spacetime([
			"call",
			database,
			"--server",
			LOCAL_SERVER,
			...(opts.anonymous ? ["--anonymous"] : []),
			reducer,
			...args.map((a) => JSON.stringify(a)),
		]);
		return null;
	} catch (err) {
		const e = err as { stderr?: string; stdout?: string; message: string };
		return e.stderr || e.stdout || e.message;
	}
}

/** Like `sql`, but optionally as a fresh anonymous identity, to prove a view's gating. */
export function sqlAs<Row = Record<string, unknown>>(
	database: string,
	query: string,
	opts: { anonymous?: boolean } = {},
): Row[] {
	const raw = spacetime(
		[
			"sql",
			database,
			"--server",
			LOCAL_SERVER,
			...(opts.anonymous ? ["--anonymous"] : []),
			"--format",
			"json",
			query,
		],
		{ json: true },
	);
	const [first] = JSON.parse(raw) as Array<{ rows: Row[] }>;
	return first?.rows ?? [];
}

/** Ping the local instance; throws with a readable message if it is not up. */
export async function assertLocalInstance(): Promise<void> {
	try {
		const res = await fetch(`${LOCAL_SERVER}/v1/ping`);
		if (!res.ok) throw new Error(`ping returned ${res.status}`);
	} catch (cause) {
		throw new Error(
			`No SpacetimeDB instance at ${LOCAL_SERVER}. Start one with \`pnpm module:local\` and re-run.`,
			{ cause },
		);
	}
}
