import { createServer } from "vite";
import { webConfig } from "../apps/web/vite.config.ts";

const server = await createServer({
	...webConfig({ cloud: process.argv.includes("--cloud") }),
	configFile: false,
});
await server.listen();
server.printUrls();
server.bindCLIShortcuts({ print: true });
