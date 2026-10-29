import { spawnSync } from "node:child_process";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { copy } from "../design-system/copy.ts";

const root = resolve(import.meta.dirname, "..");
const errors = [];
const roots = new Set<any>([
	".git",
	".github",
	".claude",
	".agents",
	".codex",
	".impeccable",
	".gitignore",
	".env.example",
	".app.json",
	".ruff_cache",
	"AGENTS.md",
	"README.md",
	"GLOSSARY.md",
	"package.json",
	"package-lock.json",
	"plugin.json",
	"biome.json",
	"tsconfig.json",
	".swift-format",
	".git-blame-ignore-revs",
	"apps",
	"server",
	"contracts",
	"design-system",
	"docs",
	"scripts",
	"tests",
	"deploy",
	"supabase",
	"skills",
	"assets",
	"node_modules",
	"dist",
	".sill",
	".wrangler",
	".sandbox-venv",
	"__pycache__",
	".DS_Store",
]);
const privateRoots = new Set(["worker-configuration.d.ts", "sill.config.json"]);
const isPrivateOrGenerated = (name?: any) =>
	/^(?:node_modules|dist|\.sill|\.wrangler|\.sandbox-venv|tests\/artifacts|supabase\/\.temp)(?:\/|$)/.test(
		name,
	) ||
	/^(?:apps\/apple\/(?:\.build|\.swiftpm)|\.ruff_cache)(?:\/|$)/.test(name) ||
	/(?:^|\/)__pycache__(?:\/|$)/.test(name) ||
	(/(?:^|\/)(?:\.env(?:\..+)?|sill\.config\.json|\.DS_Store)$/.test(name) &&
		!name.endsWith("/.env.example") &&
		name !== ".env.example") ||
	/\.sqlite[^/]*(?:\/|$)/.test(name) ||
	name === "worker-configuration.d.ts";
const walk = async (directory?: any) => {
	const files = [];
	for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
		const name = `${directory}/${entry.name}`;
		if (isPrivateOrGenerated(name)) continue;
		files.push(...(entry.isDirectory() ? await walk(name) : [name]));
	}
	return files;
};

for (const name of await readdir(root)) {
	if (
		!roots.has(name) &&
		!privateRoots.has(name) &&
		!/^\.env(?:\..+)?$/.test(name) &&
		!/\.sqlite/.test(name)
	) {
		errors.push(
			`${copy("server.checkfiles.c519060c09c3")}${name}${copy("server.checkfiles.d7ca70881f0b")}`,
		);
	}
}
const navigation = await readFile(resolve(root, "docs/README.md"), "utf8");
const recordNavigation = await readFile(resolve(root, "docs/records/README.md"), "utf8");
const documentFiles = await walk("docs");
const currentFiles = documentFiles.filter((name?: any) =>
	/^docs\/(?:agent|specs|implementation|plans)\/.*\.md$/.test(name),
);
for (const name of documentFiles) {
	const metadata = await stat(resolve(root, name));
	if (/\.(?:zip|tar|tgz|gz|7z)$/i.test(name))
		errors.push(`${copy("server.checkfiles.818c87ce3e3e")}${name}`);
	if (metadata.size > 2 * 1024 * 1024)
		errors.push(`${copy("server.checkfiles.d521f7360d5d")}${name}`);
	if (!name.endsWith(".md")) continue;
	const body = await readFile(resolve(root, name), "utf8");
	if (currentFiles.includes(name)) {
		if (!/更新：\d{4}-\d{2}-\d{2}/.test(body.slice(0, 300)))
			errors.push(`${copy("server.checkfiles.3f8407488978")}${name}`);
		if (!navigation.includes(`(${relative("docs", name)})`))
			errors.push(`${copy("server.checkfiles.8d3ee2aa32a3")}${name}`);
	}
	if (/^docs\/[^/]+\.md$/.test(name) && name !== "docs/README.md")
		errors.push(`${copy("server.checkfiles.33827c76f7ea")}${name}`);
}
for (const entry of await readdir(resolve(root, "docs/records"), { withFileTypes: true })) {
	const name = `docs/records/${entry.name}`;
	if (
		entry.isFile() &&
		["README.md", "CHANGELOG.md", "design-changelog.md", "errors.md"].includes(entry.name)
	)
		continue;
	if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}-.+/.test(entry.name)) {
		errors.push(`${copy("server.checkfiles.b320e3042eff")}${name}`);
		continue;
	}
	try {
		await access(resolve(root, name, "README.md"));
	} catch {
		errors.push(`${copy("server.checkfiles.8ee039e0979b")}${name}`);
	}
	if (!recordNavigation.includes(`(${entry.name}/README.md)`))
		errors.push(`${copy("server.checkfiles.40493881693b")}${name}`);
}
const guides = new Set<any>([
	"AGENTS.md",
	".github/pull_request_template.md",
	"README.md",
	"docs/README.md",
	"docs/adr/README.md",
	"docs/records/README.md",
	"docs/records/errors.md",
	"docs/records/CHANGELOG.md",
	"scripts/README.md",
	"tests/README.md",
	...currentFiles,
]);
for (const guide of guides) {
	const body = await readFile(resolve(root, guide), "utf8");
	for (const [, raw] of body.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
		const url = raw.trim().replace(/^<|>$/g, "");
		if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(url)) continue;
		const target = resolve(dirname(resolve(root, guide)), decodeURIComponent(url.split(/[?#]/)[0]));
		const name = relative(root, target);
		if (name.startsWith("../") || name === ".." || isAbsolute(name)) {
			errors.push(`${guide}${copy("server.checkfiles.94d854a008fe")}${url}`);
			continue;
		}
		try {
			await access(target);
		} catch {
			errors.push(`${guide}${copy("server.checkfiles.61c22fcdb426")}${url}`);
		}
	}
}
const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
if (tracked.error || tracked.status !== 0) {
	errors.push(copy("server.checkfiles.e4027a7b1208"));
} else {
	for (const name of tracked.stdout.split("\0").filter(Boolean)) {
		if (isPrivateOrGenerated(name)) errors.push(`${copy("server.checkfiles.741be2898468")}${name}`);
	}
}
for (const directory of ["apps", "server"]) {
	try {
		await access(resolve(root, directory));
	} catch {
		continue;
	}
	for (const name of await walk(directory)) {
		if (!/\.(?:ts|tsx|swift)$/.test(name)) continue;
		const body = await readFile(resolve(root, name), "utf8");
		for (const [, target] of body.matchAll(
			/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g,
		)) {
			if (!target.startsWith(".")) continue;
			const destination = relative(root, resolve(root, dirname(name), target));
			const sourceUnit = name.split("/").slice(0, 2).join("/");
			const targetUnit = destination.split("/").slice(0, 2).join("/");
			if (/^(?:apps|server)\//.test(destination) && sourceUnit !== targetUnit)
				errors.push(`${copy("server.checkfiles.9b0eb1e16a1b")}${name} → ${target}`);
		}
	}
}
const ignoredPaths = [
	".env",
	".env.local",
	"sill.config.json",
	".sill/local/cards.json",
	"sample.sqlite",
	"node_modules/sample",
	"dist/sample",
	"tests/artifacts/sample",
	"__pycache__/sample",
	".sandbox-venv/sample",
	".wrangler/sample",
	"supabase/.temp/sample",
	"worker-configuration.d.ts",
];
const ignored = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
	cwd: root,
	encoding: "utf8",
	input: ignoredPaths.join("\n") + "\n",
});
if (ignored.error || ![0, 1].includes(ignored.status)) {
	errors.push(copy("server.checkfiles.79e83f155ae8"));
} else {
	const matches = new Set<any>(ignored.stdout.trim().split("\n"));
	for (const name of ignoredPaths)
		if (!matches.has(name)) errors.push(`${copy("server.checkfiles.053415fdba69")}${name}`);
}
if (errors.length) {
	console.error(errors.join("\n"));
	process.exitCode = 1;
} else {
	console.log(copy("server.checkfiles.a2d8a8e43223"));
}
