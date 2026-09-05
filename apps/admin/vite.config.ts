import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		// The router plugin must run before the React plugin.
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		viteReact(),
	],
});
