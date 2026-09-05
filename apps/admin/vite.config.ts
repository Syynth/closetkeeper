import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Dev and preview port. Deliberately not Vite's default 5173, which every
 * other project on a developer's machine is also using. The SpacetimeAuth
 * client's redirect URIs are registered against this exact origin, so
 * strictPort makes a collision a hard error instead of a silent drift to
 * 7071 and a confusing login failure.
 */
const PORT = 7070;

export default defineConfig({
	resolve: { tsconfigPaths: true },
	server: { port: PORT, strictPort: true },
	preview: { port: PORT, strictPort: true },
	plugins: [
		// The router plugin must run before the React plugin.
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		viteReact(),
	],
});
