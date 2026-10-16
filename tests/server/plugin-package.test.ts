import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
test("Sill builds only the original App with one skill and both sidebar tools", async () => {
	execFileSync(process.execPath, [resolve(root, "scripts/build-plugin.ts")]);
	const dir = resolve(root, "dist/plugin/sill");
	const read = async (p?: any) => JSON.parse(await readFile(resolve(dir, p), "utf8"));
	const manifest = await read("plugin.json"),
		overlay = await read(".codex-plugin/plugin.json");
	assert.equal(manifest.name, "dev-6ad03f09b6048191a8826a236ac9097d");
	assert.equal(overlay.name, manifest.name);
	assert.equal(overlay.version, manifest.version);
	assert.deepEqual(overlay.interface, manifest.extensions["com.openai"].interface);
	assert.equal(
		Object.values((await read(".app.json")).apps as Record<string, { id: string }>)[0].id,
		"asdk_app_6ad03f09b6048191a8826a236ac9097d",
	);
	assert.deepEqual(await readdir(resolve(dir, "skills")), ["sill"]);
	for (const p of ["plugins", ".agents/plugins/marketplace.json", "deploy/codex-sidebar-cloud"])
		await assert.rejects(access(resolve(root, p)), { code: "ENOENT" });
	const skill = await readFile(resolve(dir, "skills/sill/SKILL.md"), "utf8");
	for (const tool of ["sill_open_workspace", "sill_open_cards", "sill_updateContent"])
		assert.ok(skill.includes(tool));
	const server = await readFile(resolve(root, "server/cloud/mcp.ts"), "utf8");
	assert.match(server, /["']global["']/);
	assert.match(server, /["']thread["']/);
	assert.equal(
		manifest.version,
		JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).version,
	);
});
