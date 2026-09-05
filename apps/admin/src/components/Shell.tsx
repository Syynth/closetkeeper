/**
 * The signed-in frame: wordmark, who you are, sign out, and the section
 * links. One column; nothing narrower than a thumb.
 */
import { tables } from "@closetkeeper/bindings";
import { Anchor, Box, Button, Container, Group, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "react-oidc-context";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import classes from "./Shell.module.css";
import { SizeTag } from "./SizeTag";

export function useMyStaff() {
	const [rows, ready] = useTable(tables.myStaff);
	return { me: rows[0] ?? null, ready };
}

export function Wordmark() {
	return (
		<span className={classes.wordmark}>
			Closet<span className={classes.wordmarkAccent}>keeper</span>
		</span>
	);
}

export function Shell({ children }: { children: ReactNode }) {
	const auth = useAuth();
	const db = useSpacetimeDB();
	const { me, ready } = useMyStaff();
	const canManageStaff = me?.capabilities.includes("staff.manage") ?? false;

	return (
		<Box className={classes.frame}>
			<header className={classes.header}>
				<Container size="sm" className={classes.headerInner}>
					<Anchor component={Link} to="/" underline="never" c="inherit">
						<Wordmark />
					</Anchor>
					<Group gap="sm" wrap="nowrap">
						{!db.isActive ? (
							<SizeTag tone="muted">connecting</SizeTag>
						) : !ready ? null : me ? (
							<SizeTag tone={me.active ? "pine" : "clay"}>
								{me.roleLabel}
							</SizeTag>
						) : (
							<SizeTag tone="muted">not staff</SizeTag>
						)}
						<Button
							variant="subtle"
							size="md"
							color="bark"
							onClick={() => void auth.signoutRedirect()}
						>
							Sign out
						</Button>
					</Group>
				</Container>
				{canManageStaff ? (
					<Container size="sm">
						<nav className={classes.nav} aria-label="Sections">
							<Link
								to="/"
								className={classes.navLink}
								activeOptions={{ exact: true }}
							>
								Home
							</Link>
							<Link to="/staff" className={classes.navLink}>
								Staff
							</Link>
						</nav>
					</Container>
				) : null}
			</header>
			<Container size="sm" component="main" className={classes.main}>
				{children}
			</Container>
			<footer className={classes.footer}>
				<Container size="sm">
					<Text size="xs" c="dimmed">
						{auth.user?.profile.email ?? ""}
					</Text>
				</Container>
			</footer>
		</Box>
	);
}
