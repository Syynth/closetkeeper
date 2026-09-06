import { reducers, tables } from "@closetkeeper/bindings";
import { NativeSelect, Stack, Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { ListGroup, ListRow } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { AddRow } from "../components/Vocab";
import { useVocab } from "../inventory";

export const Route = createFileRoute("/categories/")({
	component: () => (
		<AuthedPage>
			<Categories />
		</AuthedPage>
	),
});

/** The kinds of thing the closet holds. Sizes live inside each one. */
function Categories() {
	const can = useCan();
	const vocab = useVocab();
	const [scales] = useTable(tables.scaleOptions);
	const add = useReducer(reducers.addCategory);
	const [scaleId, setScaleId] = useState<string>("");

	if (!vocab.ready) return null;
	const editable = can("inventory.manage");
	const scaleOf = (id: bigint) => scales.find((s) => s.scaleId === id);
	const sizesOn = (id: bigint) =>
		vocab.sizes.filter((s) => s.scaleId === id && s.active).length;

	return (
		<>
			<PageHeader title="Categories" back="/more" />
			<Stack gap="md">
				<AddRow
					label="Add a category"
					placeholder="Swimwear"
					disabled={!editable}
					extraValid={scaleId !== ""}
					extra={
						<NativeSelect
							label="Sizes it uses"
							description="Can't be changed later: the counts hang off it."
							data={[
								{ value: "", label: "Choose one" },
								...scales.map((s) => ({
									value: String(s.scaleId),
									label: s.label,
								})),
							]}
							value={scaleId}
							onChange={(e) => setScaleId(e.currentTarget.value)}
						/>
					}
					onAdd={async (label) => {
						await add({ label, scaleId: BigInt(scaleId) });
						setScaleId("");
					}}
				/>
				<ListGroup>
					{vocab.categories.map((c) => (
						<ListRow
							key={String(c.categoryId)}
							title={c.label}
							detail={`${scaleOf(c.scaleId)?.label ?? "?"} · ${sizesOn(c.scaleId)} sizes${c.active ? "" : " · not in use"}`}
							to="/categories/$categoryId"
							params={{ categoryId: String(c.categoryId) }}
						/>
					))}
				</ListGroup>
				<Text size="sm" c="dimmed">
					Open a category to see and edit the sizes it uses.
				</Text>
			</Stack>
		</>
	);
}
