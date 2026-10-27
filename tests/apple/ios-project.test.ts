import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const apple = resolve(root, "apps/apple");

test("iOS project references resolve and its shared launch scheme selects the app", async () => {
	const project = await readFile(resolve(apple, "SillMobile.xcodeproj/project.pbxproj"), "utf8");
	const scheme = await readFile(
		resolve(apple, "SillMobile.xcodeproj/xcshareddata/xcschemes/SillMobile.xcscheme"),
		"utf8",
	);
	const objects = project.replace(/\/\*[\s\S]*?\*\//g, "");
	const definitions = [...objects.matchAll(/^\s*([A-F0-9]{24})\s*=\s*\{\s*isa\s*=/gm)].map(
		(match) => match[1],
	);
	assert.equal(new Set(definitions).size, definitions.length, "duplicate project object IDs");
	for (const [identifier] of objects.matchAll(/\b[A-F0-9]{24}\b/g)) {
		assert.ok(definitions.includes(identifier), `unresolved project object ${identifier}`);
	}
	for (const [, identifier] of scheme.matchAll(/BlueprintIdentifier="([A-F0-9]{24})"/g)) {
		assert.ok(
			new RegExp(`${identifier}\\s*=\\s*\\{\\s*isa = PBXNativeTarget;`).test(objects),
			"scheme points to a missing target",
		);
	}
	for (const [, path] of project.matchAll(/path = ([A-Za-z]+\.(?:swift|plist|xcprivacy));/g)) {
		const directory = path.endsWith("Tests.swift")
			? path === "MobileUITests.swift"
				? "iOSUITests"
				: "MobileTests"
			: "iOSApp";
		await access(resolve(apple, directory, path));
	}
	const script = JSON.parse(project.match(/shellScript = ("(?:\\.|[^"\\])*");/)?.[1] ?? "null");
	assert.equal(script, '/bin/sh "$SRCROOT/iOSApp/prepare-resources.sh"');
	for (const directory of ["MobileTests", "iOSUITests"]) {
		for (const name of await readdir(resolve(apple, directory))) {
			if (name.endsWith(".swift"))
				assert.ok(
					project.includes(`path = "${name}";`) || project.includes(`path = ${name};`),
					`${name} missing from iOS tests`,
				);
		}
	}
	assert.match(scheme, /BlueprintName="SillMobileTests"/);
	assert.match(scheme, /BlueprintName="SillMobileUITests"/);
	assert.match(scheme, /EnvironmentVariable key="SILL_UI_TESTING" value="1" isEnabled="YES"/);
});

test("iOS packaging uses repository version and artwork without relaxing transport security", async () => {
	const info = await readFile(resolve(apple, "iOSApp/Info.plist"), "utf8");
	const script = await readFile(resolve(apple, "iOSApp/prepare-resources.sh"), "utf8");
	const privacy = await readFile(resolve(apple, "iOSApp/PrivacyInfo.xcprivacy"), "utf8");
	assert.doesNotMatch(info, /NSAllowsArbitraryLoads|CFBundleShortVersionString/);
	assert.match(script, /plutil -extract version raw/);
	assert.match(script, /plutil -insert CFBundleShortVersionString/);
	assert.match(script, /assets\/sill-icon\.png/);
	await access(resolve(root, "assets/sill-icon.png"));
	assert.match(privacy, /<key>NSPrivacyTracking<\/key><false\/>/);
	assert.match(privacy, /NSPrivacyCollectedDataTypeEmailAddress/);
	assert.match(privacy, /NSPrivacyCollectedDataTypeUserID/);
	assert.match(privacy, /NSPrivacyCollectedDataTypeOtherUserContent/);
});
