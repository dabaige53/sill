import tokens from "../../design-system/tokens.json" with { type: "json" };
import { copy } from "../../design-system/copy.ts";

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
export const authStyles = `:root{${colors};color-scheme:light dark}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:16px/1.6 system-ui}main{width:calc(100% - 32px);max-width:620px;margin:clamp(16px,6vh,64px) auto;padding:28px;background:var(--card);border-radius:24px}h1{font-size:24px;line-height:1.3;margin:24px 0 16px}h2{font-size:17px;margin-top:24px}p{color:var(--muted)}a{color:var(--accent);overflow-wrap:anywhere}button,input{font:inherit;min-height:44px;border-radius:12px;padding:12px 16px}button{border:0;background:var(--surface);color:var(--ink);cursor:pointer;margin:12px 8px 0 0}button[value=approve],#password-form button,#email-form button{background:var(--accent-fill);color:white}button:disabled{opacity:.6;cursor:wait}input{width:100%;border:1px solid var(--secondary);background:var(--card);color:var(--ink);margin:8px 0 18px}label{display:block}#password-form button,#email-form button{width:100%;margin:0}details{margin-top:24px;border-top:1px solid var(--surface);padding-top:16px}summary{cursor:pointer;min-height:44px;display:list-item}dt{color:var(--muted);margin-top:12px}dd{margin:0;overflow-wrap:anywhere}ul{padding-left:22px}li{margin:8px 0}#status{min-height:24px;overflow-wrap:anywhere}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.auth-actions{display:flex;flex-wrap:wrap;gap:16px;margin-top:24px}.auth-actions a{padding:8px 0}@media(prefers-color-scheme:dark){:root{${dark}}}@media(max-width:480px){main{padding:20px}h1{font-size:22px}}`;
// Permission glyphs follow the existing Mono24 paths and stroke roles.
const glyphs: Record<string, string> = {
 sill: '<path d="M4 19V7a2 2 0 0 1 2-2h3.5a2 2 0 0 1 2 2v12M14 19V9a2 2 0 0 1 2-2h2.5a2 2 0 0 1 2 2v10M2.5 19h19M6.75 8.5h1.5"/>',
 'content:read': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 'content:write': '<path d="M12 5v14M5 12h14"/>',
 'content:delete': '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/>',
 email: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
 offline_access: '<path d="M14 3h7v7m0-7L10 14M10 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4"/>',
 person: '<circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 20a7.25 7.25 0 0 1 14.5 0"/>',
 event: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/>',
};
export const consentGlyph = (scope: string) => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + (glyphs[scope] || glyphs[scope.startsWith('event:') ? 'event' : 'person']) + '</svg>';
export const consentStyles = `.consent-page{max-width:560px;padding:36px;box-shadow:0 12px 48px color-mix(in srgb,var(--ink) 5%,transparent)}.consent-brand{display:flex;align-items:center;gap:16px;font-size:28px;font-weight:650;letter-spacing:-.6px}.consent-brand-mark{display:grid;place-items:center;width:60px;height:60px;border-radius:18px;background:var(--accent-fill);color:white}.consent-brand svg{width:38px;height:38px}.consent-page h1{font-size:28px;line-height:1.4;margin:28px 0 10px;overflow-wrap:anywhere}.consent-page p{margin:0 0 20px;overflow-wrap:anywhere}.consent-permissions{list-style:none;padding:0;margin:16px 0}.consent-permissions li{display:flex;gap:18px;align-items:center;margin:0;padding:18px 4px;border-bottom:1px solid var(--surface)}.consent-permissions li:last-child{border:0}.consent-permissions svg{width:24px;height:24px;flex:none;color:var(--muted)}.consent-page details{border:0;margin:12px 0 24px;padding:0;color:var(--muted)}.consent-page summary{padding:8px 0}.consent-page dd{color:var(--ink)}.consent-actions{display:flex;gap:14px}.consent-actions button{flex:1;min-height:52px;margin:0;font-weight:600}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:480px){.consent-page{padding:24px}.consent-page h1{font-size:24px}.consent-brand{font-size:24px}.consent-brand-mark{width:52px;height:52px;border-radius:16px}.consent-permissions li{padding:16px 0;gap:14px}}`;
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
