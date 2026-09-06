import { reducers, tables } from "@closetkeeper/bindings";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { ListGroup, ListRow } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import { Empty } from "../components/Stock";
import { whenLabel } from "../format";

export const Route = createFileRoute("/bags/")({
	component: () => (
		<AuthedPage>
			<Bags />
		</AuthedPage>
	),
});

/** Everything that has come in. Open bags first: they are unfinished business. */
function Bags() {
	const can = useCan();
	const navigate = useNavigate();
	const [bags, ready] = useTable(tables.bagList);
	const openBag = useReducer(reducers.openBag);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	if (!can("inventory.read")) {
		return (
			<>
				<PageHeader title="Bags" />
				<Text>Your role can't see intake.</Text>
			</>
		);
	}
	if (!ready) return null;

	const start = async (kind: "donated" | "purchased") => {
		setBusy(kind);
		setError(null);
		try {
			await openBag({ kind, note: "" });
			// The new bag is the newest open one of that kind.
			const mine = [...bags]
				.filter((b) => b.status === "open")
				.sort(
					(a, b) =>
						Number(
							b.openedAt.microsSinceUnixEpoch - a.openedAt.microsSinceUnixEpoch,
						) || 0,
				);
			const first = mine[0];
			if (first) {
				void navigate({
					to: "/bags/$bagId",
					params: { bagId: String(first.bagId) },
				});
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(null);
		}
	};

	const sorted = [...bags].sort(
		(a, b) =>
			Number(a.status === "open" ? 0 : 1) -
				Number(b.status === "open" ? 0 : 1) ||
			Number(b.openedAt.microsSinceUnixEpoch - a.openedAt.microsSinceUnixEpoch),
	);

	return (
		<>
			<PageHeader title="Bags" />
			<Stack gap="md">
				{can("inventory.write") ? (
					<Group grow>
						<Button
							loading={busy === "donated"}
							onClick={() => start("donated")}
						>
							Donated bag
						</Button>
						<Button
							variant="outline"
							loading={busy === "purchased"}
							onClick={() => start("purchased")}
						>
							Purchased
						</Button>
					</Group>
				) : null}
				{error ? (
					<Alert color="clay" role="alert">
						{error}
					</Alert>
				) : null}
				{sorted.length === 0 ? (
					<Empty>No bags yet.</Empty>
				) : (
					<ListGroup>
						{sorted.map((b) => (
							<ListRow
								key={String(b.bagId)}
								title={
									<Group gap="xs">
										<SizeTag tone={b.status === "open" ? "pine" : "tape"}>
											{b.kind === "donated" ? "Donated" : "Purchased"}
										</SizeTag>
										{b.status === "open" ? (
											<SizeTag tone="clay">open</SizeTag>
										) : null}
									</Group>
								}
								detail={`${whenLabel(b.openedAt)}${b.openedByName ? ` · ${b.openedByName}` : ""}`}
								right={
									<Text c="dimmed" size="sm">
										{b.lineCount} {b.lineCount === 1 ? "line" : "lines"} ·{" "}
										{b.itemCount}
									</Text>
								}
								to="/bags/$bagId"
								params={{ bagId: String(b.bagId) }}
							/>
						))}
					</ListGroup>
				)}
				<Text size="sm" c="dimmed">
					An open bag counts for nothing until it is closed.
				</Text>
			</Stack>
		</>
	);
}
