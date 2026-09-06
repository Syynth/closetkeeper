import { reducers, tables } from "@closetkeeper/bindings";
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
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "react-oidc-context";
import { useReducer, useSpacetimeDB, useTable } from "spacetimedb/react";
import { ListGroup, ListRow } from "../components/ListRow";
import { AuthedPage, useCan, useMyStaff } from "../components/Shell";
import { SizeMarquee, SizeTag } from "../components/SizeTag";
import { whenLabel } from "../format";
import { totalOf, useStock, useVocab } from "../inventory";
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
 * The workbench: one thing to do, then the closet's state. Never the
 * user's own state, which is what the role tag in the frame is for.
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
			{can("inventory.read") ? <Closet /> : null}
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
				Donations, requests and appointments aren't built yet.
			</Text>
		</Stack>
	);
}

const WEEK_MICROS = 7n * 24n * 60n * 60n * 1_000_000n;

/**
 * What the closet looks like right now, in the order someone standing in
 * it would ask: is there a bag half done, what is here, what came in and
 * went out this week, and what is empty.
 */
function Closet() {
	const can = useCan();
	const navigate = useNavigate();
	const vocab = useVocab();
	const { cells, ready } = useStock({
		genderId: null,
		locationId: null,
		conditionIds: null,
	});
	const [bags] = useTable(tables.bagList);
	const [ledger] = useTable(tables.stockLedger);
	const openBag = useReducer(reducers.openBag);
	const [busy, setBusy] = useState(false);

	if (!ready || !vocab.ready) return null;

	const open = [...bags]
		.filter((b) => b.status === "open")
		.sort((a, b) =>
			Number(b.openedAt.microsSinceUnixEpoch - a.openedAt.microsSinceUnixEpoch),
		);
	const total = totalOf(cells);

	const since = BigInt(Date.now()) * 1000n - WEEK_MICROS;
	const week = ledger.filter((m) => m.at.microsSinceUnixEpoch >= since);
	const inThisWeek = week
		.filter((m) => m.kind.startsWith("intake_"))
		.reduce((n, m) => n + m.delta, 0);
	const outThisWeek = week
		.filter((m) => m.kind === "handed_out")
		.reduce((n, m) => n - m.delta, 0);

	// A gap is a size a category could hold and does not. Only categories
	// and sizes still in use: a retired size is not a hole in the shelf.
	const held = new Set(
		cells.filter((c) => c.onHand > 0).map((c) => `${c.categoryId}:${c.sizeId}`),
	);
	const gaps: Array<{ categoryId: bigint; label: string; size: string }> = [];
	for (const c of vocab.categories.filter((x) => x.active)) {
		for (const s of vocab.sizes.filter(
			(x) => x.scaleId === c.scaleId && x.active,
		)) {
			if (!held.has(`${c.categoryId}:${s.sizeId}`))
				gaps.push({ categoryId: c.categoryId, label: c.label, size: s.label });
		}
	}

	const start = async () => {
		setBusy(true);
		try {
			await openBag({ kind: "donated", note: "" });
			void navigate({ to: "/bags" });
		} finally {
			setBusy(false);
		}
	};

	return (
		<Stack gap="lg">
			{open.length > 0 ? (
				<Card>
					<Stack gap="sm">
						<Group gap="xs">
							<SizeTag tone="clay">open</SizeTag>
							<Text fw={700}>
								{open.length === 1
									? "A bag is still open"
									: `${open.length} bags are still open`}
							</Text>
						</Group>
						<Text size="sm" c="dimmed">
							Nothing in {open.length === 1 ? "it" : "them"} counts until
							{open.length === 1 ? " it is" : " they are"} closed.
						</Text>
						<Button
							onClick={() =>
								void navigate({
									to: "/bags/$bagId",
									params: { bagId: String(open[0]?.bagId ?? 0n) },
								})
							}
						>
							Finish it
						</Button>
					</Stack>
				</Card>
			) : can("inventory.write") ? (
				<Button loading={busy} onClick={start} size="lg">
					Log a bag
				</Button>
			) : null}

			<Group grow align="stretch">
				<Figure label="On the shelves" value={total} to="/shelves" />
				<Figure label="In this week" value={inThisWeek} />
				<Figure label="Out this week" value={outThisWeek} />
			</Group>

			{gaps.length > 0 ? (
				<div>
					<Text fw={700} mb="xs">
						Nothing on the shelf
					</Text>
					<Group gap="xs">
						{gaps.slice(0, 12).map((g) => (
							<button
								key={`${g.categoryId}:${g.size}`}
								type="button"
								className={classes.gap}
								onClick={() =>
									void navigate({
										to: "/shelves/$categoryId",
										params: { categoryId: String(g.categoryId) },
									})
								}
							>
								{g.label} · {g.size}
							</button>
						))}
					</Group>
					{gaps.length > 12 ? (
						<Text size="sm" c="dimmed" mt="xs">
							and {gaps.length - 12} more
						</Text>
					) : null}
				</div>
			) : total > 0 ? (
				<Text size="sm" c="dimmed">
					Every size in every category has something in it.
				</Text>
			) : null}

			{open.length === 0 && total === 0 ? (
				<Text size="sm" c="dimmed">
					The closet is empty. Log a bag and it will show up here.
				</Text>
			) : null}

			{ledger.length > 0 ? (
				<div>
					<Text fw={700} mb="xs">
						Lately
					</Text>
					<Stack gap={0}>
						{[...ledger]
							.sort((a, b) =>
								Number(b.at.microsSinceUnixEpoch - a.at.microsSinceUnixEpoch),
							)
							.slice(0, 5)
							.map((m) => (
								<Group
									key={String(m.movementId)}
									justify="space-between"
									className={classes.recent}
								>
									<Text size="sm">
										{m.categoryLabel} · {m.sizeLabel} · {m.genderLabel}
										<Text component="span" c="dimmed">
											{" "}
											· {m.locationLabel}
										</Text>
									</Text>
									<Group gap="sm">
										<Text
											fw={700}
											c={m.delta > 0 ? "pine.7" : "clay.6"}
											size="sm"
										>
											{m.delta > 0 ? `+${m.delta}` : m.delta}
										</Text>
										<Text size="xs" c="dimmed">
											{whenLabel(m.at)}
										</Text>
									</Group>
								</Group>
							))}
					</Stack>
				</div>
			) : null}
		</Stack>
	);
}

function Figure({
	label,
	value,
	to,
}: {
	label: string;
	value: number;
	to?: "/shelves";
}) {
	const navigate = useNavigate();
	return (
		<button
			type="button"
			className={classes.figure}
			onClick={to ? () => void navigate({ to }) : undefined}
			disabled={!to}
		>
			<span className={classes.figureValue}>{value}</span>
			<span className={classes.figureLabel}>{label}</span>
		</button>
	);
}
