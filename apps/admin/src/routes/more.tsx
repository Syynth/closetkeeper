import { tables } from "@closetkeeper/bindings";
import { Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "react-oidc-context";
import { useTable } from "spacetimedb/react";
import { ListGroup, ListRow } from "../components/ListRow";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";

export const Route = createFileRoute("/more")({
	component: () => (
		<AuthedPage>
			<More />
		</AuthedPage>
	),
});

/** The admin's front door: you, people, records. Named by what a person controls. */
function More() {
	const auth = useAuth();
	const can = useCan();
	const [directory] = useTable(tables.staffDirectory);
	const [roles] = useTable(tables.roleOptions);

	return (
		<>
			<PageHeader title="More" />
			<ListGroup label="You">
				<ListRow
					title="Account"
					detail={auth.user?.profile.email ?? ""}
					to="/account"
				/>
				<ListRow title="Sign out" onClick={() => void auth.signoutRedirect()} />
			</ListGroup>
			{can("staff.manage") || can("role.manage") ? (
				<ListGroup label="People">
					{can("staff.manage") ? (
						<ListRow
							title="Staff & volunteers"
							right={
								<Text c="dimmed">
									{directory.filter((s) => s.active).length}
								</Text>
							}
							to="/staff"
						/>
					) : null}
					{can("role.manage") ? (
						<ListRow
							title="Roles"
							right={<Text c="dimmed">{roles.length}</Text>}
							to="/roles"
						/>
					) : null}
				</ListGroup>
			) : null}
			{can("access.read") ? (
				<ListGroup label="Records">
					<ListRow
						title="Access log"
						detail="who signed in, who tried"
						to="/access"
					/>
				</ListGroup>
			) : null}
		</>
	);
}
