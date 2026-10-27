import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jobs = process.env.SILL_BUILD_JOBS ?? "2";
if (!/^[1-9]\d*$/.test(jobs)) throw new Error("SILL_BUILD_JOBS must be a positive integer.");
const args = process.argv.slice(2);
const archive = args.includes("--archive");
const unsigned = args.includes("--unsigned");
const simulator = args.includes("--simulator");
if (
	args.some((argument) => !["--archive", "--unsigned", "--simulator"].includes(argument)) ||
	(unsigned && !archive) ||
	(simulator && archive)
) {
	throw new Error("Usage: npm run build:ios -- [--simulator | --archive [--unsigned]]");
}
if (process.platform !== "darwin") {
	throw new Error("iOS builds require macOS and Xcode 16 or newer.");
}
const counter = resolve(root, "dist/ios/build-number.json");
let sequence = Math.floor(Date.now() / 60000);
try {
	const previous = JSON.parse(readFileSync(counter, "utf8")).number;
	if (Number.isSafeInteger(previous)) sequence = Math.max(sequence, previous + 1);
} catch {
	/* A deleted build directory starts a fresh counter from the current time. */
}
const buildNumber =
	process.env.SILL_BUILD_NUMBER ??
	[Math.floor(sequence / 10000), Math.floor(sequence / 100) % 100, sequence % 100].join(".");
if (!/^[1-9]\d{0,3}(?:\.\d{1,2}){0,2}$/.test(buildNumber)) {
	throw new Error("SILL_BUILD_NUMBER must use Apple's numeric format: up to 4.2.2 digits.");
}
const team = process.env.SILL_APPLE_TEAM;
if (archive && !unsigned && !/^[A-Z0-9]{10}$/.test(team ?? "")) {
	throw new Error("Set SILL_APPLE_TEAM to your Apple Developer team ID before archiving.");
}
if (!process.env.SILL_BUILD_NUMBER) {
	mkdirSync(resolve(root, "dist/ios"), { recursive: true });
	writeFileSync(counter, JSON.stringify({ number: sequence }));
}
execFileSync(
	"nice",
	[
		"-n",
		"10",
		"xcodebuild",
		"-quiet",
		"-jobs",
		jobs,
		"-project",
		resolve(root, "apps/apple/SillMobile.xcodeproj"),
		"-scheme",
		"SillMobile",
		// The checked-in CardGenerator plugin is required by SillKit on CI too.
		"-skipPackagePluginValidation",
		"-onlyUsePackageVersionsFromResolvedFile",
		"-configuration",
		archive ? "Release" : "Debug",
		"-destination",
		simulator ? "generic/platform=iOS Simulator" : "generic/platform=iOS",
		"-derivedDataPath",
		resolve(root, "dist/ios/DerivedData"),
		`CURRENT_PROJECT_VERSION=${buildNumber}`,
		...(archive
			? [
					...(unsigned ? ["CODE_SIGNING_ALLOWED=NO"] : [`DEVELOPMENT_TEAM=${team}`]),
					"-archivePath",
					resolve(root, unsigned ? "dist/ios/Sill-unsigned.xcarchive" : "dist/ios/Sill.xcarchive"),
					"archive",
				]
			: ["CODE_SIGNING_ALLOWED=NO", "build"]),
	],
	{ cwd: root, stdio: "inherit" },
);
console.log(
	archive
		? unsigned
			? "Unsigned device archive created at dist/ios/Sill-unsigned.xcarchive. Signing is required before installation or distribution."
			: "Archive created at dist/ios/Sill.xcarchive. Distribution remains a separate Xcode step."
		: simulator
			? "Simulator app built at dist/ios/DerivedData/Build/Products/Debug-iphonesimulator/Sill.app."
			: "Unsigned device app built at dist/ios/DerivedData/Build/Products/Debug-iphoneos/Sill.app. Signing is required before installation.",
);
