import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Assets } from "../../apps/web/data/assets.ts";

/** Keep the exact bundled image bytes in shared files instead of repeating them in preview HTML. */
export function preparePreviewArtwork(check: boolean) {
	const directory = resolve(import.meta.dirname, "../assets/artwork/raster");
	if (!check) mkdirSync(directory, { recursive: true });
	const replacements = Object.entries(Assets).map(([name, uri]) => {
		const bytes = Buffer.from(uri.slice("data:image/webp;base64,".length), "base64");
		const file = resolve(directory, `${name}.webp`);
		if (check) {
			if (!readFileSync(file).equals(bytes)) throw new Error(`stale preview artwork: ${name}`);
		} else {
			writeFileSync(file, bytes);
		}
		return [uri, `../../assets/artwork/raster/${name}.webp`] as const;
	});
	return (html: string) => {
		for (const [uri, path] of replacements) html = html.replaceAll(uri, path);
		return html;
	};
}
