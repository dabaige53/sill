// Raster copies of design-system/assets/artwork: Safari redraws an SVG blur for every image, a WebP
// decodes once. 960×540, WebP quality 80.
import { architecture } from "./artwork-architecture.ts";
import { botanical } from "./artwork-botanical.ts";
import { coast } from "./artwork-coast.ts";
import { mountain } from "./artwork-mountain.ts";

const Assets: Record<string, string> = { architecture, coast, botanical, mountain };

export { Assets };

/** Resolve only bundled artwork or an absolute HTTPS image. */
export function assetURL(value?: string): string | undefined {
	if (!value) return undefined;
	if (Object.hasOwn(Assets, value)) return Assets[value];
	if (!/^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/.test(value) || value.length > 8192)
		return undefined;
	try {
		const url = new URL(value);
		return url.hostname && !url.username && !url.password ? value : undefined;
	} catch {
		return undefined;
	}
}
