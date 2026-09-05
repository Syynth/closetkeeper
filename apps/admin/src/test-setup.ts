// Registers Testing Library's DOM matchers (toBeInTheDocument, etc.) with
// Vitest's expect, and unmounts rendered trees between tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement scrolling; the router calls scrollTo on navigation.
window.scrollTo = () => {};

// Mantine reads these at mount; jsdom has neither.
window.matchMedia ??= (query: string) =>
	({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	}) as MediaQueryList;
class NoopObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
window.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;

afterEach(() => {
	cleanup();
});
