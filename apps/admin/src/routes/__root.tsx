import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "react-oidc-context";
import { oidcConfig } from "../auth";

import "../styles.css";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<AuthProvider {...oidcConfig()}>
			<Outlet />
		</AuthProvider>
	);
}
