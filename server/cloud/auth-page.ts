import { copy } from "../../design-system/copy.ts";
import tokens from "../../design-system/tokens.json" with { type: "json" };

// Standalone auth pages use the same semantic colors as the workspace.
const colors = tokens.color.tokens.map((t) => `--${t.name}:${t.value}`).join(";");
const dark = Object.entries(tokens.appleColors)
	.map(([name, value]) => {
		const role =
			({ primary: "ink", secondary: "muted", accentFill: "accent-fill" } as Record<string, string>)[
				name
			] || name;
		return value.includes("/") ? `--${role}:${value.split("/")[1]}` : "";
	})
	.filter(Boolean)
	.join(";");
const dimensions = Object.values(tokens)
	.flatMap((family: any) =>
		Array.isArray(family?.tokens)
			? family.tokens
					.filter((token: any) => typeof token.value === "string")
					.map((token: any) => "--" + token.name + ":" + token.value)
			: [],
	)
	.join(";");
const typeStyles = tokens.type.groups
	.flatMap((group) =>
		group.styles.map((style) => "--text-" + style.name + ":" + style.fontSize + "px"),
	)
	.join(";");
// @design auth-login
export const authStyles = `:root{${colors};${dimensions};${typeStyles};color-scheme:light dark}*{box-sizing:border-box}[hidden]{display:none!important}body{display:grid;place-items:center;margin:0;min-height:100svh;background:var(--card);color:var(--ink);font:var(--text-body)/1.6 system-ui}main{width:100%;max-width:calc(var(--auth-login-width) + 2 * var(--space-24));margin:0 auto;padding: var(--space-48) var(--space-24) max(var(--space-48),env(safe-area-inset-bottom));}h1{font-size:var(--text-figure-route);line-height:1.3;margin:var(--space-24) 0 var(--space-30);text-align:center;font-weight:600}h2{font-size:var(--text-input);margin-top:var(--space-24)}p{color:var(--muted)}a{color:var(--accent);overflow-wrap:anywhere}button,input{font:inherit;min-height:var(--hit-target);border-radius:var(--control-radius);padding:var(--space-12) var(--space-16)}button{border:0;background:var(--surface);color:var(--ink);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}button[value=approve],form>button[type=submit]{background:var(--accent-fill);color:var(--fixed-white)}button:disabled{opacity:.6;cursor:wait}input{width:100%;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:var(--text-card-title);margin:var(--space-8) 0 var(--space-20)}label{display:block;font-size:var(--text-meta)}form>button[type=submit]{width:100%;margin:0}dt{color:var(--muted);margin-top:var(--space-12)}dd{margin:0;overflow-wrap:anywhere}details{margin:var(--space-24) 0}summary{cursor:pointer;min-height:var(--hit-target)}#status{overflow-wrap:anywhere;text-align:center;font-size:var(--text-meta)}#status:empty{display:none}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.auth-actions{display:flex;flex-wrap:wrap;gap:var(--space-16);margin-top:var(--space-24)}.auth-logo{display:block;width:var(--space-44);height:var(--space-44);margin:auto}.auth-logo svg{width:100%;height:100%}.field-heading{display:flex;align-items:center;justify-content:space-between}.text-button{background:transparent;color:var(--muted);font-size:var(--text-meta);padding:var(--space-8) 0}.password-wrap{position:relative}.password-wrap input{padding-right:var(--space-64)}.reveal{position:absolute;right:var(--space-4);top:var(--space-8);width:var(--hit-target);padding:var(--space-12);background:transparent}.reveal svg{width:100%;height:100%}.divider{display:flex;align-items:center;gap:var(--space-16);margin:var(--space-24) 0;color:var(--muted);font-size:var(--text-caption)}.divider:before,.divider:after{content:"";height:1px;background:var(--line);flex:1}.secondary-button{width:100%;background:var(--card);border:1px solid var(--line)}.back{width:100%;margin-top:var(--space-14)}@media(prefers-color-scheme:dark){:root{${dark}}}@media(max-width:650px){body{align-items:start}main{padding-top:var(--space-64);padding-inline:max(var(--space-24),env(safe-area-inset-left));}}`;

// Permission glyphs follow the existing Mono24 paths and stroke roles.
const glyphs: Record<string, string> = {
	sill: '<path d="M4 19V7a2 2 0 0 1 2-2h3.5a2 2 0 0 1 2 2v12M14 19V9a2 2 0 0 1 2-2h2.5a2 2 0 0 1 2 2v10M2.5 19h19M6.75 8.5h1.5"/>',
	"content:read":
		'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
	"content:write": '<path d="M12 5v14M5 12h14"/>',
	"content:delete": '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/>',
	email: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
	offline_access:
		'<path d="M14 3h7v7m0-7L10 14M10 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4"/>',
	person: '<circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 20a7.25 7.25 0 0 1 14.5 0"/>',
	event: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/>',
};
export const consentGlyph = (scope: string) =>
	'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
	(glyphs[scope] || glyphs[scope.startsWith("event:") ? "event" : "person"]) +
	"</svg>";
// @design auth-consent
export const consentStyles = `.consent-page{max-width:calc(var(--auth-consent-width) + 2 * var(--space-24))}.consent-brand{display:flex;justify-content:center;align-items:center}.consent-brand{gap:var(--space-20)}.consent-connection{width:var(--space-28);height:1px;background:var(--line)}.consent-client{display:grid;place-items:center;width:var(--space-48);height:var(--space-48);border-radius:var(--control-radius);background:var(--surface);font-size:var(--text-input)}.consent-brand-mark{display:grid;place-items:center;width:var(--space-48);height:var(--space-48)}.consent-brand svg{width:100%;height:100%}.consent-page h1{overflow-wrap:anywhere}.consent-page p{overflow-wrap:anywhere;font-size:var(--text-meta)}.consent-account{padding:var(--space-16);background:var(--surface);border-radius:var(--control-radius);margin-bottom:var(--space-24)}.consent-account dd{color:var(--ink)}.consent-account dt{margin:0}.consent-permissions{list-style:none;padding:0;margin:var(--space-16) 0}.consent-permissions li{display:flex;gap:var(--space-16);align-items:center;padding:var(--space-16) 0;border-bottom:1px solid var(--line)}.consent-permissions li:last-child{border:0}.consent-permissions svg{width:var(--space-24);height:var(--space-24);flex:none;color:var(--muted)}.consent-actions{display:flex;gap:var(--space-14);margin-top:var(--space-24)}.consent-actions button{flex:1;min-height:var(--space-48);font-weight:600}.consent-revoke{text-align:center}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;

export function callbackFailurePage(kind: "expired" | "forbidden" | "unavailable" | "cancelled") {
	const title = kind === "cancelled" ? copy("auth.cancelledTitle") : copy("auth.recoveryTitle");
	const message =
		kind === "cancelled"
			? copy("auth.recoveryCancelled")
			: kind === "forbidden"
				? copy("auth.recoveryForbidden")
				: kind === "unavailable"
					? copy("auth.recoveryUnavailable")
					: copy("auth.recoveryExpired");
	return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Sill</title><style>${authStyles}</style><main><h1>${title}</h1><p role="status">${message}</p><nav class="auth-actions"><a href="/auth/login">${copy("auth.retryLogin")}</a><a href="/">${copy("auth.home")}</a></nav></main></html>`;
}
