import { reducers, tables } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
	Card,
	Collapse,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { ListGroup, ListRow } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { useVocab } from "../inventory";

export const Route = createFileRoute("/bins/")({
	component: () => (
		<AuthedPage>
			<Bins />
		</AuthedPage>
	),
});

/** Where things physically are. Every count lives in one of these. */
function Bins() {
	const can = useCan();
	const vocab = useVocab();
	const [levels] = useTable(tables.binLevels);
	const add = useReducer(reducers.addLocation);
	const [adding, setAdding] = useState(false);
	const [label, setLabel] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	if (!vocab.ready) return null;

	const held = (locationId: bigint) =>
		levels
			.filter((l) => l.locationId === locationId)
			.reduce((n, l) => n + l.onHand, 0);
	const total = levels.reduce((n, l) => n + l.onHand, 0);

	return (
		<>
			<PageHeader
				title="Bins & places"
				back="/more"
				right={
					<Text c="dimmed" size="sm">
						{total} {total === 1 ? "item" : "items"}
					</Text>
				}
			/>
			<Stack gap="md">
				{can("inventory.manage") ? (
					<>
						<Button
							variant={adding ? "light" : "outline"}
							onClick={() => setAdding((v) => !v)}
						>
							{adding ? "Cancel" : "Add a bin"}
						</Button>
						<Collapse expanded={adding}>
							<Card>
								<Stack gap="md">
									<TextInput
										label="Name"
										placeholder="Bin 3"
										value={label}
										onChange={(e) => setLabel(e.currentTarget.value)}
									/>
									<Button
										loading={busy}
										disabled={label.trim().length === 0}
										onClick={async () => {
											setBusy(true);
											setError(null);
											try {
												await add({ label });
												setLabel("");
												setAdding(false);
											} catch (e) {
												setError(e instanceof Error ? e.message : String(e));
											} finally {
												setBusy(false);
											}
										}}
									>
										Add
									</Button>
									{error ? (
										<Alert color="clay" role="alert">
											{error}
										</Alert>
									) : null}
								</Stack>
							</Card>
						</Collapse>
					</>
				) : null}
				<ListGroup>
					{vocab.locations.map((l) => (
						<ListRow
							key={String(l.locationId)}
							title={l.label}
							detail={l.active ? undefined : "retired"}
							right={<Text fw={700}>{held(l.locationId)}</Text>}
							to="/bins/$binId"
							params={{ binId: String(l.locationId) }}
						/>
					))}
				</ListGroup>
				<Text size="sm" c="dimmed">
					Every count lives in one of these. A bin can only be retired once it
					is empty.
				</Text>
			</Stack>
		</>
	);
}
