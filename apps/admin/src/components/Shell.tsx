/**
 * The signed-in frame. On a phone: a slim header and a bottom tab bar with
 * only the destinations that exist. At a desk: a sidebar with the same
 * destinations grouped, and more room, never more features.
 */
import { tables } from "@closetkeeper/bindings";
import { Text } from "@mantine/core";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "react-oidc-context";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { ConnectedToDatabase } from "../db";
import { StockFilterProvider } from "../filter";
import { BagIcon, HomeIcon, MoreIcon, ShelfIcon } from "./icons";
import classes from "./Shell.module.css";
import { SizeTag } from "./SizeTag";

export function useMyStaff() {
	const [rows, ready] = useTable(tables.myStaff);
	return { me: rows[0] ?? null, ready };
}

export function useCan() {
	const { me } = useMyStaff();
	return (capability: string) => me?.capabilities.includes(capability) ?? false;
}

export function Wordmark({ small = false }: { small?: boolean }) {
	return (
		<span className={classes.wordmark} data-small={small ? "true" : undefined}>
			Closet<span className={classes.wordmarkAccent}>keeper</span>
		</span>
	);
}

/** Gate a route behind sign-in and the database connection, then frame it. */
export function AuthedPage({ children }: { children: ReactNode }) {
	const auth = useAuth();
	const navigate = useNavigate();
	if (auth.isLoading) return null;
	if (!auth.isAuthenticated || !auth.user?.id_token) {
		void navigate({ to: "/", replace: true });
		return null;
	}
	return (
		<ConnectedToDatabase token={auth.user.id_token}>
			<StockFilterProvider>
				<Shell>{children}</Shell>
			</StockFilterProvider>
		</ConnectedToDatabase>
	);
}

function RoleTag() {
	const db = useSpacetimeDB();
	const { me, ready } = useMyStaff();
	if (!db.isActive) return <SizeTag tone="muted">connecting</SizeTag>;
	if (!ready) return null;
	if (!me) return <SizeTag tone="muted">not on the list</SizeTag>;
	return <SizeTag tone={me.active ? "pine" : "clay"}>{me.roleLabel}</SizeTag>;
}

type Dest = {
	to:
		| "/"
		| "/more"
		| "/shelves"
		| "/bags"
		| "/bins"
		| "/categories"
		| "/conditions"
		| "/genders"
		| "/staff"
		| "/roles"
		| "/access"
		| "/audit"
		| "/export"
		| "/account";
	label: string;
	group: string;
};

function useDestinations(): Dest[] {
	const can = useCan();
	const out: Dest[] = [];
	if (can("inventory.read")) {
		out.push({ to: "/shelves", label: "Shelves", group: "The closet" });
		out.push({ to: "/bags", label: "Bags", group: "The closet" });
		out.push({ to: "/bins", label: "Bins & places", group: "The closet" });
	}
	if (can("inventory.manage")) {
		out.push({ to: "/categories", label: "Categories", group: "The closet" });
		out.push({ to: "/conditions", label: "Conditions", group: "The closet" });
		out.push({ to: "/genders", label: "For", group: "The closet" });
	}
	if (can("staff.manage"))
		out.push({ to: "/staff", label: "Staff & volunteers", group: "People" });
	if (can("role.manage"))
		out.push({ to: "/roles", label: "Roles", group: "People" });
	if (can("staff.manage"))
		out.push({ to: "/audit", label: "Audit log", group: "Records" });
	if (can("access.read"))
		out.push({ to: "/access", label: "Access log", group: "Records" });
	if (can("inventory.read"))
		out.push({ to: "/export", label: "Export", group: "Records" });
	out.push({ to: "/account", label: "Account", group: "You" });
	return out;
}

export function Shell({ children }: { children: ReactNode }) {
	const auth = useAuth();
	const dests = useDestinations();
	const groups = [...new Set(dests.map((d) => d.group))];

	return (
		<div className={classes.frame}>
			<aside className={classes.sidebar} aria-label="Sections">
				<Link to="/" className={classes.sidebarBrand}>
					<Wordmark />
				</Link>
				<Link
					to="/"
					className={classes.sideLink}
					activeOptions={{ exact: true }}
				>
					Home
				</Link>
				{groups.map((g) => (
					<div key={g} className={classes.sideGroup}>
						<div className={classes.sideGroupLabel}>{g}</div>
						{dests
							.filter((d) => d.group === g)
							.map((d) => (
								<Link key={d.to} to={d.to} className={classes.sideLink}>
									{d.label}
								</Link>
							))}
					</div>
				))}
				<div className={classes.sidebarFoot}>
					<RoleTag />
					<Text size="xs" c="dimmed" mt={6}>
						{auth.user?.profile.email ?? ""}
					</Text>
					<button
						type="button"
						className={classes.sideLink}
						onClick={() => void auth.signoutRedirect()}
					>
						Sign out
					</button>
				</div>
			</aside>

			<div className={classes.content}>
				<header className={classes.header}>
					<Link to="/" className={classes.headerBrand}>
						<Wordmark small />
					</Link>
					<RoleTag />
				</header>
				<main className={classes.main} data-app-scroll>
					{children}
				</main>
				<nav className={classes.tabbar} aria-label="Sections">
					<Link to="/" className={classes.tab} activeOptions={{ exact: true }}>
						<HomeIcon />
						<span>Home</span>
					</Link>
					<ShelvesTab />
					<BagsTab />
					<Link to="/more" className={classes.tab}>
						<MoreIcon />
						<span>More</span>
					</Link>
				</nav>
			</div>
		</div>
	);
}

/** Shown only to a role that can see the closet. */
function ShelvesTab() {
	const can = useCan();
	if (!can("inventory.read")) return null;
	return (
		<Link to="/shelves" className={classes.tab}>
			<ShelfIcon />
			<span>Shelves</span>
		</Link>
	);
}

function BagsTab() {
	const can = useCan();
	if (!can("inventory.read")) return null;
	return (
		<Link to="/bags" className={classes.tab}>
			<BagIcon />
			<span>Bags</span>
		</Link>
	);
}
