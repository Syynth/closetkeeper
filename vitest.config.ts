import { defineConfig } from "vitest/config";

// One Vitest run covers every workspace package. Each project gets the
// environment it needs: the module's tests shell out to the spacetime CLI
// against a local instance and run in Node; the admin's are React component
// tests under jsdom.
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "module",
					root: "./spacetimedb",
					include: ["test/**/*.test.ts"],
					environment: "node",
					// Publishing to a local instance is slow the first time.
					testTimeout: 60_000,
					hookTimeout: 120_000,
				},
			},
			{
				// Reuse the admin's Vite config so the TanStack Router plugin,
				// React plugin, and tsconfig paths behave exactly as in dev.
				extends: "./apps/admin/vite.config.ts",
				test: {
					name: "admin",
					root: "./apps/admin",
					include: ["src/**/*.test.{ts,tsx}"],
					environment: "jsdom",
					setupFiles: ["./src/test-setup.ts"],
				},
			},
		],
	},
});
