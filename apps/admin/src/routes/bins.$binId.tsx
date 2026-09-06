import { reducers, tables } from "@closetkeeper/bindings";
import type { BinLevel } from "@closetkeeper/bindings/types";
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
import { Empty, Stepper } from "../components/Stock";
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
	const [counting, setCounting] = useState(false);
	const can = useCan();

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
				{counting ? (
					<CountBin
						locationId={id}
						contents={contents}
						onDone={() => setCounting(false)}
					/>
				) : null}
				{!counting && can("inventory.write") && contents.length > 0 ? (
					<Button variant="outline" onClick={() => setCounting(true)}>
						Count this bin
					</Button>
				) : null}
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
					Counting walks these one at a time. A single number can also be fixed
					from the shelves: tap the size, then the bin.
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

/**
 * A physical recount, one line at a time. The person is holding the bin,
 * not a keyboard: each line offers the number the app believes and a way to
 * say otherwise, and only a disagreement writes anything.
 */
function CountBin({
	locationId,
	contents,
	onDone,
}: {
	locationId: bigint;
	contents: readonly BinLevel[];
	onDone: () => void;
}) {
	const correct = useReducer(reducers.correctCount);
	const [at, setAt] = useState(0);
	const [count, setCount] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [changed, setChanged] = useState(0);

	const line = contents[at];
	if (!line) {
		return (
			<Card>
				<Stack gap="md">
					<Text fw={700}>Counted.</Text>
					<Text c="dimmed" size="sm">
						{changed === 0
							? "Every number matched."
							: `${changed} ${changed === 1 ? "number" : "numbers"} corrected.`}
					</Text>
					<Button onClick={onDone}>Done</Button>
				</Stack>
			</Card>
		);
	}

	const believed = line.onHand;
	const saying = count ?? believed;

	const next = () => {
		setCount(null);
		setError(null);
		setAt((n) => n + 1);
	};

	return (
		<Card>
			<Stack gap="md">
				<Text size="sm" c="dimmed">
					{at + 1} of {contents.length}
				</Text>
				<Text fw={700} size="lg">
					{line.categoryLabel} · {line.sizeLabel} · {line.genderLabel} ·{" "}
					{line.conditionLabel}
				</Text>
				<Group gap="lg" align="center">
					<div>
						<Text size="xs" c="dimmed">
							App says
						</Text>
						<Text fw={700} size="xl">
							{believed}
						</Text>
					</div>
					<Stepper value={saying} onChange={setCount} label="counted" />
				</Group>
				{saying === believed ? (
					<Button variant="outline" onClick={next}>
						That's right
					</Button>
				) : (
					<Button
						loading={busy}
						onClick={async () => {
							setBusy(true);
							setError(null);
							try {
								await correct({
									slotId: line.slotId,
									locationId,
									onHand: saying,
									note: "counted the bin",
								});
								setChanged((n) => n + 1);
								next();
							} catch (e) {
								setError(e instanceof Error ? e.message : String(e));
							} finally {
								setBusy(false);
							}
						}}
					>
						Set to {saying}
					</Button>
				)}
				<Button variant="subtle" onClick={onDone}>
					Stop counting
				</Button>
				{error ? (
					<Alert color="clay" role="alert">
						{error}
					</Alert>
				) : null}
			</Stack>
		</Card>
	);
}
