// Registers Testing Library's DOM matchers (toBeInTheDocument, etc.) with
// Vitest's expect, and unmounts rendered trees between tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement scrolling; the router calls scrollTo on navigation.
window.scrollTo = () => {};

afterEach(() => {
	cleanup();
});
