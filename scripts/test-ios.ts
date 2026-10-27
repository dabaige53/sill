import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jobs = process.env.SILL_BUILD_JOBS ?? "2";
if (!/^[1-9]\d*$/.test(jobs)) throw new Error("SILL_BUILD_JOBS must be a positive integer.");
const args = process.argv.slice(2);
let device: string | undefined;
let selection: string | undefined;
let simulator = false;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--device" && args[i + 1]) device = args[++i];
	else if (args[i] === "--unit") selection = "SillMobileTests";
	else if (args[i] === "--ui") selection = "SillMobileUITests";
	else if (args[i] === "--simulator") simulator = true;
	else throw new Error("Usage: npm run test:ios -- [--unit | --ui] --device UDID [--simulator]");
}
if (process.platform !== "darwin") throw new Error("iOS tests require macOS and Xcode.");
let wasBooted = true;
if (simulator) {
	const { devices } = JSON.parse(
		execFileSync("xcrun", ["simctl", "list", "devices", "available", "--json"], {
			encoding: "utf8",
		}),
	) as { devices: Record<string, { udid: string; name: string; state: string }[]> };
	const available = Object.entries(devices)
		.filter(([runtime]) => runtime.includes("iOS"))
		.flatMap(([, devices]) => devices);
	if (!device) {
		const phones = Object.entries(devices)
			.filter(([runtime]) => runtime.includes("iOS"))
			.flatMap(([, devices]) => devices)
			.filter((device) => device.name.includes("iPhone"));
		device = (phones.find((device) => device.state === "Booted") ?? phones[0])?.udid;
	}
	wasBooted = available.find((candidate) => candidate.udid === device)?.state === "Booted";
}
if (!device) {
	throw new Error(
		simulator
			? "No simulator is available. Local testing uses a physical iPhone by default."
			: "Connect and unlock your iPhone, configure signing in Xcode, then pass --device <UDID> (xcrun devicectl list devices).",
	);
}
const team = process.env.SILL_APPLE_TEAM;
if (team && !/^[A-Z0-9]{10}$/.test(team))
	throw new Error("SILL_APPLE_TEAM must be a valid team ID.");
const results = resolve(root, "tests/artifacts", `ios-${Date.now()}.xcresult`);
mkdirSync(resolve(root, "tests/artifacts"), { recursive: true });
console.log(`Testing on ${simulator ? "simulator" : "iPhone"} ${device}; results: ${results}`);
try {
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
			"-skipPackagePluginValidation",
			"-onlyUsePackageVersionsFromResolvedFile",
			"-configuration",
			"Debug",
			"-destination",
			`platform=${simulator ? "iOS Simulator" : "iOS"},id=${device}`,
			"-derivedDataPath",
			resolve(root, "dist/ios/DerivedData"),
			"-resultBundlePath",
			results,
			"-parallel-testing-enabled",
			"NO",
			"-maximum-concurrent-test-simulator-destinations",
			"1",
			"-collect-test-diagnostics",
			"never",
			"-test-timeouts-enabled",
			"YES",
			"-maximum-test-execution-time-allowance",
			"60",
			...(selection ? [`-only-testing:${selection}`] : []),
			...(simulator ? ["CODE_SIGNING_ALLOWED=NO"] : team ? [`DEVELOPMENT_TEAM=${team}`] : []),
			...(!simulator ? ["-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration"] : []),
			"test",
		],
		{ cwd: root, stdio: "inherit" },
	);
} finally {
	if (simulator && !wasBooted) {
		// Only shut down a simulator started by this run; preserve the user's open device.
		try {
			execFileSync("xcrun", ["simctl", "shutdown", device], { stdio: "ignore" });
		} catch {}
	}
}
