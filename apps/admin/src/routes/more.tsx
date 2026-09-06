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
	const [locations] = useTable(tables.locationOptions);
	const [categories] = useTable(tables.categoryOptions);
	const [conditions] = useTable(tables.conditionOptions);
	const [genders] = useTable(tables.genderOptions);

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
			{can("inventory.read") ? (
				<ListGroup label="The closet">
					<ListRow
						title="Bins & places"
						detail="where things live"
						right={
							<Text c="dimmed">{locations.filter((l) => l.active).length}</Text>
						}
						to="/bins"
					/>
					{can("inventory.manage") ? (
						<>
							<ListRow
								title="Categories"
								detail="and the sizes each one uses"
								right={
									<Text c="dimmed">
										{categories.filter((c) => c.active).length}
									</Text>
								}
								to="/categories"
							/>
							<ListRow
								title="Conditions"
								detail={conditions
									.filter((c) => c.active)
									.map((c) => c.label)
									.join(", ")}
								to="/conditions"
							/>
							<ListRow
								title="For"
								detail={genders
									.filter((g) => g.active)
									.map((g) => g.label)
									.join(", ")}
								to="/genders"
							/>
						</>
					) : null}
				</ListGroup>
			) : null}
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
