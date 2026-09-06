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
					// The integration files share one CLI and one local instance.
					// Where the CLI has no saved login (CI), its first command
					// mints and saves an identity; two files starting at once each
					// mint their own, and whichever loses the write to the config
					// file has published its database as an identity later calls
					// no longer use. Serial files make the first command unique.
					fileParallelism: false,
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
					// The app refuses to start without these. Tests never sign in,
					// so no request ever reaches the authority or the database.
					env: {
						VITE_SPACETIMEDB_HOST: "ws://localhost:3000",
						VITE_SPACETIMEDB_DB_NAME: "closetkeeper-test",
						VITE_SPACETIMEAUTH_AUTHORITY: "https://auth.invalid/oidc",
						VITE_SPACETIMEAUTH_CLIENT_ID: "client_test",
					},
				},
			},
		],
	},
});
