import { reducers } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
	Drawer,
	Group,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer } from "spacetimedb/react";
import { FilterBar } from "../components/FilterBar";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import { Empty, SizeCell, Stepper } from "../components/Stock";
import { useStockFilter } from "../filter";
import { binsFor, type Cell, useStock, useVocab } from "../inventory";
import classes from "./shelves.module.css";

export const Route = createFileRoute("/shelves/$categoryId")({
	component: () => (
		<AuthedPage>
			<Category />
		</AuthedPage>
	),
});

function Category() {
	const { categoryId } = Route.useParams();
	const id = BigInt(categoryId);
	const vocab = useVocab();
	const { filter } = useStockFilter();
	const { cells, bins, ready } = useStock(filter);
	const all = useStock({ ...filter, genderId: null, conditionIds: null }).cells;
	const [openSize, setOpenSize] = useState<bigint | null>(null);

	if (!ready || !vocab.ready) return null;
	const category = vocab.categories.find((c) => c.categoryId === id);
	if (!category) {
		return (
			<>
				<PageHeader title="Not found" back="/shelves" />
				<Text>That category is gone.</Text>
			</>
		);
	}

	const mine = cells.filter((c) => c.categoryId === id);
	const total = mine.reduce((n, c) => n + c.onHand, 0);
	const countIn = (sizeId: bigint) =>
		mine.filter((c) => c.sizeId === sizeId).reduce((n, c) => n + c.onHand, 0);

	// A category's sizes are its scale's, in the scale's order. A retired size
	// still shows while it holds something: the count is the truth, not the row.
	const sizes = vocab.sizes.filter(
		(s) =>
			s.scaleId === category.scaleId &&
			(s.active || mine.some((c) => c.sizeId === s.sizeId && c.onHand > 0)),
	);
	const max = Math.max(...sizes.map((s) => countIn(s.sizeId)), 1);

	return (
		<>
			<PageHeader
				title={category.label}
				back="/shelves"
				right={<span className={classes.count}>{total}</span>}
			/>
			<Stack gap="md">
				<FilterBar all={all.filter((c) => c.categoryId === id)} />
				{sizes.length === 0 ? (
					<Empty>This category has no sizes yet.</Empty>
				) : (
					<div className={classes.grid}>
						{sizes.map((s) => (
							<SizeCell
								key={String(s.sizeId)}
								label={s.label}
								count={countIn(s.sizeId)}
								max={max}
								onClick={() => setOpenSize(s.sizeId)}
							/>
						))}
					</div>
				)}
				<Text size="sm" c="dimmed">
					Tap a size to hand out or fix a bin's count.
				</Text>
			</Stack>

			<SizeSheet
				sizeId={openSize}
				cells={mine}
				bins={bins}
				categoryLabel={category.label}
				sizeLabel={vocab.sizes.find((s) => s.sizeId === openSize)?.label ?? ""}
				onClose={() => setOpenSize(null)}
			/>
		</>
	);
}

type Bin = {
	slotId: bigint;
	locationId: bigint;
	locationLabel: string;
	locationSort: number;
	onHand: number;
};

/**
 * What a cell can do. It asks only what it has to: one slot behind the cell
 * and it never asks which; one bin holding it and it never asks where.
 */
function SizeSheet({
	sizeId,
	cells,
	bins,
	categoryLabel,
	sizeLabel,
	onClose,
}: {
	sizeId: bigint | null;
	cells: readonly Cell[];
	bins: readonly Bin[];
	categoryLabel: string;
	sizeLabel: string;
	onClose: () => void;
}) {
	const can = useCan();
	const handOut = useReducer(reducers.handOut);
	const correct = useReducer(reducers.correctCount);
	const [slotId, setSlotId] = useState<bigint | null>(null);
	const [binId, setBinId] = useState<bigint | null>(null);
	const [count, setCount] = useState(1);
	const [correcting, setCorrecting] = useState(false);
	const [newCount, setNewCount] = useState("");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const here = sizeId === null ? [] : cells.filter((c) => c.sizeId === sizeId);
	const withStock = here.filter((c) => c.onHand > 0);
	const slot =
		withStock.find((c) => c.slotId === slotId) ??
		(withStock.length === 1 ? withStock[0] : null);
	const slotBins = slot ? binsFor(bins, slot.slotId) : [];
	const bin =
		slotBins.find((b) => b.locationId === binId) ??
		(slotBins.length === 1 ? slotBins[0] : null);

	const close = () => {
		setSlotId(null);
		setBinId(null);
		setCount(1);
		setCorrecting(false);
		setNewCount("");
		setReason("");
		setError(null);
		onClose();
	};

	const run = async (fn: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await fn();
			close();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Drawer
			opened={sizeId !== null}
			onClose={close}
			position="bottom"
			radius="lg"
			size="auto"
			title={
				<Group gap="xs">
					<Text fw={700}>
						{categoryLabel} · {sizeLabel}
					</Text>
				</Group>
			}
		>
			<Stack gap="lg" pb="md">
				{withStock.length === 0 ? (
					<Text c="dimmed">Nothing of this size on the shelves.</Text>
				) : null}

				{withStock.length > 1 && !slot ? (
					<Stack gap="xs">
						<Text fw={700}>Which ones</Text>
						{withStock.map((c) => (
							<button
								key={String(c.slotId)}
								type="button"
								className={classes.pick}
								onClick={() => setSlotId(c.slotId)}
							>
								<span>
									{c.genderLabel} · {c.conditionLabel}
								</span>
								<span className={classes.pickCount}>{c.onHand}</span>
							</button>
						))}
					</Stack>
				) : null}

				{slot ? (
					<>
						<Group gap="xs">
							<SizeTag tone="pine">{slot.genderLabel}</SizeTag>
							<SizeTag>{slot.conditionLabel}</SizeTag>
							<Text fw={700}>{slot.onHand} on hand</Text>
						</Group>

						{slotBins.length > 1 && !bin ? (
							<Stack gap="xs">
								<Text fw={700}>Take from</Text>
								{slotBins.map((b) => (
									<button
										key={String(b.locationId)}
										type="button"
										className={classes.pick}
										onClick={() => setBinId(b.locationId)}
									>
										<span>{b.locationLabel}</span>
										<span className={classes.pickCount}>{b.onHand}</span>
									</button>
								))}
							</Stack>
						) : null}

						{bin && !correcting ? (
							<>
								<Text c="dimmed" size="sm">
									{slotBins.length === 1
										? `All ${bin.onHand} are in ${bin.locationLabel}.`
										: `${bin.onHand} in ${bin.locationLabel}.`}
								</Text>
								{can("inventory.write") ? (
									<>
										<Group gap="md" wrap="nowrap">
											<Stepper
												value={count}
												onChange={setCount}
												max={bin.onHand}
												label="to hand out"
											/>
											<Button
												style={{ flex: 1 }}
												loading={busy}
												onClick={() =>
													run(() =>
														handOut({
															slotId: slot.slotId,
															locationId: bin.locationId,
															count,
															note: "",
														}),
													)
												}
											>
												Hand out {count}
											</Button>
										</Group>
										<Button
											variant="subtle"
											onClick={() => {
												setCorrecting(true);
												setNewCount(String(bin.onHand));
											}}
										>
											Fix the count in {bin.locationLabel}
										</Button>
									</>
								) : (
									<Text c="dimmed" size="sm">
										Your role can see the shelves but not change them.
									</Text>
								)}
							</>
						) : null}

						{bin && correcting ? (
							<Stack gap="md">
								<Text fw={700}>Count in {bin.locationLabel}</Text>
								<Group gap="md" align="flex-end">
									<Text c="dimmed">App says {bin.onHand}</Text>
									<TextInput
										label="Actually"
										type="number"
										inputMode="numeric"
										value={newCount}
										onChange={(e) => setNewCount(e.currentTarget.value)}
										style={{ width: "7rem" }}
									/>
								</Group>
								<TextInput
									label="Why"
									placeholder="counted the bin"
									value={reason}
									onChange={(e) => setReason(e.currentTarget.value)}
								/>
								<Button
									loading={busy}
									disabled={reason.trim().length === 0}
									onClick={() =>
										run(() =>
											correct({
												slotId: slot.slotId,
												locationId: bin.locationId,
												onHand: Number(newCount) || 0,
												note: reason,
											}),
										)
									}
								>
									Set {bin.locationLabel} to {Number(newCount) || 0}
								</Button>
								<Text size="sm" c="dimmed">
									Goes in the ledger as a correction, with your name and the
									reason.
								</Text>
							</Stack>
						) : null}
					</>
				) : null}

				{error ? (
					<Alert color="clay" role="alert">
						{error}
					</Alert>
				) : null}
			</Stack>
		</Drawer>
	);
}
