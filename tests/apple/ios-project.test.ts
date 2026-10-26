import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
	const definitions = [...project.matchAll(/^\s*([A-F0-9]{24}) = \{/gm)].map((match) => match[1]);
	assert.equal(new Set(definitions).size, definitions.length, "duplicate project object IDs");
	for (const [identifier] of project.matchAll(/\b[A-F0-9]{24}\b/g)) {
		assert.ok(definitions.includes(identifier), `unresolved project object ${identifier}`);
	}
	for (const [, identifier] of scheme.matchAll(/BlueprintIdentifier="([A-F0-9]{24})"/g)) {
		assert.ok(
			project.includes(`${identifier} = { isa = PBXNativeTarget;`),
			"scheme points to a missing target",
		);
	}
	for (const [, path] of project.matchAll(/path = ([A-Za-z]+\.(?:swift|plist|xcprivacy));/g)) {
		await access(resolve(apple, "iOSApp", path));
	}
	const script = JSON.parse(project.match(/shellScript = ("(?:\\.|[^"\\])*");/)?.[1] ?? "null");
	assert.equal(script, '/bin/sh "$SRCROOT/iOSApp/prepare-resources.sh"');
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
