import { tables } from "@closetkeeper/bindings";
import { Card, Group, Stack, Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTable } from "spacetimedb/react";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import { whenLabel } from "../format";
import classes from "./access.module.css";

export const Route = createFileRoute("/audit")({
	component: () => (
		<AuthedPage>
			<AuditLog />
		</AuthedPage>
	),
});

/**
 * Reducer names in the words a person would use. Anything missing falls
 * back to the reducer's own name, which is ugly but never wrong.
 */
const ACTION_LABEL: Record<string, string> = {
	init: "set the database up",
	invite_staff: "added someone",
	set_staff_active: "changed who is active",
	set_staff_role: "changed a role",
	set_staff_person: "edited a person",
	create_role: "created a role",
	update_role: "renamed a role",
	delete_role: "deleted a role",
	grant_capability: "granted access",
	revoke_capability: "took access away",
	update_my_name: "changed their own name",
	remove_my_login: "removed a login",
	finish_welcome: "finished their welcome",
	open_bag: "opened a bag",
	add_bag_line: "added to a bag",
	remove_bag_line: "removed from a bag",
	close_bag: "closed a bag",
	hand_out: "handed something out",
	correct_count: "fixed a count",
	add_size: "added a size",
	update_size: "edited a size",
	add_category: "added a category",
	update_category: "edited a category",
	add_gender: "added to For",
	update_gender: "edited For",
	add_condition: "added a condition",
	update_condition: "edited a condition",
	add_location: "added a bin",
	update_location: "edited a bin",
	seed_inventory: "seeded the closet",
};

const GROUPS: { key: string; label: string; match: (a: string) => boolean }[] =
	[
		{ key: "all", label: "All", match: () => true },
		{
			key: "closet",
			label: "The closet",
			match: (a) =>
				a.includes("bag") ||
				a.startsWith("hand_out") ||
				a.startsWith("correct_") ||
				a.startsWith("add_") ||
				a.startsWith("update_") ||
				a === "seed_inventory",
		},
		{
			key: "access",
			label: "Access",
			match: (a) =>
				a.includes("staff") ||
				a.includes("role") ||
				a.includes("capability") ||
				a.includes("login"),
		},
	];

/** Who did what. Append-only: nothing in the app can edit or delete these. */
function AuditLog() {
	const can = useCan();
	const [events] = useTable(tables.auditLog);
	const [group, setGroup] = useState("all");

	if (!can("staff.manage")) {
		return (
			<>
				<PageHeader title="Audit log" back="/more" />
				<Card>
					<Text>Your role can't see the audit log.</Text>
				</Card>
			</>
		);
	}

	const match = GROUPS.find((g) => g.key === group)?.match ?? (() => true);
	const rows = [...events]
		.filter((e) => match(e.action))
		.sort((a, b) =>
			Number(b.at.microsSinceUnixEpoch - a.at.microsSinceUnixEpoch),
		);

	return (
		<>
			<PageHeader
				title="Audit log"
				back="/more"
				right={<SizeTag tone="muted">append-only</SizeTag>}
			/>
			<Stack gap="md">
				<Group gap="xs">
					{GROUPS.map((g) => (
						<button
							key={g.key}
							type="button"
							className={classes.chip}
							data-on={group === g.key || undefined}
							onClick={() => setGroup(g.key)}
						>
							{g.label}
						</button>
					))}
				</Group>
				{rows.length === 0 ? (
					<Text c="dimmed" ta="center" py="xl">
						Nothing here yet.
					</Text>
				) : (
					<Stack gap={0}>
						{rows.map((e) => (
							<div key={String(e.eventId)} className={classes.row}>
								<div>
									<Text fw={700}>
										{e.actorName || "The app itself"}{" "}
										{ACTION_LABEL[e.action] ?? e.action}
									</Text>
									<Text size="xs" c="dimmed">
										{whenLabel(e.at)}
										{e.targetTable
											? ` · ${e.targetTable}${e.targetId ? ` #${e.targetId}` : ""}`
											: ""}
									</Text>
									{e.details && e.details !== "{}" ? (
										<Text size="xs" c="dimmed" className={classes.details}>
											{e.details}
										</Text>
									) : null}
								</div>
							</div>
						))}
					</Stack>
				)}
				<Text size="sm" c="dimmed">
					Every change goes in here by construction, and nothing in the app can
					edit or delete a line. Names and emails are deliberately left out.
				</Text>
			</Stack>
		</>
	);
}
