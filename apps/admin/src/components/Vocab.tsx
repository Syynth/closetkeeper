/**
 * The one shape every vocabulary screen takes: a list you can reorder, a
 * switch that takes a row out of use without deleting anything, and a sheet
 * to rename. Nothing here deletes: a retired row keeps every count that
 * ever referenced it, which is the whole reason these are rows.
 */
import {
	Alert,
	Button,
	Drawer,
	Group,
	Stack,
	Switch,
	Text,
	TextInput,
} from "@mantine/core";
import { type ReactNode, useState } from "react";
import classes from "./Vocab.module.css";

export interface VocabItem {
	id: bigint;
	label: string;
	sortOrder: number;
	active: boolean;
	/** Shown under the name; whatever this vocabulary wants to say. */
	detail?: string;
	/** Whether this row can be taken out of use, and why not. */
	lockedReason?: string;
}

/**
 * Adjacent rows trade sort orders. Two writes, both audited, and the list
 * is left in an order somebody chose rather than one the database happened
 * to return.
 */
export function useReorder(
	items: readonly VocabItem[],
	save: (id: bigint, sortOrder: number) => Promise<unknown>,
) {
	const [busy, setBusy] = useState(false);
	const move = async (id: bigint, by: -1 | 1) => {
		const at = items.findIndex((i) => i.id === id);
		const other = items[at + by];
		const self = items[at];
		if (!other || !self || busy) return;
		setBusy(true);
		try {
			await save(self.id, other.sortOrder);
			await save(other.id, self.sortOrder);
		} finally {
			setBusy(false);
		}
	};
	return { move, busy };
}

export function VocabList({
	items,
	canEdit,
	onMove,
	onOpen,
}: {
	items: readonly VocabItem[];
	canEdit: boolean;
	onMove: (id: bigint, by: -1 | 1) => void;
	onOpen: (item: VocabItem) => void;
}) {
	return (
		<div className={classes.list}>
			{items.map((item, i) => (
				<div key={String(item.id)} className={classes.row}>
					{canEdit ? (
						<div className={classes.handle}>
							<button
								type="button"
								onClick={() => onMove(item.id, -1)}
								disabled={i === 0}
								aria-label={`Move ${item.label} up`}
							>
								▲
							</button>
							<button
								type="button"
								onClick={() => onMove(item.id, 1)}
								disabled={i === items.length - 1}
								aria-label={`Move ${item.label} down`}
							>
								▼
							</button>
						</div>
					) : null}
					<button
						type="button"
						className={classes.name}
						onClick={() => onOpen(item)}
						disabled={!canEdit}
					>
						<span data-off={item.active ? undefined : "true"}>
							{item.label}
						</span>
						{item.detail ? (
							<span className={classes.detail}>{item.detail}</span>
						) : null}
					</button>
					{item.active ? null : (
						<Text size="xs" c="dimmed">
							not in use
						</Text>
					)}
				</div>
			))}
		</div>
	);
}

/** Rename, take out of use, and whatever else this vocabulary needs. */
export function VocabSheet({
	item,
	title,
	onClose,
	onSave,
	extra,
	extraValid = true,
}: {
	item: VocabItem | null;
	title: string;
	onClose: () => void;
	onSave: (label: string, active: boolean) => Promise<unknown>;
	extra?: ReactNode;
	extraValid?: boolean;
}) {
	const [label, setLabel] = useState("");
	const [active, setActive] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [loaded, setLoaded] = useState<string | null>(null);

	// Load the row's values the first time this sheet sees it.
	if (item && loaded !== String(item.id)) {
		setLoaded(String(item.id));
		setLabel(item.label);
		setActive(item.active);
		setError(null);
	}

	return (
		<Drawer
			opened={item !== null}
			onClose={() => {
				setLoaded(null);
				onClose();
			}}
			position="bottom"
			radius="lg"
			size="auto"
			title={title}
		>
			<Stack gap="md" pb="md">
				<TextInput
					label="Name"
					value={label}
					onChange={(e) => setLabel(e.currentTarget.value)}
				/>
				{extra}
				<Switch
					label="In use"
					description={
						item?.lockedReason ?? "Off hides it from intake; the counts stay."
					}
					checked={active}
					disabled={Boolean(item?.lockedReason)}
					onChange={(e) => setActive(e.currentTarget.checked)}
				/>
				<Button
					loading={busy}
					disabled={label.trim().length === 0 || !extraValid}
					onClick={async () => {
						setBusy(true);
						setError(null);
						try {
							await onSave(label.trim(), active);
							setLoaded(null);
							onClose();
						} catch (e) {
							setError(e instanceof Error ? e.message : String(e));
						} finally {
							setBusy(false);
						}
					}}
				>
					Save
				</Button>
				{error ? (
					<Alert color="clay" role="alert">
						{error}
					</Alert>
				) : null}
			</Stack>
		</Drawer>
	);
}

/** The add form every vocabulary screen puts at the top. */
export function AddRow({
	label,
	placeholder,
	onAdd,
	extra,
	extraValid = true,
	disabled = false,
}: {
	label: string;
	placeholder: string;
	onAdd: (name: string) => Promise<unknown>;
	extra?: ReactNode;
	extraValid?: boolean;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	if (disabled) return null;
	if (!open) {
		return (
			<Button variant="outline" onClick={() => setOpen(true)}>
				{label}
			</Button>
		);
	}
	return (
		<Stack gap="sm" className={classes.add}>
			<TextInput
				label="Name"
				placeholder={placeholder}
				value={name}
				autoFocus
				onChange={(e) => setName(e.currentTarget.value)}
			/>
			{extra}
			<Group grow>
				<Button
					variant="subtle"
					onClick={() => {
						setOpen(false);
						setName("");
						setError(null);
					}}
				>
					Cancel
				</Button>
				<Button
					loading={busy}
					disabled={name.trim().length === 0 || !extraValid}
					onClick={async () => {
						setBusy(true);
						setError(null);
						try {
							await onAdd(name.trim());
							setName("");
							setOpen(false);
						} catch (e) {
							setError(e instanceof Error ? e.message : String(e));
						} finally {
							setBusy(false);
						}
					}}
				>
					Add
				</Button>
			</Group>
			{error ? (
				<Alert color="clay" role="alert">
					{error}
				</Alert>
			) : null}
		</Stack>
	);
}
