/**
 * Shows the signed-in person what the database thinks of them: connection
 * state, and whether they resolved to a staff row. The answer comes from the
 * module's per-user `my_staff` view, which returns the caller's own row and
 * nothing else.
 */
import { tables } from "@closetkeeper/bindings";
import { useSpacetimeDB, useTable } from "spacetimedb/react";

export function WhoAmI({ email }: { email: string | null }) {
	const db = useSpacetimeDB();
	const [rows, ready] = useTable(tables.myStaff);
	const staff = rows[0] ?? null;

	return (
		<section aria-label="account">
			<p>Signed in{email ? ` as ${email}` : ""}.</p>
			{!db.isActive ? (
				<p>Connecting to the database…</p>
			) : !ready ? (
				<p>Checking your access…</p>
			) : staff ? (
				<p>
					You are <strong>{staff.roleLabel}</strong>
					{staff.active ? "" : " (deactivated)"}. Capabilities:{" "}
					{staff.capabilities.join(", ")}
				</p>
			) : (
				<p>
					This login is not linked to a staff member. Ask a staff member to
					invite this email address, then sign in again.
				</p>
			)}
		</section>
	);
}
