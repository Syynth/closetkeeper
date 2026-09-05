import { reducers, tables } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
	Card,
	NativeSelect,
	Stack,
	Table,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "react-oidc-context";
import { useReducer, useTable } from "spacetimedb/react";
import { Shell, useMyStaff } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import { ConnectedToDatabase } from "../db";

export const Route = createFileRoute("/staff")({ component: StaffPage });

function StaffPage() {
	const auth = useAuth();
	if (auth.isLoading) return null;
	if (!auth.isAuthenticated || !auth.user?.id_token) {
		return <Text p="lg">Sign in first.</Text>;
	}
	return (
		<ConnectedToDatabase token={auth.user.id_token}>
			<Shell>
				<Staff />
			</Shell>
		</ConnectedToDatabase>
	);
}

function Staff() {
	const { me, ready } = useMyStaff();
	const [directory] = useTable(tables.staffDirectory);
	const [roles] = useTable(tables.roleOptions);

	if (!ready) return <Text c="dimmed">Checking your access…</Text>;
	if (!me?.capabilities.includes("staff.manage")) {
		return (
			<Card>
				<Text>Your role can't manage staff.</Text>
			</Card>
		);
	}

	const sorted = [...directory].sort((a, b) =>
		a.displayName.localeCompare(b.displayName),
	);

	return (
		<Stack gap="xl">
			<Title order={1}>Staff and volunteers</Title>
			<InviteForm
				roles={roles}
				canAssignProtected={me.capabilities.includes("staff.manage_sensitive")}
			/>
			<div>
				<Title order={2} mb="sm">
					Everyone with access
				</Title>
				<Table.ScrollContainer minWidth={520}>
					<Table verticalSpacing="sm">
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Name</Table.Th>
								<Table.Th>Email</Table.Th>
								<Table.Th>Role</Table.Th>
								<Table.Th>Status</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{sorted.map((s) => (
								<Table.Tr key={String(s.staffId)}>
									<Table.Td fw={600}>{s.displayName}</Table.Td>
									<Table.Td>
										{s.email || (
											<Text c="dimmed" span>
												none
											</Text>
										)}
									</Table.Td>
									<Table.Td>
										<SizeTag>{s.roleLabel}</SizeTag>
									</Table.Td>
									<Table.Td>
										{s.active ? (
											<SizeTag tone="pine">active</SizeTag>
										) : (
											<SizeTag tone="muted">deactivated</SizeTag>
										)}
									</Table.Td>
								</Table.Tr>
							))}
						</Table.Tbody>
					</Table>
				</Table.ScrollContainer>
			</div>
		</Stack>
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
 * sign in with this address and the door opens. The copy says exactly that.
 */
function InviteForm({
	roles,
	canAssignProtected,
}: {
	roles: readonly RoleOption[];
	canAssignProtected: boolean;
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
					? `${r.label} (needs a super-admin)`
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
				} catch (e) {
					setStatus({
						kind: "error",
						message: e instanceof Error ? e.message : String(e),
					});
				}
			})}
		>
			<Stack gap="md">
				<div>
					<Title order={2}>Add someone</Title>
					<Text c="dimmed" size="sm" mt={4}>
						They'll get access the first time they sign in with this email.
						Nothing is sent from here; tell them to open the app.
					</Text>
				</div>
				<TextInput
					label="Name"
					placeholder="As they'd like to be greeted"
					{...form.getInputProps("display_name")}
				/>
				<TextInput
					label="Email"
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
