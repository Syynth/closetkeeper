/**
 * Browser-side authentication: standard OIDC authorization-code flow with
 * PKCE against SpacetimeAuth, via react-oidc-context. The ID token it yields
 * is what the SpacetimeDB connection is opened with (see db.tsx).
 *
 * Nothing here decides who is *authorized*. That happens in the module: an
 * authenticated stranger connects fine and can do nothing.
 */
import type { AuthProviderProps } from "react-oidc-context";

function requireEnv(name: keyof ImportMetaEnv): string {
	const value = import.meta.env[name];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
	}
	return value;
}

export function oidcConfig(): AuthProviderProps {
	const origin = window.location.origin;
	return {
		authority: requireEnv("VITE_SPACETIMEAUTH_AUTHORITY"),
		client_id: requireEnv("VITE_SPACETIMEAUTH_CLIENT_ID"),
		redirect_uri: `${origin}/callback`,
		post_logout_redirect_uri: origin,
		scope: "openid profile email",
		response_type: "code",
		automaticSilentRenew: true,
		// Strip the code and state from the URL once they have been consumed.
		// The /callback route then sends the user to the app root.
		onSigninCallback: () => {
			window.history.replaceState({}, document.title, window.location.pathname);
		},
	};
}
