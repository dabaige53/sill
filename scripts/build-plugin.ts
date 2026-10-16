import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const product = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"));
manifest.version = product.version;
const release = JSON.parse(await readFile(resolve(root, "deploy/sill/release.json"), "utf8"));
const binding: { apps: Record<string, { id: string }> } = JSON.parse(
	await readFile(resolve(root, ".app.json"), "utf8"),
);
const appId = "asdk_app_6ad0d805d3e88191a1c8902cf66af046";
if (
	release.plugin_id !== "plugin_" + appId ||
	release.app_id !== appId ||
	manifest.name !== "dev-6ad0d805d3e88191a1c8902cf66af046" ||
	Object.values(binding.apps).length !== 1 ||
	Object.values(binding.apps)[0].id !== appId
)
	throw new Error("Sill identity mismatch: refusing to build a second plugin");
const directory = resolve(root, "dist/plugin/sill");
await rm(directory, { recursive: true, force: true });
await mkdir(resolve(directory, ".codex-plugin"), { recursive: true });
await writeFile(resolve(directory, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
await cp(resolve(root, ".app.json"), resolve(directory, ".app.json"));
await cp(resolve(root, "skills/sill"), resolve(directory, "skills/sill"), { recursive: true });
const extension = manifest.extensions["com.openai"];
await writeFile(
	resolve(directory, ".codex-plugin/plugin.json"),
	JSON.stringify(
		{
			name: manifest.name,
			version: manifest.version,
			description: manifest.description,
			author: manifest.author,
			skills: "./skills/",
			apps: extension.apps,
			interface: extension.interface,
		},
		null,
		2,
	) + "\n",
);
console.log(
	`Unpublished Sill candidate: ${directory}. Existing App identity preserved; no installation or publication performed.`,
);
