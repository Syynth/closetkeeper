import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "react-oidc-context";

/**
 * Where SpacetimeAuth sends the browser back after login. react-oidc-context
 * consumes the code from the URL on mount; once it has finished, go home.
 */
export const Route = createFileRoute("/callback")({ component: Callback });

function Callback() {
	const auth = useAuth();
	const navigate = useNavigate();

	useEffect(() => {
		if (!auth.isLoading) {
			void navigate({ to: "/", replace: true });
		}
	}, [auth.isLoading, navigate]);

	if (auth.error) {
		return (
			<main>
				<h1>Sign-in failed</h1>
				<p>{auth.error.message}</p>
			</main>
		);
	}
	return (
		<main>
			<p>Signing you in…</p>
		</main>
	);
}
