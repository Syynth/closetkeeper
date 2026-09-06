import { reducers, tables } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
	Card,
	Collapse,
	Group,
	Stack,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { LockIcon } from "../components/icons";
import { ListGroup, ListRow } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";

export const Route = createFileRoute("/roles/")({
	component: () => (
		<AuthedPage>
			<Roles />
		</AuthedPage>
	),
});

function Roles() {
	const can = useCan();
	const [roles] = useTable(tables.roleOptions);
	const [matrix] = useTable(tables.roleCapabilityMatrix);
	const [creating, setCreating] = useState(false);

	if (!can("role.manage")) {
		return (
			<>
				<PageHeader title="Roles" back="/more" />
				<Card>
					<Text>Your role can't manage roles.</Text>
				</Card>
			</>
		);
	}

	const sorted = [...roles].sort(
		(a, b) =>
			Number(b.system) - Number(a.system) || a.label.localeCompare(b.label),
	);
	const groupsOf = (roleId: bigint) =>
		[
			...new Set(
				matrix
					.filter((c) => c.roleId === roleId && c.granted)
					.map((c) => c.group),
			),
		]
			.join(", ")
			.toLowerCase();

	return (
		<>
			<PageHeader title="Roles" back="/more" />
			<Stack gap="lg">
				<Button
					variant={creating ? "light" : "outline"}
					onClick={() => setCreating((v) => !v)}
				>
					{creating ? "Cancel" : "New role"}
				</Button>
				<Collapse expanded={creating}>
					<NewRoleForm onDone={() => setCreating(false)} />
				</Collapse>
				<ListGroup>
					{sorted.map((r) => (
						<ListRow
							key={r.key}
							title={
								<Group gap="xs">
									<SizeTag tone={r.key === "system_admin" ? "pine" : "tape"}>
										{r.label}
									</SizeTag>
									{r.system ? null : <SizeTag tone="muted">custom</SizeTag>}
								</Group>
							}
							detail={`${r.holders} ${r.holders === 1 ? "person" : "people"}${groupsOf(r.roleId) ? ` · ${groupsOf(r.roleId)}` : ""}`}
							right={
								r.protected ? (
									<Text
										size="xs"
										fw={700}
										c="dimmed"
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 4,
										}}
									>
										<LockIcon /> protected
									</Text>
								) : null
							}
							to="/roles/$roleId"
							params={{ roleId: String(r.roleId) }}
						/>
					))}
				</ListGroup>
				<Text size="sm" c="dimmed">
					Built-in roles can't be deleted. A lock means family data or access;
					only a system administrator changes those.
				</Text>
			</Stack>
		</>
	);
}

function NewRoleForm({ onDone }: { onDone: () => void }) {
	const create = useReducer(reducers.createRole);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const form = useForm({
		initialValues: { label: "", key: "", description: "" },
		validate: {
			label: (v) => (v.trim().length === 0 ? "Give it a name" : null),
			key: (v) =>
				/^[a-z][a-z0-9_]{1,39}$/.test(v)
					? null
					: "lowercase letters, digits, underscores",
		},
	});
	return (
		<Card
			component="form"
			onSubmit={form.onSubmit(async (v) => {
				setBusy(true);
				setError(null);
				try {
					await create({
						key: v.key,
						label: v.label.trim(),
						description: v.description.trim(),
					});
					form.reset();
					onDone();
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
				} finally {
					setBusy(false);
				}
			})}
		>
			<Stack gap="md">
				<Title order={2}>New role</Title>
				<TextInput
					label="Name"
					placeholder="Intake volunteer"
					{...form.getInputProps("label")}
					onChange={(e) => {
						form.setFieldValue("label", e.currentTarget.value);
						if (!form.isDirty("key")) {
							form.setFieldValue(
								"key",
								e.currentTarget.value
									.toLowerCase()
									.replace(/[^a-z0-9]+/g, "_")
									.replace(/^_+|_+$/g, "")
									.slice(0, 40),
							);
						}
					}}
				/>
				<TextInput
					label="Key"
					description="Stable machine name; can't change later."
					{...form.getInputProps("key")}
				/>
				<TextInput
					label="Description"
					placeholder="What this role is for"
					{...form.getInputProps("description")}
				/>
				<Button type="submit" loading={busy}>
					Create role
				</Button>
				{error ? (
					<Alert color="clay" title="Not created" role="alert">
						{error}
					</Alert>
				) : null}
			</Stack>
		</Card>
	);
}
