import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apple = resolve(root, "apps/apple");
const output = resolve(root, "dist/macos");
const app = resolve(output, "Sill.app");
const contents = resolve(app, "Contents");
const resources = resolve(contents, "Resources");
const cache = resolve(apple, ".build");
const environment = {
	...process.env,
	CLANG_MODULE_CACHE_PATH: resolve(cache, "module-cache"),
	SWIFTPM_MODULECACHE_OVERRIDE: resolve(cache, "module-cache"),
};
const swiftArguments = [
	"build",
	"--disable-sandbox",
	"--package-path",
	apple,
	"--cache-path",
	resolve(cache, "cache"),
	"--config-path",
	resolve(cache, "config"),
	"--security-path",
	resolve(cache, "security"),
	"--configuration",
	"release",
	"--product",
	"Sill",
	"--disable-automatic-resolution",
];
execFileSync("swift", swiftArguments, { cwd: root, env: environment, stdio: "inherit" });
const binaryDirectory = execFileSync("swift", [...swiftArguments, "--show-bin-path"], {
	cwd: root,
	env: environment,
	encoding: "utf8",
}).trim();
const { version } = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
	version: string;
};
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
	throw new Error("Invalid product version");
const counterFile = resolve(cache, "build-number.json");
let previous = 0;
try {
	previous = (JSON.parse(await readFile(counterFile, "utf8")) as { number: number }).number;
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const buildNumber = Math.max(previous + 1, Math.floor(Date.now() / 1000));
await writeFile(counterFile, JSON.stringify({ number: buildNumber }));
await rm(app, { recursive: true, force: true });
await mkdir(resolve(contents, "MacOS"), { recursive: true });
await mkdir(resources, { recursive: true });
await cp(resolve(binaryDirectory, "Sill"), resolve(contents, "MacOS/Sill"));
await cp(resolve(binaryDirectory, "Sill_Sill.bundle"), resolve(resources, "Sill_Sill.bundle"), {
	recursive: true,
});
const copy = JSON.parse(
	await readFile(resolve(root, "design-system/copy/zh-Hans.json"), "utf8"),
) as Record<string, string>;
const catalog = {
	sourceLanguage: "zh-Hans",
	strings: Object.fromEntries(
		Object.entries(copy).map(([key, value]: any) => [
			key,
			{
				localizations: { "zh-Hans": { stringUnit: { state: "translated", value } } },
			},
		]),
	),
	version: "1.0",
};
const catalogFile = resolve(cache, "Localizable.xcstrings");
await writeFile(catalogFile, JSON.stringify(catalog, null, 2));
execFileSync("xcrun", ["xcstringstool", "compile", catalogFile, "--output-directory", resources], {
	stdio: "inherit",
});
const iconset = resolve(output, "Sill.iconset");
await mkdir(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
	for (const scale of [1, 2]) {
		execFileSync(
			"sips",
			[
				"-z",
				String(size * scale),
				String(size * scale),
				resolve(root, "assets/sill-icon.png"),
				"--out",
				resolve(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`),
			],
			{ stdio: "ignore" },
		);
	}
}
execFileSync("iconutil", ["-c", "icns", iconset, "-o", resolve(resources, "Sill.icns")]);
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Sill</string>
<key>CFBundleIdentifier</key><string>app.sill.native</string>
<key>CFBundleName</key><string>Sill</string>
<key>CFBundleDisplayName</key><string>${copy["apple.windowTitle"]}</string>
<key>CFBundleIconFile</key><string>Sill</string>
<key>CFBundleVersion</key><string>${buildNumber}</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>CFBundleDevelopmentRegion</key><string>zh-Hans</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>Sill authentication</string><key>CFBundleURLSchemes</key><array><string>sill</string></array></dict></array>
</dict></plist>
`;
await writeFile(resolve(contents, "Info.plist"), plist);
execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
console.log(app);
