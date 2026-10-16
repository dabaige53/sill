import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apple = resolve(root, "apps/apple");
const cache = resolve(apple, ".build");
execFileSync(
	"swiftc",
	[
		"-typecheck",
		"-module-cache-path",
		resolve(cache, "module-cache"),
		resolve(root, "contracts/design/SillClient.swift"),
	],
	{ cwd: root, stdio: "inherit" },
);
execFileSync(
	"swift",
	[
		"test",
		"--disable-sandbox",
		"--package-path",
		apple,
		"--cache-path",
		resolve(cache, "cache"),
		"--config-path",
		resolve(cache, "config"),
		"--security-path",
		resolve(cache, "security"),
		"--disable-automatic-resolution",
		...process.argv.slice(2),
	],
	{
		cwd: root,
		env: {
			...process.env,
			CLANG_MODULE_CACHE_PATH: resolve(cache, "module-cache"),
			SWIFTPM_MODULECACHE_OVERRIDE: resolve(cache, "module-cache"),
		},
		stdio: "inherit",
	},
);
