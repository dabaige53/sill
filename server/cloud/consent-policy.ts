import { copy } from "../../design-system/copy.ts";
import { consentGlyph } from "./auth-page.ts";
import { isAuthorizationId } from "./oauth-identifiers.ts";

/** Offline consent policy. Not imported by the Worker and never writes grants or calls OAuth. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = () => {
	throw new Error("consent_not_allowed");
};
const exactSet = (values?: any, allowed?: any) =>
	Array.isArray(values) &&
	values.length > 0 &&
	new Set<any>(values).size === values.length &&
	values.every((v?: any) => typeof v === "string" && allowed.includes(v));
function callback(value?: any) {
	if (typeof value !== "string" || value.length > 2048) fail();
	let u: any;
	try {
		u = new URL(value);
	} catch {
		fail();
	}
	// Real callbacks must be explicitly recorded after discovery, never inferred from a display name.
	if (
		u.username ||
		u.password ||
		u.hash ||
		u.search ||
		u.href !== value ||
		!(
			u.protocol === "https:" ||
			(u.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(u.hostname))
		)
	)
		fail();
	return u.href;
}
/** All inputs except details come from server-verified identity/configuration, not the form. */
export function reviewConsent({ details, principal, policy, grant }: any) {
	if (
		!details ||
		!principal ||
		!policy ||
		!grant ||
		!UUID.test(principal.userId || "") ||
		principal.clientId !== null
	)
		fail();
	if (
		!isAuthorizationId(details.authorization_id) ||
		details.user?.id !== principal.userId ||
		!UUID.test(policy.clientId || "") ||
		details.client?.id !== policy.clientId
	)
		fail();
	// A provider auto-redirect is not proof that Sill-specific access was reviewed.
	if (
		details.redirect_url ||
		!Array.isArray(policy.redirectUris) ||
		!policy.redirectUris.includes(details.redirect_uri)
	)
		fail();
	const redirectUri = callback(details.redirect_uri);
	let origin: any;
	try {
		origin = new URL(policy.appOrigin);
	} catch {
		fail();
	}
	if (
		origin.protocol !== "https:" ||
		origin.origin !== policy.appOrigin ||
		policy.audience !== policy.appOrigin + "/mcp"
	)
		fail();
	// OIDC identity scopes are NOT Sill content scopes. No email/profile default is silently accepted.
	const identityScopes =
		typeof details.scope === "string" ? details.scope.trim().split(/\s+/).filter(Boolean) : [];
	if (
		!exactSet(policy.identityScopes, ["openid", "email", "profile", "phone", "offline_access"]) ||
		!exactSet(identityScopes, policy.identityScopes)
	)
		fail();
	if (
		grant.ownerId !== principal.userId ||
		grant.clientId !== policy.clientId ||
		grant.audience !== policy.audience
	)
		fail();
	if (
		!exactSet(policy.contentScopes, [
			"content:read",
			"content:write",
			"content:delete",
			"event:submit",
			"event:read",
		]) ||
		!exactSet(grant.scopes, policy.contentScopes) ||
		!grant.scopes.includes("content:read")
	)
		fail();
	if (
		!Array.isArray(policy.resources) ||
		!Array.isArray(grant.resources) ||
		!grant.resources.length ||
		new Set<any>(grant.resources).size !== grant.resources.length
	)
		fail();
	// A workspace wildcard must be an explicit singleton on both sides. It is never synthesized.
	if (grant.resources.includes("*")) {
		if (
			grant.resources.length !== 1 ||
			policy.resources.length !== 1 ||
			policy.resources[0] !== "*"
		)
			fail();
	} else if (!grant.resources.every((id?: any) => UUID.test(id) && policy.resources.includes(id)))
		fail();
	const review = {
		authorizationId: details.authorization_id,
		userId: principal.userId,
		clientId: policy.clientId,
		clientName:
			typeof details.client.name === "string" ? details.client.name.slice(0, 200) : policy.clientId,
		redirectUri,
		audience: policy.audience,
		identityScopes: [...identityScopes],
		contentScopes: [...grant.scopes],
		resources: [...grant.resources],
		canList: grant.resources[0] === "*",
		canCreate: grant.resources[0] === "*" && grant.scopes.includes("content:write"),
	};
	return Object.freeze({
		...review,
		identityScopes: Object.freeze(review.identityScopes),
		contentScopes: Object.freeze(review.contentScopes),
		resources: Object.freeze(review.resources),
	});
}
const escapeHtml = (value?: any) =>
	String(value).replace(
		/[&<>"']/g,
		(c?: any) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
	);
/** Escaped review fragment. The authenticated controller owns the active form. */
export function consentSummary(review?: any) {
	const range =
		review.resources[0] === "*"
			? copy("server.consentpolicy.2d55a9134f5d")
			: review.resources.map(escapeHtml).join("、");
	const identity = {
		openid: copy("auth.identity.openid"),
		email: copy("auth.identity.email"),
		profile: copy("auth.identity.profile"),
		phone: copy("auth.identity.phone"),
		offline_access: copy("auth.identity.offline_access"),
	};
	const permissions = {
		"content:read": copy("server.consentpolicy.bf6dfdcb4066"),
		"content:write": review.canCreate
			? copy("server.consentpolicy.97b7145eb4ee")
			: copy("auth.modifySelected"),
		"content:delete": copy("server.consentpolicy.7ca7b60a347c"),
		"event:submit": copy("server.consentpolicy.08e1bf580476"),
		"event:read": copy("server.consentpolicy.6ccfdd828764"),
	};
	const list = (scopes, labels) =>
		scopes
			.map(
				(scope) =>
					"<li>" +
					consentGlyph(scope) +
					"<span>" +
					escapeHtml(labels[scope] || scope) +
					"</span></li>",
			)
			.join("");
	return `<section aria-labelledby="consent-title"><div class="consent-brand"><span class="consent-client" aria-hidden="true">${escapeHtml(Array.from(review.clientName)[0] || "")}</span><span class="consent-connection" aria-hidden="true"></span><span class="consent-brand-mark"><img src="/assets/sill-icon.png" alt=""></span></div><h1 id="consent-title">${copy("server.consentpolicy.65051d44e433")}${escapeHtml(review.clientName)}${copy("server.consentpolicy.070dee491968")}</h1><dl class="consent-account"><dt>${copy("auth.account")}</dt><dd>${escapeHtml(review.userId)}</dd></dl><h2 class="visually-hidden">${copy("auth.permissions")}</h2><ul class="consent-permissions">${list(review.contentScopes, permissions)}${list(review.identityScopes, identity)}</ul><p>${range}</p>${review.canList ? "" : "<p>" + copy("server.consentpolicy.30d1f064d9d7") + "</p>"}<details><summary>${copy("auth.details")}</summary><dl><dt>${copy("server.consentpolicy.92ceb36a3d2c")}</dt><dd>${escapeHtml(review.clientId)}</dd><dt>${copy("server.consentpolicy.9ca160d65985")}</dt><dd>${escapeHtml(review.redirectUri)}</dd><dt>${copy("server.consentpolicy.02739d1bae8b")}</dt><dd>${escapeHtml(review.audience)}</dd><dt>${copy("server.consentpolicy.b10ce5499816")}</dt><dd>${review.identityScopes.map(escapeHtml).join("、")}</dd></dl></details>${review.contentScopes.includes("event:submit") ? "<p>" + copy("auth.eventQueue") + "</p>" : ""}</section>`;
}
