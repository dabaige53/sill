import { execFileSync } from "node:child_process";
import {
	cp,
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { arch, platform } from "node:os";
import { resolve } from "node:path";

if (platform() !== "darwin") throw new Error("DMG packaging requires macOS");
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist/macos");
const app = resolve(output, "Sill.app");
const { version } = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const { installer: layout } = JSON.parse(
	await readFile(resolve(root, "design-system/tokens/installer.json"), "utf8"),
);
const copy = JSON.parse(
	await readFile(resolve(root, "design-system/copy/zh-Hans/installer.json"), "utf8"),
);
const run = (command: string, args: string[]) =>
	execFileSync(command, args, { cwd: root, stdio: "inherit" });
run("codesign", ["--verify", "--deep", "--strict", app]);
const cpu = arch() === "arm64" ? "arm64" : "x86_64";
const name = `Sill-${version}-macOS-${cpu}-internal`;
const destination = resolve(output, `${name}.dmg`);
const temporary = await mkdtemp("/private/tmp/sill-dmg-");
const stage = resolve(temporary, "stage");
const mount = resolve(temporary, "mounted");
const writable = resolve(temporary, "installer.dmg");
let mounted = false;
const quote = (value: string) => JSON.stringify(value);
try {
	await mkdir(stage);
	await mkdir(mount);
	await mkdir(resolve(stage, ".background"));
	await cp(app, resolve(stage, "Sill.app"), { recursive: true });
	await symlink("/Applications", resolve(stage, copy["installer.applications"]));
	run("swift", [resolve(root, "scripts/RenderInstaller.swift"), root, temporary]);
	run("tiffutil", [
		"-cathidpicheck",
		resolve(temporary, "background@1x.png"),
		resolve(temporary, "background@2x.png"),
		"-out",
		resolve(stage, ".background/installer.tiff"),
	]);
	run("hdiutil", [
		"create",
		"-srcfolder",
		stage,
		"-volname",
		"Sill",
		"-fs",
		"HFS+",
		"-format",
		"UDRW",
		writable,
	]);
	run("hdiutil", ["attach", writable, "-mountpoint", mount, "-nobrowse", "-noautoopen"]);
	mounted = true;
	// Finder writes the persistent layout. Failure must not produce an unstyled DMG.
	const script = `tell application "Finder"
set targetFolder to POSIX file ${quote(mount)} as alias
open targetFolder
set targetWindow to container window of targetFolder
set current view of targetWindow to icon view
set toolbar visible of targetWindow to false
set statusbar visible of targetWindow to false
set bounds of targetWindow to {${layout.windowX}, ${layout.windowY}, ${layout.windowX + layout.width}, ${layout.windowY + layout.height + layout.titlebarHeight}}
set options to icon view options of targetWindow
set arrangement of options to not arranged
set icon size of options to ${layout.iconSize}
set text size of options to ${layout.labelSize}
set label position of options to bottom
set background picture of options to file ".background:installer.tiff" of targetFolder
set position of item "Sill.app" of targetFolder to {${layout.appX}, ${layout.iconY}}
set extension hidden of item "Sill.app" of targetFolder to true
set position of item ${quote(copy["installer.applications"])} of targetFolder to {${layout.applicationsX}, ${layout.iconY}}
update targetFolder without registering applications
delay 2
close targetWindow
delay 2
end tell`;
	run("osascript", ["-e", script]);
	await stat(resolve(mount, ".DS_Store"));
	run("sync", []);
	run("hdiutil", ["detach", mount]);
	mounted = false;
	await rm(destination, { force: true });
	run("hdiutil", ["convert", writable, "-format", "UDZO", "-o", destination]);
	run("hdiutil", ["verify", destination]);
	run("hdiutil", [
		"attach",
		destination,
		"-readonly",
		"-mountpoint",
		mount,
		"-nobrowse",
		"-noautoopen",
	]);
	mounted = true;
	run("codesign", ["--verify", "--deep", "--strict", resolve(mount, "Sill.app")]);
	await stat(resolve(mount, ".DS_Store"));
	await stat(resolve(mount, ".background/installer.tiff"));
	if ((await readlink(resolve(mount, copy["installer.applications"]))) !== "/Applications")
		throw new Error("Invalid Applications link");
	await cp(resolve(temporary, "background@2x.png"), resolve(output, "installer-background.png"));
	await writeFile(
		resolve(output, `${name}.json`),
		`${JSON.stringify(
			{
				version,
				architecture: cpu,
				commit: process.env.GITHUB_SHA ?? null,
				file: `${name}.dmg`,
				signing: "ad-hoc",
				notarized: false,
				checks: [
					"disk-image-integrity",
					"app-signature",
					"applications-link",
					"finder-layout-present",
				],
				visualAcceptance: "not-performed",
			},
			null,
			2,
		)}\n`,
	);
} finally {
	if (mounted) run("hdiutil", ["detach", mount]);
	await rm(temporary, { recursive: true, force: true });
}
console.log(destination);
