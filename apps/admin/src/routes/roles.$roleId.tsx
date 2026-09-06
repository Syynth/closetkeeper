import { reducers, tables } from "@closetkeeper/bindings";
import { Alert, Button, Card, Stack, Switch, Text } from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useReducer, useTable } from "spacetimedb/react";
import { LockIcon } from "../components/icons";
import { ListGroup } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { SizeTag } from "../components/SizeTag";
import classes from "./roles.module.css";

export const Route = createFileRoute("/roles/$roleId")({
	component: () => (
		<AuthedPage>
			<RolePage />
		</AuthedPage>
	),
});

/**
 * One role as a list of switches, grouped the way a staff member thinks
 * about the closet. Each flip is its own audited grant or revoke; there is
 * no Save because there is nothing to batch.
 */
function RolePage() {
	const { roleId } = Route.useParams();
	const navigate = useNavigate();
	const can = useCan();
	const [roles] = useTable(tables.roleOptions);
	const [matrix] = useTable(tables.roleCapabilityMatrix);
	const grant = useReducer(reducers.grantCapability);
	const revoke = useReducer(reducers.revokeCapability);
	const remove = useReducer(reducers.deleteRole);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState<string | null>(null);

	const role = roles.find((r) => String(r.roleId) === roleId) ?? null;
	const cells = matrix.filter((c) => String(c.roleId) === roleId);
	const groups = [...new Set(cells.map((c) => c.group))];
	const canGrantProtected = can("staff.manage_sensitive");

	if (!can("role.manage")) {
		return (
			<>
				<PageHeader title="Role" back="/roles" />
				<Card>
					<Text>Your role can't manage roles.</Text>
				</Card>
			</>
		);
	}
	if (role === null) {
		return (
			<>
				<PageHeader title="Role" back="/roles" />
				<Text c="dimmed">Loading…</Text>
			</>
		);
	}

	const locked = role.key === "system_admin";

	async function flip(capability: string, on: boolean) {
		if (!role) return;
		setError(null);
		setPending(capability);
		try {
			if (on) await grant({ roleId: role.roleId, capability });
			else await revoke({ roleId: role.roleId, capability });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setPending(null);
		}
	}

	return (
		<>
			<PageHeader
				title={role.label}
				back="/roles"
				right={
					<SizeTag tone="muted">{role.system ? "built-in" : "custom"}</SizeTag>
				}
			/>
			<Stack gap="md">
				{role.description ? (
					<Text c="dimmed" size="sm">
						{role.description}
					</Text>
				) : null}
				{locked ? (
					<Text size="sm" c="dimmed">
						The system administrator holds every capability and can't lose one.
					</Text>
				) : null}
				{groups.map((g) => (
					<ListGroup key={g} label={g}>
						{cells
							.filter((c) => c.group === g)
							.map((c) => {
								const cannot = locked || (c.protected && !canGrantProtected);
								return (
									<div key={c.key} className={classes.switchRow}>
										<span className={classes.switchLabel}>
											{c.label}
											{c.protected ? (
												<LockIcon className={classes.lock} />
											) : null}
										</span>
										<Switch
											checked={c.granted}
											disabled={cannot || pending === c.capability}
											aria-label={c.label}
											onChange={(e) =>
												void flip(c.capability, e.currentTarget.checked)
											}
										/>
									</div>
								);
							})}
					</ListGroup>
				))}
				{error ? (
					<Alert color="clay" title="Not changed" role="alert">
						{error}
					</Alert>
				) : null}
				{!role.system ? (
					<Button
						variant="outline"
						color="clay"
						disabled={role.holders > 0}
						onClick={async () => {
							setError(null);
							try {
								await remove({ roleId: role.roleId });
								void navigate({ to: "/roles" });
							} catch (e) {
								setError(e instanceof Error ? e.message : String(e));
							}
						}}
					>
						{role.holders > 0 ? "Delete role (still assigned)" : "Delete role"}
					</Button>
				) : null}
			</Stack>
		</>
	);
}
