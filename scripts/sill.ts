import { readFile } from "node:fs/promises";
import { copy, errorMessage } from "../design-system/copy.ts";

// JSON on stdin or --file avoids shell escaping and keeps agent output bounded.
const [command = "help", ...args] = process.argv.slice(2);
const port = Number(process.env.QG_LOCAL_PORT || 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid_port");
const origin = "http://127.0.0.1:" + port;
if (command === "help") {
	console.log(copy("server.sill.529e004a8653"));
} else
	try {
		let path = "/api/local/state",
			options: any;
		if (command === "capabilities") path = "/api/local/capabilities";
		else if (command === "open") path = "/api/local/open?id=" + encodeURIComponent(args[0] || "");
		else if (command === "apply") {
			let source: any;
			if (args[0] === "--file" && args[1]) source = await readFile(args[1], "utf8");
			else {
				const chunks = [];
				for await (const chunk of process.stdin) chunks.push(chunk);
				source = Buffer.concat(chunks).toString("utf8");
			}
			options = {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(JSON.parse(source)),
			};
			path = "/api/local/operations";
		} else if (!["state", "list", "get"].includes(command)) throw new Error("unknown_command");
		const response = await fetch(origin + path, { ...options, signal: AbortSignal.timeout(5000) }),
			value = await response.json();
		if (!response.ok) throw new Error(value.error || "unavailable");
		let result = value;
		if (command === "list") {
			const query = args.join(" ").toLowerCase();
			result = {
				revision: value.revision,
				cards: (value.state?.cards || [])
					.filter(
						(card?: any) =>
							!query ||
							[
								card.title,
								card.summary,
								...(card.sources || []).map((source?: any) => source.name),
								...(card.tags || []),
							]
								.join(" ")
								.toLowerCase()
								.includes(query),
					)
					.map((card?: any) => ({
						id: card.id,
						type: card.type,
						title: card.title,
						url: card.url,
						state: value.state.items[card.id] || {},
					})),
			};
		} else if (command === "get") {
			const card = value.state?.cards.find((card?: any) => card.id === args[0]);
			if (!card) throw new Error("not_found");
			result = { revision: value.revision, card, state: value.state.items[card.id] || {} };
		} else if (command === "apply")
			result = { ok: true, revision: value.revision, count: value.state.cards.length };
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(
			JSON.stringify({
				error: error.message,
				message: errorMessage(error.message),
				cause: error.cause?.code,
				suggestion: error.cause ? copy("server.sill.6eef1dd64f92") : undefined,
			}),
		);
		process.exitCode = 1;
	}
