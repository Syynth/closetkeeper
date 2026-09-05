import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "react-oidc-context";
import { ConnectedToDatabase } from "../db";
import { WhoAmI } from "../whoami";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const auth = useAuth();

	if (auth.isLoading) {
		return (
			<main>
				<h1>Closetkeeper</h1>
				<p>Loading…</p>
			</main>
		);
	}

	if (!auth.isAuthenticated || !auth.user?.id_token) {
		return (
			<main>
				<h1>Closetkeeper</h1>
				<p>Staff and volunteer sign-in.</p>
				<button type="button" onClick={() => void auth.signinRedirect()}>
					Log in
				</button>
				{auth.error ? <p role="alert">{auth.error.message}</p> : null}
			</main>
		);
	}

	return (
		<ConnectedToDatabase token={auth.user.id_token}>
			<main>
				<h1>Closetkeeper</h1>
				<WhoAmI email={auth.user.profile.email ?? null} />
				<button type="button" onClick={() => void auth.signoutRedirect()}>
					Log out
				</button>
			</main>
		</ConnectedToDatabase>
	);
}
