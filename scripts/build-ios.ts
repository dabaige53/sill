import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const archive = args.includes("--archive");
if (args.some((argument) => !["--archive"].includes(argument))) {
	throw new Error("Usage: npm run build:ios -- [--archive]");
}
if (process.platform !== "darwin") {
	throw new Error("iOS builds require macOS and Xcode 16 or newer.");
}
const buildNumber = process.env.SILL_BUILD_NUMBER ?? "1";
if (!/^\d+(?:\.\d+){0,2}$/.test(buildNumber)) {
	throw new Error("SILL_BUILD_NUMBER must contain one to three numeric components.");
}
const team = process.env.SILL_APPLE_TEAM;
if (archive && !/^[A-Z0-9]{10}$/.test(team ?? "")) {
	throw new Error("Set SILL_APPLE_TEAM to your Apple Developer team ID before archiving.");
}
execFileSync(
	"xcodebuild",
	[
		"-project",
		resolve(root, "apps/apple/SillMobile.xcodeproj"),
		"-scheme",
		"SillMobile",
		// The checked-in CardGenerator plugin is required by SillKit on CI too.
		"-skipPackagePluginValidation",
		"-configuration",
		archive ? "Release" : "Debug",
		"-destination",
		archive ? "generic/platform=iOS" : "generic/platform=iOS Simulator",
		"-derivedDataPath",
		resolve(root, "dist/ios/DerivedData"),
		`CURRENT_PROJECT_VERSION=${buildNumber}`,
		...(archive
			? [
					`DEVELOPMENT_TEAM=${team}`,
					"-archivePath",
					resolve(root, "dist/ios/Sill.xcarchive"),
					"archive",
				]
			: ["CODE_SIGNING_ALLOWED=NO", "build"]),
	],
	{ cwd: root, stdio: "inherit" },
);
console.log(
	archive
		? "Archive created at dist/ios/Sill.xcarchive. Distribution remains a separate Xcode step."
		: "Simulator app built at dist/ios/DerivedData/Build/Products/Debug-iphonesimulator/Sill.app.",
);
