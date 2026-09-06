import { reducers, tables } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
	Card,
	Collapse,
	NativeSelect,
	Stack,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { ListGroup, ListRow } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";

export const Route = createFileRoute("/staff/")({
	component: () => (
		<AuthedPage>
			<Staff />
		</AuthedPage>
	),
});

function Staff() {
	const can = useCan();
	const [directory] = useTable(tables.staffDirectory);
	const [roles] = useTable(tables.roleOptions);
	const [adding, setAdding] = useState(false);

	if (!can("staff.manage")) {
		return (
			<>
				<PageHeader title="Staff & volunteers" back="/more" />
				<Card>
					<Text>Your role can't manage staff.</Text>
				</Card>
			</>
		);
	}

	const sorted = [...directory].sort((a, b) =>
		a.displayName.localeCompare(b.displayName),
	);
	const notYet = sorted
		.filter((s) => s.active && !s.hasSignedIn)
		.map((s) => s.displayName);

	return (
		<>
			<PageHeader title="Staff & volunteers" back="/more" />
			<Stack gap="lg">
				<Button
					onClick={() => setAdding((v) => !v)}
					variant={adding ? "light" : "filled"}
				>
					{adding ? "Cancel" : "Add someone"}
				</Button>
				<Collapse expanded={adding}>
					<AddForm
						roles={roles}
						canAssignProtected={can("staff.manage_sensitive")}
						onDone={() => setAdding(false)}
					/>
				</Collapse>
				<ListGroup>
					{sorted.map((s) => (
						<ListRow
							key={String(s.staffId)}
							title={s.displayName}
							detail={s.email || "no email"}
							right={
								<>
									<SizeTag
										tone={s.roleKey === "system_admin" ? "pine" : "tape"}
									>
										{s.roleLabel}
									</SizeTag>
									{s.active ? null : (
										<SizeTag tone="muted">deactivated</SizeTag>
									)}
								</>
							}
							to="/staff/$staffId"
							params={{ staffId: String(s.staffId) }}
						/>
					))}
				</ListGroup>
				{notYet.length > 0 ? (
					<Text size="sm" c="dimmed">
						Hasn't signed in yet: {notYet.join(", ")}
					</Text>
				) : null}
			</Stack>
		</>
	);
}

type RoleOption = {
	key: string;
	label: string;
	description: string;
	protected: boolean;
};

/**
 * Adding someone creates their invitation. Nothing is emailed by us: they
 * sign in with this address and the door opens.
 */
function AddForm({
	roles,
	canAssignProtected,
	onDone,
}: {
	roles: readonly RoleOption[];
	canAssignProtected: boolean;
	onDone: () => void;
}) {
	const invite = useReducer(reducers.inviteStaff);
	const [status, setStatus] = useState<
		| { kind: "idle" }
		| { kind: "busy" }
		| { kind: "done"; email: string }
		| { kind: "error"; message: string }
	>({ kind: "idle" });

	const form = useForm({
		initialValues: { display_name: "", email: "", role_key: "volunteer" },
		validate: {
			display_name: (v) => (v.trim().length === 0 ? "Enter their name" : null),
			email: (v) =>
				/^[^\s@]+@[^\s@]+$/.test(v.trim())
					? null
					: "Enter the email they'll sign in with",
		},
	});

	const options = [...roles]
		.sort((a, b) => a.label.localeCompare(b.label))
		.map((r) => ({
			value: r.key,
			label:
				r.protected && !canAssignProtected
					? `${r.label} (needs a system administrator)`
					: r.label,
			disabled: r.protected && !canAssignProtected,
		}));
	const chosen = roles.find((r) => r.key === form.values.role_key);

	return (
		<Card
			component="form"
			onSubmit={form.onSubmit(async (values) => {
				setStatus({ kind: "busy" });
				try {
					await invite({
						email: values.email.trim(),
						displayName: values.display_name.trim(),
						roleKey: values.role_key,
					});
					setStatus({ kind: "done", email: values.email.trim() });
					form.reset();
					onDone();
				} catch (e) {
					setStatus({
						kind: "error",
						message: e instanceof Error ? e.message : String(e),
					});
				}
			})}
		>
			<Stack gap="md">
				<Title order={2}>Add someone</Title>
				<TextInput
					label="Name"
					placeholder="As they'd like to be greeted"
					{...form.getInputProps("display_name")}
				/>
				<TextInput
					label="Email"
					description="They sign in with this. Nothing is sent from here."
					type="email"
					inputMode="email"
					autoCapitalize="none"
					placeholder="name@example.org"
					{...form.getInputProps("email")}
				/>
				<NativeSelect
					label="Role"
					data={options}
					description={chosen?.description ?? ""}
					{...form.getInputProps("role_key")}
				/>
				<Button type="submit" loading={status.kind === "busy"}>
					Add to staff
				</Button>
				{status.kind === "done" ? (
					<Alert color="pine" title="Added" role="status">
						{status.email} can sign in now.
					</Alert>
				) : null}
				{status.kind === "error" ? (
					<Alert color="clay" title="Not added" role="alert">
						{status.message}
					</Alert>
				) : null}
			</Stack>
		</Card>
	);
}
