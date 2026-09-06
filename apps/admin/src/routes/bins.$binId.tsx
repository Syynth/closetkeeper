import { reducers, tables } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
	Card,
	Group,
	Stack,
	Switch,
	Text,
	TextInput,
} from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { Empty } from "../components/Stock";
import { useVocab } from "../inventory";

export const Route = createFileRoute("/bins/$binId")({
	component: () => (
		<AuthedPage>
			<Bin />
		</AuthedPage>
	),
});

function Bin() {
	const { binId } = Route.useParams();
	const id = BigInt(binId);
	const vocab = useVocab();
	const [levels] = useTable(tables.binLevels);

	if (!vocab.ready) return null;
	const bin = vocab.locations.find((l) => l.locationId === id);
	if (!bin) {
		return (
			<>
				<PageHeader title="Not found" back="/bins" />
				<Text>That bin is gone.</Text>
			</>
		);
	}

	const contents = levels
		.filter((l) => l.locationId === id && l.onHand > 0)
		.sort(
			(a, b) =>
				a.categoryLabel.localeCompare(b.categoryLabel) ||
				a.sizeLabel.localeCompare(b.sizeLabel),
		);
	const total = contents.reduce((n, l) => n + l.onHand, 0);

	return (
		<>
			<PageHeader
				title={bin.label}
				back="/bins"
				right={<Text fw={700}>{total}</Text>}
			/>
			<Stack gap="lg">
				<BinForm
					key={`${bin.label}:${bin.active}`}
					locationId={bin.locationId}
					label={bin.label}
					sortOrder={bin.sortOrder}
					active={bin.active}
				/>
				<div>
					<Text fw={700} mb="xs">
						What is in here
					</Text>
					{contents.length === 0 ? (
						<Empty>Empty.</Empty>
					) : (
						<Stack gap={0}>
							{contents.map((l) => (
								<Group key={l.key} justify="space-between" py="xs">
									<Text>
										{l.categoryLabel} · {l.sizeLabel} · {l.genderLabel} ·{" "}
										{l.conditionLabel}
									</Text>
									<Text fw={700}>{l.onHand}</Text>
								</Group>
							))}
						</Stack>
					)}
				</div>
				<Text size="sm" c="dimmed">
					Fix a number from the shelves: tap the size, then the bin.
				</Text>
			</Stack>
		</>
	);
}

function BinForm({
	locationId,
	label: initial,
	sortOrder,
	active: initialActive,
}: {
	locationId: bigint;
	label: string;
	sortOrder: number;
	active: boolean;
}) {
	const can = useCan();
	const update = useReducer(reducers.updateLocation);
	const [label, setLabel] = useState(initial);
	const [active, setActive] = useState(initialActive);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [busy, setBusy] = useState(false);

	if (!can("inventory.manage")) return null;
	const dirty = label !== initial || active !== initialActive;

	return (
		<Card>
			<Stack gap="md">
				<TextInput
					label="Name"
					value={label}
					onChange={(e) => setLabel(e.currentTarget.value)}
				/>
				<Switch
					label="In use"
					description="Off hides it from intake. Only possible once it is empty."
					checked={active}
					onChange={(e) => setActive(e.currentTarget.checked)}
				/>
				<Button
					disabled={!dirty}
					loading={busy}
					onClick={async () => {
						setBusy(true);
						setError(null);
						setSaved(false);
						try {
							await update({ locationId, label, sortOrder, active });
							setSaved(true);
						} catch (e) {
							setError(e instanceof Error ? e.message : String(e));
						} finally {
							setBusy(false);
						}
					}}
				>
					Save
				</Button>
				{saved ? <Alert color="pine" title="Saved" role="status" /> : null}
				{error ? (
					<Alert color="clay" title="Not saved" role="alert">
						{error}
					</Alert>
				) : null}
			</Stack>
		</Card>
	);
}
