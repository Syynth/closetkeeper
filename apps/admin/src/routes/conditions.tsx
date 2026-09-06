import { reducers } from "@closetkeeper/bindings";
import { Stack, Switch, Text } from "@mantine/core";
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

export const Route = createFileRoute("/conditions")({
	component: () => (
		<AuthedPage>
			<Conditions />
		</AuthedPage>
	),
});

/**
 * What shape something is in. "On the shelves" is the load-bearing part: a
 * condition that is not shelved is still counted at intake, for the books
 * and for grant reporting, but never offered to a family.
 */
function Conditions() {
	const can = useCan();
	const vocab = useVocab();
	const { cells } = useStock({
		genderId: null,
		locationId: null,
		conditionIds: null,
	});
	const add = useReducer(reducers.addCondition);
	const update = useReducer(reducers.updateCondition);
	const [editing, setEditing] = useState<VocabItem | null>(null);
	const [shelved, setShelved] = useState(true);
	const [newShelved, setNewShelved] = useState(true);

	const editable = can("inventory.manage");
	const held = (conditionId: bigint) =>
		cells
			.filter((c) => c.conditionId === conditionId)
			.reduce((n, c) => n + c.onHand, 0);

	const items: VocabItem[] = vocab.conditions.map((c) => {
		const n = held(c.conditionId);
		return {
			id: c.conditionId,
			label: c.label,
			sortOrder: c.sortOrder,
			active: c.active,
			detail: c.shelved
				? n > 0
					? `${n} on the shelves`
					: "on the shelves"
				: "counted, never shelved",
			lockedReason:
				n > 0 && c.active
					? `${n} of these are on the shelves; hand them out first.`
					: undefined,
		};
	});

	const saveRow = async (
		id: bigint,
		patch: Partial<VocabItem> & { shelved?: boolean },
	) => {
		const row = vocab.conditions.find((c) => c.conditionId === id);
		if (!row) return;
		await update({
			conditionId: id,
			label: patch.label ?? row.label,
			sortOrder: patch.sortOrder ?? row.sortOrder,
			active: patch.active ?? row.active,
			shelved: patch.shelved ?? row.shelved,
		});
	};
	const { move } = useReorder(items, (id, sortOrder) =>
		saveRow(id, { sortOrder }),
	);

	if (!vocab.ready) return null;

	return (
		<>
			<PageHeader title="Conditions" back="/more" />
			<Stack gap="md">
				<AddRow
					label="Add a condition"
					placeholder="Needs mending"
					disabled={!editable}
					extra={
						<Switch
							label="Goes on the shelves"
							description="Off means it is still counted at intake, but never handed out."
							checked={newShelved}
							onChange={(e) => setNewShelved(e.currentTarget.checked)}
						/>
					}
					onAdd={async (label) => {
						await add({ label, shelved: newShelved });
						setNewShelved(true);
					}}
				/>
				<VocabList
					items={items}
					canEdit={editable}
					onMove={(id, by) => void move(id, by)}
					onOpen={(item) => {
						const row = vocab.conditions.find((c) => c.conditionId === item.id);
						setShelved(row?.shelved ?? true);
						setEditing(item);
					}}
				/>
				<Text size="sm" c="dimmed">
					Every count carries a condition, so this list is hard to change once
					it is in use. Retire rather than rename when the meaning shifts.
				</Text>
			</Stack>

			<VocabSheet
				item={editing}
				title="Condition"
				onClose={() => setEditing(null)}
				extra={
					<Switch
						label="Goes on the shelves"
						description="Off means it is still counted, but never handed out."
						checked={shelved}
						onChange={(e) => setShelved(e.currentTarget.checked)}
					/>
				}
				onSave={(label, active) =>
					saveRow(editing?.id ?? 0n, { label, active, shelved })
				}
			/>
		</>
	);
}
