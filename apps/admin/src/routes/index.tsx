import {
	Alert,
	Button,
	Card,
	Container,
	Group,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "react-oidc-context";
import { useSpacetimeDB } from "spacetimedb/react";
import { Shell, useMyStaff, Wordmark } from "../components/Shell";
import { SizeMarquee, SizeTag } from "../components/SizeTag";
import { ConnectedToDatabase } from "../db";
import classes from "./index.module.css";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const auth = useAuth();

	if (auth.isLoading) {
		return (
			<Container size="xs" className={classes.signIn}>
				<Wordmark />
				<Text c="dimmed" mt="md">
					Loading…
				</Text>
			</Container>
		);
	}

	if (!auth.isAuthenticated || !auth.user?.id_token) {
		return (
			<SignIn
				onSignIn={() => void auth.signinRedirect()}
				error={auth.error?.message ?? null}
			/>
		);
	}

	return (
		<ConnectedToDatabase token={auth.user.id_token}>
			<Shell>
				<Standing email={auth.user.profile.email ?? null} />
			</Shell>
		</ConnectedToDatabase>
	);
}

/**
 * The sign-in page is a door, not a brochure: eyebrow, wordmark, the
 * sizes, one button. Copy appears only after tapping or on error.
 */
function SignIn({
	onSignIn,
	error,
}: {
	onSignIn: () => void;
	error: string | null;
}) {
	return (
		<Container size="xs" className={classes.signIn}>
			<Stack gap="xl" align="center">
				<SizeTag>Staff &amp; volunteers</SizeTag>
				<Title order={1} className={classes.title}>
					Closet<span className={classes.titleAccent}>keeper</span>
				</Title>
				<SizeMarquee />
				<Button onClick={onSignIn} fullWidth>
					Log in
				</Button>
				{error ? (
					<Alert color="clay" title="Sign-in didn't complete" role="alert">
						{error}
					</Alert>
				) : null}
			</Stack>
		</Container>
	);
}

/** What the database thinks of the person in front of it. */
function Standing({ email }: { email: string | null }) {
	const db = useSpacetimeDB();
	const { me, ready } = useMyStaff();

	if (!db.isActive) {
		return (
			<Text c="dimmed" aria-live="polite">
				Connecting to the closet…
			</Text>
		);
	}
	if (!ready) {
		return (
			<Text c="dimmed" aria-live="polite">
				Checking your access…
			</Text>
		);
	}
	if (!me) {
		return (
			<Card>
				<Stack gap="sm">
					<Title order={2}>This email isn't on the staff list yet</Title>
					<Text>
						You're signed in{email ? ` as ${email}` : ""}, but nobody has added
						that address as staff or a volunteer. Ask a staff member to add it,
						then sign in again.
					</Text>
				</Stack>
			</Card>
		);
	}
	return (
		<Stack gap="lg">
			<div>
				<Text c="dimmed" size="sm">
					Signed in{email ? ` as ${email}` : ""}
				</Text>
				<Title order={2} mt={4}>
					You're set up as <SizeTag tone="pine">{me.roleLabel}</SizeTag>
					{me.active ? "" : " (deactivated)"}
				</Title>
			</div>
			<Card>
				<Text fw={600} mb="xs">
					What this role can do
				</Text>
				<Group gap="xs">
					{me.capabilities.map((c) => (
						<SizeTag key={c} tone="muted">
							{c}
						</SizeTag>
					))}
				</Group>
			</Card>
			<Text c="dimmed" size="sm">
				Nothing else is built yet. Inventory, donations, and requests come next.
			</Text>
		</Stack>
	);
}
