import { reducers, tables } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
	Card,
	NativeSelect,
	Stack,
	Switch,
	Text,
	TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan, useMyStaff } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import { whenLabel } from "../format";

export const Route = createFileRoute("/staff/$staffId")({
	component: () => (
		<AuthedPage>
			<Person />
		</AuthedPage>
	),
});

function useStaffDirectory() {
	const [rows] = useTable(tables.staffDirectory);
	return rows;
}
type Entry = ReturnType<typeof useStaffDirectory>[number];

/**
 * One staff member: name, the email that is their door, role, and whether
 * the door is open. Save applies only what changed, each through its own
 * audited reducer. The form remounts when the record changes underneath it.
 */
function Person() {
	const { staffId } = Route.useParams();
	const can = useCan();
	const directory = useStaffDirectory();
	const person = directory.find((s) => String(s.staffId) === staffId) ?? null;

	if (!can("staff.manage")) {
		return (
			<>
				<PageHeader title="Person" back="/staff" />
				<Card>
					<Text>Your role can't manage staff.</Text>
				</Card>
			</>
		);
	}
	if (person === null) {
		return (
			<>
				<PageHeader title="Person" back="/staff" />
				<Text c="dimmed">Loading…</Text>
			</>
		);
	}
	const key = `${person.staffId}:${person.displayName}:${person.email}:${person.roleKey}:${person.active}`;
	return <PersonForm key={key} person={person} />;
}

function PersonForm({ person }: { person: Entry }) {
	const can = useCan();
	const { me } = useMyStaff();
	const [roles] = useTable(tables.roleOptions);
	const setPerson = useReducer(reducers.setStaffPerson);
	const setRole = useReducer(reducers.setStaffRole);
	const setActive = useReducer(reducers.setStaffActive);
	const [status, setStatus] = useState<
		| { kind: "idle" }
		| { kind: "busy" }
		| { kind: "saved" }
		| { kind: "error"; message: string }
	>({ kind: "idle" });

	const isMe = me !== null && person.staffId === me.staffId;
	const canAssignProtected = can("staff.manage_sensitive");

	const form = useForm({
		initialValues: {
			display_name: person.displayName,
			email: person.email,
			role_key: person.roleKey,
			active: person.active,
		},
		validate: {
			display_name: (v) => (v.trim().length === 0 ? "Enter their name" : null),
			email: (v) =>
				/^[^\s@]+@[^\s@]+$/.test(v.trim())
					? null
					: "Enter the email they sign in with",
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
			disabled: r.protected && !canAssignProtected && r.key !== person.roleKey,
		}));

	async function save(values: typeof form.values) {
		setStatus({ kind: "busy" });
		try {
			const name = values.display_name.trim();
			const email = values.email.trim().toLowerCase();
			if (name !== person.displayName || email !== person.email) {
				await setPerson({ staffId: person.staffId, displayName: name, email });
			}
			if (values.role_key !== person.roleKey) {
				await setRole({ staffId: person.staffId, roleKey: values.role_key });
			}
			if (values.active !== person.active) {
				await setActive({ staffId: person.staffId, active: values.active });
			}
			setStatus({ kind: "saved" });
		} catch (e) {
			setStatus({
				kind: "error",
				message: e instanceof Error ? e.message : String(e),
			});
		}
	}

	return (
		<>
			<PageHeader
				title={person.displayName}
				back="/staff"
				right={
					<SizeTag tone={person.roleKey === "system_admin" ? "pine" : "tape"}>
						{person.roleLabel}
					</SizeTag>
				}
			/>
			<form onSubmit={form.onSubmit(save)}>
				<Stack gap="lg">
					<TextInput label="Name" {...form.getInputProps("display_name")} />
					<TextInput
						label="Email"
						description={`${person.displayName.split(" ")[0]} signs in with this address. Changing it changes the door.`}
						type="email"
						inputMode="email"
						autoCapitalize="none"
						{...form.getInputProps("email")}
					/>
					<NativeSelect
						label="Role"
						data={options}
						{...form.getInputProps("role_key")}
					/>
					<Card>
						<Switch
							label="Active"
							description={
								isMe
									? "You can't deactivate yourself."
									: "Off keeps the record, closes the door."
							}
							disabled={isMe}
							{...form.getInputProps("active", { type: "checkbox" })}
						/>
					</Card>
					<Text size="sm" c="dimmed">
						Invited {whenLabel(person.invitedAt)} ·{" "}
						{person.hasSignedIn
							? `last signed in ${whenLabel(person.lastSeenAt)}`
							: "not signed in yet"}
					</Text>
					<Button
						type="submit"
						loading={status.kind === "busy"}
						disabled={!form.isDirty()}
					>
						Save
					</Button>
					{status.kind === "saved" ? (
						<Alert color="pine" title="Saved" role="status" />
					) : null}
					{status.kind === "error" ? (
						<Alert color="clay" title="Not saved" role="alert">
							{status.message}
						</Alert>
					) : null}
				</Stack>
			</form>
		</>
	);
}
