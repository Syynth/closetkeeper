import { reducers } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
	Container,
	Group,
	Stack,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "react-oidc-context";
import { useReducer, useSpacetimeDB } from "spacetimedb/react";
import { AuthedPage, useMyStaff, Wordmark } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import classes from "./index.module.css";

export const Route = createFileRoute("/welcome")({ component: Welcome });

/**
 * Where an invitation link lands. Before sign-in it is a door with a
 * clearer sign than the front one: you were added, use the email you were
 * invited with, no password. After sign-in it is the first-visit welcome:
 * confirm your name, see your role, and go.
 */
function Welcome() {
	const auth = useAuth();
	if (auth.isLoading) return null;
	if (!auth.isAuthenticated || !auth.user?.id_token) {
		return (
			<Container size="xs" className={classes.signIn}>
				<Stack gap="xl" align="center">
					<SizeTag>You've been added</SizeTag>
					<Wordmark />
					<Text ta="center">
						Tap Log in and use the email you were invited with. There's no
						password; a sign-in link comes by email.
					</Text>
					<Button onClick={() => void auth.signinRedirect()} fullWidth>
						Log in
					</Button>
				</Stack>
			</Container>
		);
	}
	return (
		<AuthedPage>
			<FirstVisit />
		</AuthedPage>
	);
}

function FirstVisit() {
	const db = useSpacetimeDB();
	const { me, ready } = useMyStaff();

	if (!db.isActive || !ready) {
		return (
			<Text c="dimmed" aria-live="polite">
				One moment…
			</Text>
		);
	}
	if (!me) {
		return (
			<Stack gap="sm">
				<Title order={1}>This email isn't on the staff list yet</Title>
				<Text>
					You're signed in, but nobody has added this address as staff or a
					volunteer. Ask the person who invited you to check the email they
					used, then sign in again.
				</Text>
			</Stack>
		);
	}
	if (me.welcomed) return <Navigate to="/" replace />;
	return (
		<WelcomeForm
			key={me.displayName}
			initialName={me.displayName}
			roleLabel={me.roleLabel}
			roleDescription={me.roleDescription}
			labels={me.capabilityLabels}
		/>
	);
}

function WelcomeForm({
	initialName,
	roleLabel,
	roleDescription,
	labels,
}: {
	initialName: string;
	roleLabel: string;
	roleDescription: string;
	labels: readonly string[];
}) {
	const finish = useReducer(reducers.finishWelcome);
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const form = useForm({
		initialValues: { display_name: initialName },
		validate: {
			display_name: (v) => (v.trim().length === 0 ? "Enter your name" : null),
		},
	});
	const first = initialName.split(" ")[0] || "there";

	return (
		<form
			onSubmit={form.onSubmit(async (v) => {
				setBusy(true);
				setError(null);
				try {
					await finish({ displayName: v.display_name.trim() });
					void navigate({ to: "/", replace: true });
				} catch (e) {
					setError(e instanceof Error ? e.message : String(e));
					setBusy(false);
				}
			})}
		>
			<Stack gap="xl">
				<div>
					<Title
						order={1}
						className={classes.title}
						style={{ fontSize: "2.4rem" }}
					>
						Welcome, {first}.
					</Title>
					<Group gap="xs" mt="sm">
						<Text>You're set up as</Text>
						<SizeTag tone="pine">{roleLabel}</SizeTag>
					</Group>
					{roleDescription ? (
						<Text c="dimmed" size="sm" mt={4}>
							{roleDescription}
						</Text>
					) : null}
				</div>
				<TextInput
					label="Is your name right?"
					description="This is how you'll be greeted and listed."
					{...form.getInputProps("display_name")}
				/>
				<div>
					<Text fw={700} mb="xs">
						What you can do
					</Text>
					<Group gap="xs">
						{labels.map((l) => (
							<SizeTag key={l} tone="muted">
								{l}
							</SizeTag>
						))}
					</Group>
				</div>
				<Button type="submit" loading={busy}>
					Go to the closet
				</Button>
				{error ? (
					<Alert color="clay" role="alert">
						{error}
					</Alert>
				) : null}
			</Stack>
		</form>
	);
}
