import { reducers, tables } from "@closetkeeper/bindings";
import { Card, Stack, Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import {
	AddRow,
	useReorder,
	type VocabItem,
	VocabList,
	VocabSheet,
} from "../components/Vocab";
import { useStock, useVocab } from "../inventory";

export const Route = createFileRoute("/categories/$categoryId")({
	component: () => (
		<AuthedPage>
			<CategoryEditor />
		</AuthedPage>
	),
});

/**
 * A category and the sizes it uses. The sizes belong to a scale, which
 * other categories may share, so the screen says so plainly rather than
 * pretending each category owns its own list.
 */
function CategoryEditor() {
	const { categoryId } = Route.useParams();
	const id = BigInt(categoryId);
	const can = useCan();
	const vocab = useVocab();
	const [scales] = useTable(tables.scaleOptions);
	const { cells } = useStock({
		genderId: null,
		locationId: null,
		conditionIds: null,
	});
	const updateCategory = useReducer(reducers.updateCategory);
	const addSize = useReducer(reducers.addSize);
	const updateSize = useReducer(reducers.updateSize);
	const [editing, setEditing] = useState<VocabItem | null>(null);
	const [renaming, setRenaming] = useState(false);

	const editable = can("inventory.manage");
	const category = vocab.categories.find((c) => c.categoryId === id);

	const sizes: VocabItem[] = category
		? vocab.sizes
				.filter((s) => s.scaleId === category.scaleId)
				.map((s) => {
					const held = cells
						.filter((c) => c.sizeId === s.sizeId)
						.reduce((n, c) => n + c.onHand, 0);
					return {
						id: s.sizeId,
						label: s.label,
						sortOrder: s.sortOrder,
						active: s.active,
						detail: held > 0 ? `${held} on hand, all categories` : undefined,
						lockedReason:
							held > 0 && s.active
								? `${held} of these are on the shelves; hand them out or move them first.`
								: undefined,
					};
				})
		: [];

	const { move } = useReorder(sizes, async (sizeId, sortOrder) => {
		const s = vocab.sizes.find((x) => x.sizeId === sizeId);
		if (!s) return;
		await updateSize({ sizeId, label: s.label, sortOrder, active: s.active });
	});

	if (!vocab.ready) return null;
	if (!category) {
		return (
			<>
				<PageHeader title="Not found" back="/categories" />
				<Text>That category is gone.</Text>
			</>
		);
	}

	const scale = scales.find((s) => s.scaleId === category.scaleId);
	const shared = vocab.categories.filter(
		(c) => c.scaleId === category.scaleId && c.categoryId !== id && c.active,
	);

	return (
		<>
			<PageHeader
				title={category.label}
				back="/categories"
				right={
					editable ? (
						<button
							type="button"
							onClick={() => setRenaming(true)}
							style={{
								border: 0,
								background: "none",
								color: "var(--mantine-color-pine-7)",
								fontWeight: 700,
								cursor: "pointer",
							}}
						>
							Rename
						</button>
					) : null
				}
			/>
			<Stack gap="md">
				<Card>
					<Text fw={700}>Sizes it uses</Text>
					<Text size="sm" c="dimmed">
						{scale?.label ?? "?"}
						{shared.length > 0
							? `, shared with ${shared.map((c) => c.label).join(", ")}. Editing here changes them too.`
							: ", used by this category only."}
					</Text>
				</Card>
				<AddRow
					label="Add a size"
					placeholder="Youth XXL"
					disabled={!editable}
					onAdd={(label) => addSize({ scaleId: category.scaleId, label })}
				/>
				<VocabList
					items={sizes}
					canEdit={editable}
					onMove={(sizeId, by) => void move(sizeId, by)}
					onOpen={setEditing}
				/>
				<Text size="sm" c="dimmed">
					Arrows set the order intake shows. Off hides a size from intake and
					keeps every count that used it.
				</Text>
			</Stack>

			<VocabSheet
				item={editing}
				title="Size"
				onClose={() => setEditing(null)}
				onSave={(label, active) =>
					updateSize({
						sizeId: editing?.id ?? 0n,
						label,
						sortOrder: editing?.sortOrder ?? 0,
						active,
					})
				}
			/>
			<VocabSheet
				item={
					renaming
						? {
								id: category.categoryId,
								label: category.label,
								sortOrder: category.sortOrder,
								active: category.active,
							}
						: null
				}
				title="Category"
				onClose={() => setRenaming(false)}
				onSave={(label, active) =>
					updateCategory({
						categoryId: category.categoryId,
						label,
						sortOrder: category.sortOrder,
						active,
					})
				}
			/>
		</>
	);
}
