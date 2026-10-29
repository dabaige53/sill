import { readFile, writeFile } from "node:fs/promises";

// Deploy only the artifact retained by the release jobs, preserving existing bindings.
const directory = "dist/release/tag";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const config = JSON.parse(await readFile("deploy/cloud/wrangler.production.jsonc", "utf8"));
const tag = `v${version}`;
const commit = process.env.GITHUB_SHA;
if (process.env.GITHUB_REF !== `refs/tags/${tag}` || !commit)
	throw new Error("Deploy only from the product version tag");
if (process.env.SILL_DATABASE_VERIFIED_COMMIT !== commit)
	throw new Error(
		"Database migration and stored-card compatibility have not been verified for this commit",
	);
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required");
const origin = new URL(process.env.SILL_RELEASE_URL || "");
if (origin.protocol !== "https:") throw new Error("SILL_RELEASE_URL must use HTTPS");
const base = `https://api.cloudflare.com/client/v4/accounts/${config.account_id}/workers/scripts/${config.name}`;
async function api(path: string, init: RequestInit = {}) {
	const response = await fetch(base + path, {
		...init,
		headers: { Authorization: `Bearer ${token}` },
	});
	const body = await response.json();
	if (!response.ok || !body.success)
		throw new Error(
			`Cloudflare request failed (${response.status}); inspect platform status before retrying`,
		);
	return body.result;
}
const previous = (await api("/deployments")).deployments[0];
const settings = await api("/settings");
const receipt = { tag, commit, previous, status: "prepared", deployment: null };
const save = () => writeFile(`${directory}/deployment.json`, JSON.stringify(receipt, null, 2));
await save();
const metadata = {
	...settings,
	main_module: "worker.mjs",
	bindings: settings.bindings.map((binding: { name: string }) => ({
		name: binding.name,
		type: "inherit",
	})),
	annotations: { "workers/message": `Sill ${tag} ${commit}`, "workers/tag": tag },
};
const form = new FormData();
form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
form.set(
	"worker.mjs",
	new Blob([await readFile(`${directory}/worker.mjs`)], {
		type: "application/javascript+module",
	}),
	"worker.mjs",
);
if ((await api("/deployments")).deployments[0]?.id !== previous?.id)
	throw new Error("Deployment changed while preparing; inspect the new deployment before retrying");
receipt.status = "uploading";
await save();
// An unknown upload result is deliberately not retried automatically.
await api("", { method: "PUT", body: form });
const current = (await api("/deployments")).deployments[0];
receipt.deployment = current;
receipt.status = "deployed_pending_health";
await save();
if (
	!current ||
	current.id === previous?.id ||
	current.versions?.length !== 1 ||
	current.versions[0].percentage !== 100
)
	throw new Error("Deployment receipt does not identify the release version");
// Deployment summaries truncate messages; version annotations retain the complete commit.
const deployedVersion = await api(`/versions/${current.versions[0].version_id}`);
if (
	deployedVersion.annotations?.["workers/message"] !== metadata.annotations["workers/message"] ||
	deployedVersion.annotations?.["workers/tag"] !== tag
)
	throw new Error("Deployment version does not identify the release commit");
const health = await fetch(new URL("/api/v1/health", origin));
if (health.status !== 200 || (await health.json()).status !== "ready")
	throw new Error("Deployed Worker failed health verification");
const privateResponse = await fetch(new URL("/auth/session", origin), { redirect: "manual" });
if (privateResponse.status !== 401 && privateResponse.status !== 403)
	throw new Error("Unauthenticated session request was not rejected");
receipt.status = "verified";
await save();
await writeFile(
	`${directory}/release-notes.md`,
	[
		`Sill ${tag}`,
		`Source commit: ${commit}`,
		`Cloudflare deployment: ${current.id}`,
		"",
		"Mac 包仅供自己或内部测试，使用临时签名，未经 Apple 公证。下载文件名标明 CPU 架构；最低 macOS 14。",
		"Web、服务端、数据库、浏览器和 Swift 自动检查通过后构建。自动检查不替代真实设备与宿主验收。",
	].join("\n"),
);
console.log(`Verified ${tag}: ${current.id}`);
