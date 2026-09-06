import { tables } from "@closetkeeper/bindings";
import { Card, Group, Stack, Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTable } from "spacetimedb/react";
import { ListGroup, ListRow } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import { OUTCOME_LABEL, whenLabel } from "../format";
import classes from "./access.module.css";

export const Route = createFileRoute("/access")({
	component: () => (
		<AuthedPage>
			<AccessLog />
		</AuthedPage>
	),
});

const FILTERS: { key: string; label: string; outcomes: string[] | null }[] = [
	{ key: "all", label: "All", outcomes: null },
	{
		key: "not_on_list",
		label: "Not on the list",
		outcomes: ["invited_no_match"],
	},
	{ key: "staff", label: "Staff", outcomes: ["staff", "linked"] },
	{
		key: "not_ours",
		label: "Not ours",
		outcomes: ["untrusted_token", "anonymous"],
	},
];

/** The door's record: who signed in, who tried. System administrators only. */
function AccessLog() {
	const can = useCan();
	const [events] = useTable(tables.accessLog);
	const [filter, setFilter] = useState("all");

	if (!can("access.read")) {
		return (
			<>
				<PageHeader title="Access log" back="/more" />
				<Card>
					<Text>Your role can't see the access log.</Text>
				</Card>
			</>
		);
	}

	const outcomes = FILTERS.find((f) => f.key === filter)?.outcomes ?? null;
	const rows = [...events]
		.filter((e) => outcomes === null || outcomes.includes(e.outcome))
		.sort((a, b) =>
			Number(b.at.microsSinceUnixEpoch - a.at.microsSinceUnixEpoch),
		);

	return (
		<>
			<PageHeader
				title="Access log"
				back="/more"
				right={<SizeTag tone="muted">90 days</SizeTag>}
			/>
			<Stack gap="md">
				<Group gap="xs">
					{FILTERS.map((f) => (
						<button
							key={f.key}
							type="button"
							className={classes.chip}
							data-on={filter === f.key || undefined}
							onClick={() => setFilter(f.key)}
						>
							{f.label}
						</button>
					))}
				</Group>
				<ListGroup>
					{rows.map((e) => {
						const who =
							e.displayName ||
							e.email ||
							(e.outcome === "anonymous" ? "anonymous" : "unknown token");
						const label = OUTCOME_LABEL[e.outcome] ?? {
							text: e.outcome,
							tone: "muted" as const,
						};
						return (
							<ListRow
								key={String(e.eventId)}
								title={who}
								detail={`${whenLabel(e.at)} · ${e.identityHex.slice(0, 8)}…`}
								right={<SizeTag tone={label.tone}>{label.text}</SizeTag>}
							/>
						);
					})}
				</ListGroup>
				{rows.length === 0 ? (
					<Text size="sm" c="dimmed">
						Nothing here.
					</Text>
				) : null}
				<Text size="sm" c="dimmed">
					An address that tried to sign in but isn't on the list shows here so
					you can add it. Entries clear after 90 days. Network addresses aren't
					available.
				</Text>
			</Stack>
		</>
	);
}
