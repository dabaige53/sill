import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = new URL("../../scripts/deploy-release.ts", import.meta.url).href;
for (const scenario of ["success", "missing-database-check", "health-failure"]) {
	test(`release deployment: ${scenario}`, async () => {
		const root = await mkdtemp(join(tmpdir(), "sill-release-test-"));
		try {
			await mkdir(join(root, "dist/release/tag"), { recursive: true });
			await mkdir(join(root, "deploy/cloud"), { recursive: true });
			await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.2.8" }));
			await writeFile(
				join(root, "deploy/cloud/wrangler.production.jsonc"),
				JSON.stringify({ account_id: "synthetic", name: "synthetic" }),
			);
			await writeFile(join(root, "dist/release/tag/worker.mjs"), "export default {};");
			const run = spawnSync(
				process.execPath,
				[
					"--input-type=module",
					"-e",
					`
import assert from 'node:assert/strict';
let uploaded = false;
globalThis.fetch = async (url, init = {}) => {
  if (process.env.SCENARIO === 'missing-database-check') throw Error('Network must not be reached');
  if (String(url).endsWith('/deployments')) return Response.json({success:true,result:{deployments:[{id:uploaded?'new':'old',annotations:{'workers/message':'Sill v1.2.8 synthetic...'},versions:[{version_id:'version-id',percentage:100}]}]}});
  if (String(url).endsWith('/versions/version-id')) return Response.json({success:true,result:{annotations:{'workers/message':'Sill v1.2.8 synthetic-sha','workers/tag':'v1.2.8'}}});
  if (String(url).endsWith('/settings')) return Response.json({success:true,result:{compatibility_date:'2026-10-14',bindings:[{name:'SECRET',type:'secret_text'}]}});
  if (init.method === 'PUT') {
    const metadata = JSON.parse(await init.body.get('metadata').text());
    assert.deepEqual(metadata.bindings,[{name:'SECRET',type:'inherit'}]);
    assert.equal(await init.body.get('worker.mjs').text(),'export default {};');
    uploaded = true;
    return Response.json({success:true,result:{}});
  }
  if (String(url).endsWith('/api/v1/health')) return Response.json({status:'ready'}, {status:process.env.SCENARIO==='health-failure'?503:200});
  if (String(url).endsWith('/auth/session')) return new Response(null,{status:401});
  throw Error('Unexpected request');
};
await import(${JSON.stringify(script)});
`,
				],
				{
					cwd: root,
					encoding: "utf8",
					env: {
						...process.env,
						SCENARIO: scenario,
						GITHUB_REF: "refs/tags/v1.2.8",
						GITHUB_SHA: "synthetic-sha",
						SILL_DATABASE_VERIFIED_COMMIT:
							scenario === "missing-database-check" ? "" : "synthetic-sha",
						CLOUDFLARE_API_TOKEN: "synthetic-token",
						SILL_RELEASE_URL: "https://synthetic.invalid",
					},
				},
			);
			if (scenario === "success") {
				assert.equal(run.status, 0, run.stderr);
				assert.equal(
					JSON.parse(await readFile(join(root, "dist/release/tag/deployment.json"), "utf8")).status,
					"verified",
				);
			} else {
				assert.notEqual(run.status, 0);
				assert.match(
					run.stderr,
					scenario === "health-failure" ? /failed health verification/ : /have not been verified/,
				);
				await assert.rejects(readFile(join(root, "dist/release/tag/release-notes.md")));
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
}
