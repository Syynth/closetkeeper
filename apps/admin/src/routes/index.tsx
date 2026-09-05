import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<main>
			<h1>Closetkeeper</h1>
			<p>Admin scaffold. Nothing is wired to the database yet.</p>
		</main>
	);
}
