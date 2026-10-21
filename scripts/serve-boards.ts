import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { copy } from "../design-system/copy.ts";

// Current boards first; history boards share the same flat paths as the online canvas.
const directories = ["boards", "history"].map((name) =>
	resolve(import.meta.dirname, "../design-system", name),
);
const types = {
	".html": "text/html; charset=utf-8",
	".css": "text/css",
	".js": "text/javascript",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
};
createServer(async (request, response) => {
	try {
		const path = decodeURIComponent(new URL(request.url, "http://127.0.0.1:4310").pathname);
		const relative = "." + (path.endsWith("/") ? path + "index.html" : path);
		const files = directories.map((directory) => resolve(directory, relative));
		if (files.some((file, index) => !file.startsWith(directories[index] + sep))) {
			response.writeHead(403);
			response.end();
			return;
		}
		const content = await readFile(files[0]).catch(() => readFile(files[1]));
		response.writeHead(200, {
			"Content-Type": types[extname(relative)] || "application/octet-stream",
			"X-Content-Type-Options": "nosniff",
		});
		response.end(request.method === "HEAD" ? undefined : content);
	} catch {
		if (!response.headersSent) response.writeHead(404);
		response.end();
	}
}).listen(4310, "127.0.0.1", () => console.log(copy("server.serveboards.18880b358e65")));
