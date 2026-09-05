import { MantineProvider } from "@mantine/core";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "react-oidc-context";
import { oidcConfig } from "../auth";
import { cssVariablesResolver, theme } from "../theme";

import "../styles.css";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<MantineProvider
			theme={theme}
			cssVariablesResolver={cssVariablesResolver}
			defaultColorScheme="light"
		>
			<AuthProvider {...oidcConfig()}>
				<Outlet />
			</AuthProvider>
		</MantineProvider>
	);
}
