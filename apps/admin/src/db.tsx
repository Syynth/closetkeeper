/**
 * The SpacetimeDB connection, opened with the caller's OIDC ID token so the
 * module sees their SpacetimeAuth identity. Mounted only once someone is
 * signed in; there is no anonymous connection in the admin app.
 */
import { DbConnection } from "@closetkeeper/bindings";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { SpacetimeDBProvider } from "spacetimedb/react";

function requireEnv(name: keyof ImportMetaEnv): string {
	const value = import.meta.env[name];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
	}
	return value;
}

export function ConnectedToDatabase({
	token,
	children,
}: {
	token: string;
	children: ReactNode;
}) {
	// A new builder whenever the token changes (silent renew), so the
	// provider reconnects with fresh credentials rather than an expired one.
	const builder = useMemo(
		() =>
			DbConnection.builder()
				.withUri(requireEnv("VITE_SPACETIMEDB_HOST"))
				.withDatabaseName(requireEnv("VITE_SPACETIMEDB_DB_NAME"))
				.withToken(token),
		[token],
	);
	return (
		<SpacetimeDBProvider connectionBuilder={builder}>
			{children}
		</SpacetimeDBProvider>
	);
}
