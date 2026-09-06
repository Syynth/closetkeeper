import { tables } from "@closetkeeper/bindings";
import {
	Alert,
	Button,
	Card,
	Container,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "react-oidc-context";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { ListGroup, ListRow } from "../components/ListRow";
import { AuthedPage, useCan, useMyStaff } from "../components/Shell";
import { SizeMarquee, SizeTag } from "../components/SizeTag";
import classes from "./index.module.css";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const auth = useAuth();

	if (auth.isLoading) {
		return (
			<Container size="xs" className={classes.signIn}>
				<Text c="dimmed">Loading…</Text>
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
		<AuthedPage>
			<Dashboard />
		</AuthedPage>
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

/**
 * The workbench. Until there is inventory to act on, it shows the closet's
 * people, which is the state that exists. Nothing about the user beyond
 * the role tag in the frame.
 */
function Dashboard() {
	const db = useSpacetimeDB();
	const { me, ready } = useMyStaff();
	const can = useCan();
	const [directory] = useTable(tables.staffDirectory);
	const [roles] = useTable(tables.roleOptions);

	if (!db.isActive) {
		return (
			<Text c="dimmed" aria-live="polite">
				Connecting…
			</Text>
		);
	}
	if (!ready) return null;
	if (!me) {
		return (
			<Card>
				<Stack gap="sm">
					<Title order={2}>This email isn't on the staff list yet</Title>
					<Text>Ask a staff member to add it, then sign in again.</Text>
				</Stack>
			</Card>
		);
	}
	if (!me.active) {
		return (
			<Card>
				<Title order={2}>This account is deactivated</Title>
			</Card>
		);
	}
	if (!me.welcomed) return <Navigate to="/welcome" replace />;

	const active = directory.filter((s) => s.active).length;
	const notYet = directory.filter((s) => s.active && !s.hasSignedIn).length;

	return (
		<Stack gap="lg">
			{can("staff.manage") ? (
				<ListGroup label="People">
					<ListRow
						title="Staff & volunteers"
						detail={notYet > 0 ? `${notYet} haven't signed in yet` : undefined}
						right={<Text c="dimmed">{active}</Text>}
						to="/staff"
					/>
					{can("role.manage") ? (
						<ListRow
							title="Roles"
							right={<Text c="dimmed">{roles.length}</Text>}
							to="/roles"
						/>
					) : null}
				</ListGroup>
			) : null}
			<Text c="dimmed" size="sm">
				Inventory, donations, and requests aren't built yet.
			</Text>
		</Stack>
	);
}
