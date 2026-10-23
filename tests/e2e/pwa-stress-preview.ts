/** Isolated diagnostic preview. Does not read local cards or expose any write API. */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { stressCards } from "./pwa-stress-fixture.ts";

const server = createServer((request, response) => {
	const url = new URL(request.url || "/", "http://127.0.0.1");
	response.setHeader("Content-Type", "text/html; charset=utf-8");
	response.setHeader("Cache-Control", "no-store");
	if (url.pathname !== "/" && url.pathname !== "/app") {
		response.writeHead(404);
		response.end();
		return;
	}
	if (url.pathname === "/") {
		response.end(
			`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PWA 极端条件检查</title><style>body{margin:0;background:#ddd;font:14px system-ui}iframe{display:block;border:0;height:calc(100dvh - 64px);margin:auto;background:white}nav{height:64px;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}select{font:inherit}</style><nav><label>数据 <select id="data"><option value="demo">Demo data</option><option value="worst" selected>Worst case</option><option value="empty">Empty</option><option value="one">One</option><option value="huge">1,000 rows</option></select></label><label>宽度 <select id="width"><option>320</option><option selected>390</option><option>430</option><option>844</option><option>1440</option></select></label><label>主题 <select id="theme"><option>light</option><option>dark</option></select></label><label>文字 <select id="text"><option value="standard">标准</option><option value="large">大</option><option value="double">200% 压力</option></select></label></nav><iframe title="合成 PWA 页面"></iframe><script>const controls=[...document.querySelectorAll('select')];const params=new URLSearchParams(location.search);for(const el of controls)if(params.has(el.id))el.value=params.get(el.id);function update(){const p=new URLSearchParams(controls.map(el=>[el.id,el.value]));history.replaceState(null,'','?'+p);document.querySelector('iframe').style.width=document.querySelector('#width').value+'px';document.querySelector('iframe').src='/app?'+p;}controls.forEach(el=>el.onchange=update);update();</script></html>`,
		);
		return;
	}
	const cards = stressCards(url.searchParams.get("data") || "worst");
	const state = JSON.stringify({
		version: 4,
		cards,
		items: {},
		preferences: {
			onboarded: true,
			stack: false,
			archiveAfter: "never",
			theme: url.searchParams.get("theme") || "light",
			cardTextSize: url.searchParams.get("text") === "large" ? "large" : "standard",
			readerTextSize: url.searchParams.get("text") === "large" ? "large" : "standard",
		},
	}).replaceAll("<", "\\u003c");
	const init = `<script>localStorage.setItem('sill-v1',${JSON.stringify(state)});Object.defineProperty(navigator,'standalone',{value:true});</script>`;
	// Text-only stress deliberately scales content, never container geometry.
	const large =
		url.searchParams.get("text") === "double"
			? "<style>body .feed-card,body .preview-body,body .reader-body{--content-text-scale:2!important}</style>"
			: "";
	const html = readFileSync(new URL("../../dist/web/index.html", import.meta.url), "utf8");
	response.end(html.replace("<head>", `<head>${init}`).replace("</head>", `${large}</head>`));
});
server.listen(0, "127.0.0.1", () =>
	console.log(
		`PWA stress preview: http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`,
	),
);
