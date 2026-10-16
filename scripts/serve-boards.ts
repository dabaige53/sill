import { copy } from "../design-system/copy.ts";
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const directory = resolve(import.meta.dirname, '../design-system/boards');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1:4310').pathname);
    const file = resolve(directory, '.' + (path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(directory + sep)) { response.writeHead(403); response.end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
}).listen(4310, '127.0.0.1', () => console.log(copy("server.serveboards.18880b358e65")));
