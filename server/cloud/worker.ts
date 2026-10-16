import brandIcon from "../../assets/sill-icon.png";
import lineIcon from "../../assets/sill-line.svg";
import lineIconDark from "../../assets/sill-line-dark.svg";
import appHtml from "../../dist/cloud/app.html";
import html from "../../dist/cloud/index.html";
import { createSillRuntime } from "./http.ts";
// One runtime per current configuration shares only in-flight refresh work.
// Auth clients and response cookies remain request scoped; no completed session cache.
export function createWorker({ runtimeFactory = createSillRuntime }: any = {}) {
	let activeKey: any, activeRuntime: any;
	return {
		fetch(request?: any, env?: any) {
			if (request.method === "GET" && new URL(request.url).pathname === "/assets/sill-icon.png")
				return new Response(brandIcon, {
					headers: {
						"Content-Type": "image/png",
						"Cache-Control": "public, max-age=3600",
						"X-Content-Type-Options": "nosniff",
					},
				});
			const iconPath = new URL(request.url).pathname;
			if (
				request.method === "GET" &&
				["/assets/sill-line.svg", "/assets/sill-line-dark.svg"].includes(iconPath)
			)
				return new Response(iconPath.endsWith("-dark.svg") ? lineIconDark : lineIcon, {
					headers: {
						"Content-Type": "image/svg+xml",
						"Cache-Control": "public, max-age=3600",
						"X-Content-Type-Options": "nosniff",
					},
				});
			if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.APP_ORIGIN)
				return new Response("Not configured", { status: 503 });
			let oauthClientIds = [];
			try {
				oauthClientIds = JSON.parse(env.OAUTH_CLIENT_IDS || "[]");
			} catch {}
			const config = {
				url: env.SUPABASE_URL,
				publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
				appOrigin: env.APP_ORIGIN,
				agentAudience: env.AGENT_AUDIENCE,
				mcpEnabled: env.MCP_ENABLE === "true",
				oauthConsentEnabled: env.OAUTH_CONSENT_ENABLE === "true",
				oauthClientIds,
			};
			const key = JSON.stringify(config);
			if (key !== activeKey) {
				activeRuntime = runtimeFactory(config, { html, appHtml });
				activeKey = key;
			}
			return activeRuntime(request);
		},
	};
}
export default createWorker();
