import { reducers, tables } from "@closetkeeper/bindings";
import type { BagLineEntry, BagSummary } from "@closetkeeper/bindings/types";
import { Alert, Button, Group, Menu, Stack, Text, Title } from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import { Stepper } from "../components/Stock";
import { whenLabel } from "../format";
import { suggestBin, useStock, useVocab } from "../inventory";
import classes from "./bags.module.css";

export const Route = createFileRoute("/bags/$bagId")({
	component: () => (
		<AuthedPage>
			<Bag />
		</AuthedPage>
	),
});

function Bag() {
	const { bagId } = Route.useParams();
	const id = BigInt(bagId);
	const [bags, bagsReady] = useTable(tables.bagList);
	const [lines] = useTable(tables.bagLines);
	const bag = bags.find((b) => b.bagId === id);

	if (!bagsReady) return null;
	if (!bag) {
		return (
			<>
				<PageHeader title="Not found" back="/bags" />
				<Text>That bag is gone.</Text>
			</>
		);
	}
	const mine = lines.filter((l) => l.bagId === id);
	return bag.status === "open" ? (
		<OpenBag bag={bag} lines={mine} />
	) : (
		<ClosedBag bag={bag} lines={mine} />
	);
}

// The generated row types, so a schema change shows up here as a type error.
type BagRow = BagSummary;
type LineRow = BagLineEntry;

const kindLabel = (kind: string) =>
	kind === "donated" ? "Donated bag" : "Purchased";

/**
 * Five taps: category, size, who it is for, condition, how many. The bin is
 * a sixth only when you disagree with the suggestion, which is why it reads
 * as a statement with a reason rather than a question.
 */
function OpenBag({ bag, lines }: { bag: BagRow; lines: LineRow[] }) {
	const can = useCan();
	const vocab = useVocab();
	const { cells, bins } = useStock({
		genderId: null,
		locationId: null,
		conditionIds: null,
	});
	const addLine = useReducer(reducers.addBagLine);
	const removeLine = useReducer(reducers.removeBagLine);
	const closeBag = useReducer(reducers.closeBag);

	const [categoryId, setCategoryId] = useState<bigint | null>(null);
	const [sizeId, setSizeId] = useState<bigint | null>(null);
	const [genderId, setGenderId] = useState<bigint | null>(null);
	const [conditionId, setConditionId] = useState<bigint | null>(null);
	const [binId, setBinId] = useState<bigint | null>(null);
	const [count, setCount] = useState(1);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [justAdded, setJustAdded] = useState<string | null>(null);

	if (!vocab.ready) return null;
	if (!can("inventory.write")) {
		return (
			<>
				<PageHeader title={kindLabel(bag.kind)} back="/bags" />
				<Text>Your role can't log intake.</Text>
			</>
		);
	}

	const categories = vocab.categories.filter((c) => c.active);
	const category = categories.find((c) => c.categoryId === categoryId) ?? null;
	const sizes = category
		? vocab.sizes.filter((s) => s.scaleId === category.scaleId && s.active)
		: [];
	const genders = vocab.genders.filter((g) => g.active);
	const conditions = vocab.conditions.filter((c) => c.active);

	const chosen =
		category && sizeId !== null && genderId !== null && conditionId !== null
			? {
					categoryId: category.categoryId,
					sizeId,
					genderId,
					conditionId,
				}
			: null;

	const lastUsed = (() => {
		const last = lines.at(-1);
		if (!last) return null;
		const loc = vocab.locations.find((l) => l.label === last.locationLabel);
		return loc ? { locationId: loc.locationId, label: loc.label } : null;
	})();

	const suggested = chosen ? suggestBin(bins, cells, chosen, lastUsed) : null;
	const fallback = vocab.locations.find((l) => l.active) ?? null;
	const bin =
		binId !== null
			? (vocab.locations.find((l) => l.locationId === binId) ?? null)
			: suggested
				? { locationId: suggested.locationId, label: suggested.label }
				: fallback
					? { locationId: fallback.locationId, label: fallback.label }
					: null;
	const why =
		binId === null && suggested ? suggested.why : "where you last put some";

	const sizeLabelOf = (id: bigint) =>
		vocab.sizes.find((s) => s.sizeId === id)?.label ?? "";

	const add = async () => {
		if (!chosen || !bin) return;
		setBusy(true);
		setError(null);
		try {
			await addLine({
				bagId: bag.bagId,
				categoryId: chosen.categoryId,
				sizeId: chosen.sizeId,
				genderId: chosen.genderId,
				conditionId: chosen.conditionId,
				locationId: bin.locationId,
				count,
			});
			// The selection stays: a bag is many lines, and the next one is
			// usually the same category in a different size. Only the count
			// resets, because that is the part that is always different.
			setJustAdded(
				`${count} added${sizeLabelOf(chosen.sizeId) ? ` · ${sizeLabelOf(chosen.sizeId)}` : ""}`,
			);
			setCount(1);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const total = lines.reduce((n, l) => n + l.count, 0);

	return (
		<>
			<PageHeader
				title={kindLabel(bag.kind)}
				back="/bags"
				right={<SizeTag tone="clay">open</SizeTag>}
			/>
			<Stack gap="md">
				<Choice
					label="Category"
					options={categories.map((c) => ({
						id: c.categoryId,
						label: c.label,
					}))}
					value={categoryId}
					onChange={(v) => {
						setCategoryId(v);
						setSizeId(null);
					}}
				/>
				{category ? (
					<Choice
						label="Size"
						scroll
						options={sizes.map((s) => ({ id: s.sizeId, label: s.label }))}
						value={sizeId}
						onChange={setSizeId}
					/>
				) : null}
				<Group grow align="flex-start">
					<Choice
						label="For"
						options={genders.map((g) => ({ id: g.genderId, label: g.label }))}
						value={genderId}
						onChange={setGenderId}
					/>
					<Choice
						label="Condition"
						options={conditions.map((c) => ({
							id: c.conditionId,
							label: c.label,
						}))}
						value={conditionId}
						onChange={setConditionId}
					/>
				</Group>

				{chosen && bin ? (
					<Stack gap={6}>
						<Text className={classes.eyebrow}>Goes in</Text>
						<Menu position="top-start" withinPortal>
							<Menu.Target>
								<button type="button" className={classes.pick}>
									<span className={classes.pickLabel}>{bin.label}</span>
									<Text size="xs" c="dimmed">
										{why}
									</Text>
									<span aria-hidden="true">▾</span>
								</button>
							</Menu.Target>
							<Menu.Dropdown>
								{vocab.locations
									.filter((l) => l.active)
									.map((l) => (
										<Menu.Item
											key={String(l.locationId)}
											onClick={() => setBinId(l.locationId)}
										>
											{l.label}
										</Menu.Item>
									))}
							</Menu.Dropdown>
						</Menu>
					</Stack>
				) : null}

				<Group gap="md" wrap="nowrap">
					<Stepper value={count} onChange={setCount} label="items" />
					<Button
						style={{ flex: 1 }}
						disabled={!chosen}
						loading={busy}
						onClick={add}
					>
						{chosen ? `Add ${count}` : "Pick all four"}
					</Button>
				</Group>
				{justAdded ? (
					<Text size="sm" c="pine.7" fw={700} aria-live="polite">
						{justAdded}. Pick another size, or change the category.
					</Text>
				) : null}

				{error ? (
					<Alert color="clay" role="alert">
						{error}
					</Alert>
				) : null}

				<Stack gap={6}>
					<Text className={classes.eyebrow}>In this bag · {total}</Text>
					{lines.length === 0 ? (
						<Text c="dimmed" size="sm">
							Nothing yet.
						</Text>
					) : (
						<Stack gap={0}>
							{lines.map((l) => (
								<Group
									key={String(l.lineId)}
									justify="space-between"
									wrap="nowrap"
									className={classes.line}
								>
									<Text>
										{l.categoryLabel} · {l.sizeLabel} · {l.genderLabel} ·{" "}
										{l.conditionLabel}
										<Text component="span" c="dimmed" size="sm">
											{" "}
											→ {l.locationLabel}
										</Text>
									</Text>
									<Group gap="sm" wrap="nowrap">
										<Text fw={700}>{l.count}</Text>
										<button
											type="button"
											className={classes.remove}
											aria-label={`Remove ${l.categoryLabel} ${l.sizeLabel}`}
											onClick={() => void removeLine({ lineId: l.lineId })}
										>
											×
										</button>
									</Group>
								</Group>
							))}
						</Stack>
					)}
				</Stack>

				<Button
					variant={lines.length === 0 ? "outline" : "filled"}
					loading={busy}
					onClick={async () => {
						setBusy(true);
						setError(null);
						try {
							await closeBag({ bagId: bag.bagId });
						} catch (e) {
							setError(e instanceof Error ? e.message : String(e));
						} finally {
							setBusy(false);
						}
					}}
				>
					Close bag
				</Button>
				<Text size="sm" c="dimmed">
					Closing puts these on the shelves. Nothing counts until then.
				</Text>
			</Stack>
		</>
	);
}

function ClosedBag({ bag, lines }: { bag: BagRow; lines: LineRow[] }) {
	const navigate = useNavigate();
	const total = lines.reduce((n, l) => n + l.count, 0);
	return (
		<>
			<PageHeader
				title={kindLabel(bag.kind)}
				back="/bags"
				right={<SizeTag tone="pine">closed</SizeTag>}
			/>
			<Stack gap="lg">
				<div>
					<Title order={2}>On the shelves.</Title>
					<Text c="dimmed">
						{lines.length} {lines.length === 1 ? "line" : "lines"} · {total}{" "}
						{total === 1 ? "item" : "items"} · {bag.openedByName}{" "}
						{whenLabel(bag.openedAt)}
					</Text>
				</div>
				<Stack gap={0}>
					{lines.map((l) => (
						<Group key={String(l.lineId)} justify="space-between" py="xs">
							<div>
								<Text>
									{l.categoryLabel} · {l.sizeLabel} · {l.genderLabel} ·{" "}
									{l.conditionLabel}
								</Text>
								<Text size="xs" c="dimmed">
									{l.locationLabel}
								</Text>
							</div>
							<Text fw={700}>{l.count}</Text>
						</Group>
					))}
				</Stack>
				<Button onClick={() => void navigate({ to: "/bags" })}>
					Back to bags
				</Button>
				<Text size="sm" c="dimmed">
					Closed bags don't reopen. Wrong count? Fix it on the shelf.
				</Text>
			</Stack>
		</>
	);
}

function Choice({
	label,
	options,
	value,
	onChange,
	scroll = false,
}: {
	label: string;
	options: Array<{ id: bigint; label: string }>;
	value: bigint | null;
	onChange: (id: bigint) => void;
	scroll?: boolean;
}) {
	return (
		<Stack gap={6}>
			<Text className={classes.eyebrow}>{label}</Text>
			<div className={scroll ? classes.strip : classes.wrap}>
				{options.map((o) => (
					<button
						key={String(o.id)}
						type="button"
						className={classes.choice}
						data-on={value === o.id ? "true" : undefined}
						onClick={() => onChange(o.id)}
					>
						{o.label}
					</button>
				))}
			</div>
		</Stack>
	);
}
