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
	assert.equal(manifest.name, "dev-6ad0d805d3e88191a1c8902cf66af046");
	assert.equal(overlay.name, manifest.name);
	assert.equal(overlay.version, manifest.version);
	assert.deepEqual(overlay.interface, manifest.extensions["com.openai"].interface);
	assert.equal(
		Object.values((await read(".app.json")).apps as Record<string, { id: string }>)[0].id,
		"asdk_app_6ad0d805d3e88191a1c8902cf66af046",
	);
	assert.deepEqual(await readdir(resolve(dir, "skills")), ["sill"]);
	for (const p of ["plugins", ".agents/plugins/marketplace.json", "deploy/codex-sidebar-cloud"])
		await assert.rejects(access(resolve(root, p)), { code: "ENOENT" });
	const skill = await readFile(resolve(dir, "skills/sill/SKILL.md"), "utf8");
	for (const tool of ["sill_open_workspace", "sill_open_cards", "sill_updateContent"])
		assert.ok(skill.includes(tool));
	for (const name of ["cards", "fields", "transport", "operations"]) {
		const path = `references/${name}.md`;
		assert.ok(skill.includes(path));
		assert.equal(
			await readFile(resolve(dir, "skills/sill", path), "utf8"),
			await readFile(resolve(root, "skills/sill", path), "utf8"),
		);
	}
	assert.equal(
		manifest.version,
		JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).version,
	);
});
