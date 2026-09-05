import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routeTree } from "./routeTree.gen";

// Route components are code-split by the router plugin, so they must be
// rendered through a real router rather than pulled off the route object.
function renderAt(path: string) {
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	return render(<RouterProvider router={router} />);
}

describe("home route, signed out", () => {
	it("renders the wordmark and the sign-in button, and opens no database connection", async () => {
		renderAt("/");
		expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
			"Closetkeeper",
		);
		expect(
			await screen.findByRole("button", { name: /email me a sign-in link/i }),
		).toBeInTheDocument();
		expect(screen.queryByText(/connecting/i)).not.toBeInTheDocument();
	});
});
