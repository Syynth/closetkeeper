import { reducers, tables } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
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
import { ListGroup, ListRow } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import { OUTCOME_LABEL, whenLabel } from "../format";

export const Route = createFileRoute("/account")({
	component: () => (
		<AuthedPage>
			<Account />
		</AuthedPage>
	),
});

/** Your name, your ways to sign in (each a key to the same account), and your recent sign-ins. */
function Account() {
	const [accounts] = useTable(tables.myAccount);
	const [logins] = useTable(tables.myLogins);
	const [signIns] = useTable(tables.myRecentSignIns);
	const rename = useReducer(reducers.updateMyName);
	const removeLogin = useReducer(reducers.removeMyLogin);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const me = accounts[0] ?? null;

	if (me === null) {
		return (
			<>
				<PageHeader title="Account" back="/more" />
				<Text c="dimmed">This login isn't linked to a staff member.</Text>
			</>
		);
	}

	const sortedLogins = [...logins].sort((a, b) =>
		Number(
			b.lastSeenAt.microsSinceUnixEpoch - a.lastSeenAt.microsSinceUnixEpoch,
		),
	);
	const sortedSignIns = [...signIns].sort((a, b) =>
		Number(b.at.microsSinceUnixEpoch - a.at.microsSinceUnixEpoch),
	);

	return (
		<>
			<PageHeader
				title={me.displayName}
				back="/more"
				right={<SizeTag tone="pine">{me.roleLabel}</SizeTag>}
			/>
			<Stack gap="xl">
				<NameForm
					key={me.displayName}
					initial={me.displayName}
					saved={saved}
					onSave={async (name) => {
						setError(null);
						setSaved(false);
						try {
							await rename({ displayName: name });
							setSaved(true);
						} catch (e) {
							setError(e instanceof Error ? e.message : String(e));
						}
					}}
				/>

				<ListGroup label="Ways to sign in">
					{sortedLogins.map((l) => (
						<ListRow
							key={String(l.linkId)}
							title={l.label}
							detail={
								l.current
									? "this session"
									: `last used ${whenLabel(l.lastSeenAt)}`
							}
							right={
								l.current ? (
									<SizeTag tone="pine">connected</SizeTag>
								) : sortedLogins.length > 1 ? (
									<Button
										variant="subtle"
										size="sm"
										color="clay"
										onClick={async () => {
											setError(null);
											try {
												await removeLogin({ linkId: l.linkId });
											} catch (e) {
												setError(e instanceof Error ? e.message : String(e));
											}
										}}
									>
										Remove
									</Button>
								) : null
							}
						/>
					))}
					<Text size="sm" c="dimmed" pt="xs">
						Each way you sign in is its own key to the same account. More ways
						can be added as they're enabled.
					</Text>
				</ListGroup>

				<ListGroup label="Recent sign-ins">
					{sortedSignIns.length === 0 ? (
						<Text size="sm" c="dimmed">
							None yet.
						</Text>
					) : (
						sortedSignIns.map((s) => (
							<ListRow
								key={String(s.eventId)}
								title={whenLabel(s.at)}
								detail={s.loginLabel}
								right={
									<SizeTag tone={OUTCOME_LABEL[s.outcome]?.tone ?? "muted"}>
										{OUTCOME_LABEL[s.outcome]?.text ?? s.outcome}
									</SizeTag>
								}
							/>
						))
					)}
				</ListGroup>

				{error ? (
					<Alert color="clay" role="alert">
						{error}
					</Alert>
				) : null}
				<div>
					<Title order={3} mb={4}>
						Email
					</Title>
					<Text>{me.email || "none"}</Text>
					<Text size="sm" c="dimmed">
						A staff member changes this for you; it's the address invitations
						match on.
					</Text>
				</div>
			</Stack>
		</>
	);
}

function NameForm({
	initial,
	onSave,
	saved,
}: {
	initial: string;
	onSave: (name: string) => Promise<void>;
	saved: boolean;
}) {
	const form = useForm({
		initialValues: { display_name: initial },
		validate: {
			display_name: (v) => (v.trim().length === 0 ? "Enter your name" : null),
		},
	});
	return (
		<form onSubmit={form.onSubmit((v) => onSave(v.display_name.trim()))}>
			<Stack gap="sm">
				<TextInput label="Name" {...form.getInputProps("display_name")} />
				<Group>
					<Button type="submit" size="md" disabled={!form.isDirty()}>
						Save name
					</Button>
					{saved ? (
						<Text size="sm" c="pine">
							Saved
						</Text>
					) : null}
				</Group>
			</Stack>
		</form>
	);
}
