import { Stack, Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { FilterBar } from "../components/FilterBar";
import { ListGroup, ListRow } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { Empty, Histogram } from "../components/Stock";
import { useStockFilter } from "../filter";
import { spread, totalOf, useStock, useVocab } from "../inventory";
import classes from "./shelves.module.css";

export const Route = createFileRoute("/shelves/")({
	component: () => (
		<AuthedPage>
			<Shelves />
		</AuthedPage>
	),
});

/**
 * What is in the closet, by category. A phone cannot show twenty-five sizes
 * across, so the grid is a category deep; here each row carries its total
 * and a faint picture of how it is spread across sizes, which is what tells
 * you a shelf is lopsided before any number does.
 */
function Shelves() {
	const can = useCan();
	const vocab = useVocab();
	const { filter } = useStockFilter();
	const { cells, ready } = useStock(filter);
	const all = useStock({ ...filter, genderId: null, conditionIds: null }).cells;

	if (!can("inventory.read")) {
		return (
			<>
				<PageHeader title="Shelves" />
				<Text>Your role can't see the shelves.</Text>
			</>
		);
	}
	if (!ready || !vocab.ready) return null;

	const total = totalOf(cells);
	const categories = vocab.categories.filter(
		(c) => c.active || cells.some((x) => x.categoryId === c.categoryId),
	);

	return (
		<>
			<PageHeader
				title="Shelves"
				right={
					<Text c="dimmed" size="sm">
						{total} {total === 1 ? "item" : "items"}
					</Text>
				}
			/>
			<Stack gap="md">
				<FilterBar all={all} />
				{total === 0 ? (
					<Empty>Nothing here yet. Log a bag and it will show up.</Empty>
				) : (
					<ListGroup>
						{categories.map((c) => {
							const n = totalOf(cells, c.categoryId);
							const sizes = vocab.sizes.filter(
								(s) => s.scaleId === c.scaleId && s.active,
							).length;
							const held = new Set(
								cells
									.filter((x) => x.categoryId === c.categoryId && x.onHand > 0)
									.map((x) => String(x.sizeId)),
							).size;
							const empty = Math.max(0, sizes - held);
							return (
								<div key={String(c.categoryId)} className={classes.row}>
									<Histogram counts={spread(cells, c.categoryId)} />
									<div className={classes.rowBody}>
										<ListRow
											title={c.label}
											detail={
												empty === 0
													? "every size covered"
													: `${empty} ${empty === 1 ? "size" : "sizes"} empty`
											}
											right={<span className={classes.count}>{n}</span>}
											to="/shelves/$categoryId"
											params={{ categoryId: String(c.categoryId) }}
										/>
									</div>
								</div>
							);
						})}
					</ListGroup>
				)}
				<Text size="sm" c="dimmed">
					The bars behind each row are its spread across sizes.
				</Text>
			</Stack>
		</>
	);
}
