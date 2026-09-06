/**
 * One filter control for every stock screen. The bar says what you are
 * looking at; it opens one sheet holding every axis, each option carrying
 * its own count so the cost of a choice is visible before you make it.
 * Another axis later is a group in the sheet, not another control here.
 */
import { Button, Drawer, Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useStockFilter } from "../filter";
import {
	type Cell,
	isFiltered,
	matches,
	NO_FILTER,
	type StockFilter,
	useVocab,
} from "../inventory";
import classes from "./FilterBar.module.css";

/** All cells before filtering, so option counts can say what each choice is worth. */
export function FilterBar({ all }: { all: readonly Cell[] }) {
	const { filter, setFilter } = useStockFilter();
	const vocab = useVocab();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<StockFilter>(filter);

	const genderLabel =
		filter.genderId === null
			? "Everyone"
			: (vocab.genders.find((g) => g.genderId === filter.genderId)?.label ??
				"Everyone");
	const binLabel =
		filter.locationId === null
			? "All bins"
			: (vocab.locations.find((l) => l.locationId === filter.locationId)
					?.label ?? "All bins");
	const conditionLabel =
		filter.conditionIds === null
			? vocab.conditions
					.filter((c) => c.shelved)
					.map((c) => c.label)
					.join(", ")
			: vocab.conditions
					.filter((c) => filter.conditionIds?.includes(c.conditionId))
					.map((c) => c.label)
					.join(", ") || "Nothing";

	const narrowed = isFiltered(filter);
	const countWith = (patch: Partial<StockFilter>) => {
		const f = { ...draft, ...patch };
		return all.filter((c) => matches(c, f)).reduce((n, c) => n + c.onHand, 0);
	};
	const draftTotal = all
		.filter((c) => matches(c, draft))
		.reduce((n, c) => n + c.onHand, 0);

	return (
		<>
			<div className={classes.bar}>
				<button
					type="button"
					className={classes.pill}
					data-on={narrowed ? "true" : undefined}
					onClick={() => {
						setDraft(filter);
						setOpen(true);
					}}
				>
					<span className={classes.key}>Showing</span>
					<span className={classes.value}>
						{[genderLabel, binLabel, conditionLabel].join(" · ")}
					</span>
					<span className={classes.caret} aria-hidden="true">
						▾
					</span>
				</button>
				{narrowed ? (
					<button
						type="button"
						className={classes.clear}
						onClick={() => setFilter(NO_FILTER)}
					>
						Clear
					</button>
				) : null}
			</div>

			<Drawer
				opened={open}
				onClose={() => setOpen(false)}
				position="bottom"
				title="Showing"
				radius="lg"
				size="auto"
			>
				<Stack gap="lg" pb="md">
					<Group justify="space-between">
						<Text fw={700}>For</Text>
						<Button
							variant="subtle"
							size="compact-sm"
							onClick={() => setDraft(NO_FILTER)}
						>
							Clear all
						</Button>
					</Group>
					<div className={classes.grid}>
						<Option
							label="Everyone"
							count={countWith({ genderId: null })}
							on={draft.genderId === null}
							onClick={() => setDraft({ ...draft, genderId: null })}
						/>
						{vocab.genders
							.filter((g) => g.active)
							.map((g) => (
								<Option
									key={String(g.genderId)}
									label={g.label}
									count={countWith({ genderId: g.genderId })}
									on={draft.genderId === g.genderId}
									onClick={() => setDraft({ ...draft, genderId: g.genderId })}
								/>
							))}
					</div>

					<Text fw={700}>In</Text>
					<div className={classes.grid}>
						<Option
							label="All bins"
							count={countWith({ locationId: null })}
							on={draft.locationId === null}
							onClick={() => setDraft({ ...draft, locationId: null })}
						/>
						{vocab.locations
							.filter((l) => l.active)
							.map((l) => (
								<Option
									key={String(l.locationId)}
									label={l.label}
									count={countWith({ locationId: l.locationId })}
									on={draft.locationId === l.locationId}
									onClick={() =>
										setDraft({ ...draft, locationId: l.locationId })
									}
								/>
							))}
					</div>

					<Text fw={700}>Condition</Text>
					<div className={classes.grid}>
						{vocab.conditions
							.filter((c) => c.active)
							.map((c) => {
								const current =
									draft.conditionIds ??
									vocab.conditions
										.filter((x) => x.shelved)
										.map((x) => x.conditionId);
								const on = current.includes(c.conditionId);
								return (
									<Option
										key={String(c.conditionId)}
										label={c.label}
										count={countWith({ conditionIds: [c.conditionId] })}
										on={on}
										onClick={() =>
											setDraft({
												...draft,
												conditionIds: on
													? current.filter((id) => id !== c.conditionId)
													: [...current, c.conditionId],
											})
										}
									/>
								);
							})}
					</div>

					<Button
						onClick={() => {
							setFilter(draft);
							setOpen(false);
						}}
					>
						Show {draftTotal} {draftTotal === 1 ? "item" : "items"}
					</Button>
				</Stack>
			</Drawer>
		</>
	);
}

function Option({
	label,
	count,
	on,
	onClick,
}: {
	label: string;
	count: number;
	on: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={classes.option}
			data-on={on ? "true" : undefined}
			onClick={onClick}
			aria-pressed={on}
		>
			<span>{label}</span>
			<span className={classes.count}>{count}</span>
		</button>
	);
}
