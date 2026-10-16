import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { copy } from "../design-system/copy.ts";

const bundle = await build({
	stdin: {
		contents: "import {startCloudBridge} from './apps/web/cloud-bridge.ts';startCloudBridge();",
		resolveDir: process.cwd(),
	},
	bundle: true,
	write: false,
	format: "iife",
	platform: "browser",
	target: "es2022",
	minify: true,
});
let html = await readFile("dist/cloud/index.html", "utf8");
const prelude = `if(location.protocol==='about:'){for(const method of ['pushState','replaceState']){const original=history[method].bind(history);history[method]=(state,title,url)=>original(state,title,typeof url==='string'&&url.startsWith('#')?location.href.split('#')[0]+url:url);}}`;
html = html.replace(
	"<script>",
	() =>
		"<script>" +
		prelude +
		bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") +
		"</script><script>",
);
html = html.replace(
	copy("server.buildcloudapp.fedcdd46812e"),
	copy("server.buildcloudapp.56d73d6d125b"),
);
await writeFile("dist/cloud/app.html", html);
console.log("Built Sill cloud MCP App");
