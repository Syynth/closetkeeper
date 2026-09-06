import { reducers } from "@closetkeeper/bindings";
import { Stack, Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer } from "spacetimedb/react";
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

export const Route = createFileRoute("/genders")({
	component: () => (
		<AuthedPage>
			<Genders />
		</AuthedPage>
	),
});

/**
 * Who a garment is for. Called "For" on screen because that is the word on
 * the intake step and in a request: families and schools ask for a boy's
 * size 6, and the shelves are laid out the same way.
 */
function Genders() {
	const can = useCan();
	const vocab = useVocab();
	const { cells } = useStock({
		genderId: null,
		locationId: null,
		conditionIds: null,
	});
	const add = useReducer(reducers.addGender);
	const update = useReducer(reducers.updateGender);
	const [editing, setEditing] = useState<VocabItem | null>(null);

	const editable = can("inventory.manage");
	const items: VocabItem[] = vocab.genders.map((g) => {
		const n = cells
			.filter((c) => c.genderId === g.genderId)
			.reduce((sum, c) => sum + c.onHand, 0);
		return {
			id: g.genderId,
			label: g.label,
			sortOrder: g.sortOrder,
			active: g.active,
			detail: n > 0 ? `${n} on the shelves` : undefined,
			lockedReason:
				n > 0 && g.active
					? `${n} of these are on the shelves; hand them out first.`
					: undefined,
		};
	});

	const saveRow = async (id: bigint, patch: Partial<VocabItem>) => {
		const row = vocab.genders.find((g) => g.genderId === id);
		if (!row) return;
		await update({
			genderId: id,
			label: patch.label ?? row.label,
			sortOrder: patch.sortOrder ?? row.sortOrder,
			active: patch.active ?? row.active,
		});
	};
	const { move } = useReorder(items, (id, sortOrder) =>
		saveRow(id, { sortOrder }),
	);

	if (!vocab.ready) return null;

	return (
		<>
			<PageHeader title="For" back="/more" />
			<Stack gap="md">
				<AddRow
					label="Add one"
					placeholder="Teen"
					disabled={!editable}
					onAdd={(label) => add({ label })}
				/>
				<VocabList
					items={items}
					canEdit={editable}
					onMove={(id, by) => void move(id, by)}
					onOpen={setEditing}
				/>
				<Text size="sm" c="dimmed">
					Intake asks this for every line, so keep the list short enough to
					answer without thinking.
				</Text>
			</Stack>

			<VocabSheet
				item={editing}
				title="For"
				onClose={() => setEditing(null)}
				onSave={(label, active) =>
					saveRow(editing?.id ?? 0n, { label, active })
				}
			/>
		</>
	);
}
