import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import copy from "../../design-system/copy/zh-Hans.json" with { type: "json" };

export const repositoryRoot = resolve(import.meta.dirname, "../..");
const webRoot = resolve(repositoryRoot, "apps/web");
const localApi = "http://127.0.0.1:4318";
const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(character) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
	);

function pageMetadata(cloud: boolean): Plugin {
	return {
		name: "sill-page-metadata",
		transformIndexHtml: {
			order: "pre",
			async handler(html, context) {
				const paths: string[] = JSON.parse(
					await readFile(resolve(webRoot, "styles/styles.json"), "utf8"),
				);
				const links = paths.map(
					(path) => `<link rel="stylesheet" href="/${path.replace(/^apps\/web\//, "")}">`,
				);
				if (cloud) links.push('<link rel="stylesheet" href="/cloud.css">');
				const homeScreen = cloud
					? `<!-- home-screen:start -->
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" sizes="256x256" href="/assets/sill-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Sill">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<!-- home-screen:end -->`
					: "";
				return html
					.replace(/\{\{COPY:([^}]+)\}\}/g, (_match, key: string) => {
						if (!Object.hasOwn(copy, key)) throw new Error(`missing_copy:${key}`);
						return escapeHtml(copy[key]);
					})
					.replace(
						"{{TITLE}}",
						escapeHtml(copy[cloud ? "web.pageTitle.cloud" : "web.pageTitle.local"]),
					)
					.replace("</head>", `${homeScreen}\n${links.join("\n")}\n</head>`)
					.replace('src="/index.ts"', `src="/${cloud ? "cloud-entry.ts" : "index.ts"}"`)
					.replace(
						'window.__PAGE__="feed";',
						`window.__PAGE__="feed";${context.server && !cloud ? "window.__QG_LOCAL__=true;window.__QG_RUNTIME__=true;" : ""}`,
					);
			},
		},
	};
}

/** Standalone packaging uses a classic IIFE so the MCP prelude and file:// keep working. */
function standaloneScripts(): Plugin {
	return {
		name: "sill-standalone-scripts",
		apply: "build",
		enforce: "post",
		generateBundle: {
			order: "post",
			handler(_options, bundle) {
				for (const output of Object.values(bundle)) {
					if (output.type !== "asset" || !output.fileName.endsWith(".html")) continue;
					const scripts: string[] = [];
					const html = String(output.source).replace(
						/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g,
						(_tag, code: string) => {
							scripts.push(`<script>${code}</script>`);
							return "";
						},
					);
					// A classic inline bundle must run after the body and PAGE marker exist.
					output.source = html.replace("</body>", () => `${scripts.join("\n")}\n</body>`);
				}
			},
		},
	};
}

export function webConfig({ cloud = false }: { cloud?: boolean } = {}): UserConfig {
	return {
		root: webRoot,
		base: "./",
		publicDir: false,
		plugins: [pageMetadata(cloud), react(), viteSingleFile(), standaloneScripts()],
		server: {
			host: "localhost",
			port: 5173,
			strictPort: true,
			allowedHosts: ["localhost"],
			fs: { allow: [repositoryRoot] },
			proxy: {
				"/api/local": {
					target: localApi,
					changeOrigin: true,
					configure(proxy) {
						proxy.on("proxyReq", (request, incoming) => {
							// Only the same-origin development page may forward browser writes.
							if (incoming.headers.origin === "http://localhost:5173")
								request.setHeader("Origin", localApi);
						});
					},
				},
			},
		},
		build: {
			outDir: resolve(repositoryRoot, cloud ? "dist/cloud" : "dist/web"),
			emptyOutDir: false,
			target: "es2022",
			minify: true,
			// Preserve both standard and WebKit backdrop-filter declarations with CSS variables.
			// The default CSS minifier merges this pair and drops the standard declaration.
			cssMinify: "esbuild",
			modulePreload: false,
			rolldownOptions: { output: { format: "iife" } },
		},
	};
}

export default defineConfig(({ mode }) => webConfig({ cloud: mode === "cloud" }));
