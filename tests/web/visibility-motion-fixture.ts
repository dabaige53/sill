import path from "node:path";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";

export const bundle = buildSync({
	stdin: {
		contents:
			"export {MotionEngine} from './apps/web/interactions/motion.ts'; export {capsulePose, readCardPose} from './apps/web/interactions/card-transition.ts';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	// The app imports images for Vite; tests need no pixels.
	loader: { ".png": "empty" },
	alias: {
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "MotionTest",
}).outputFiles[0].text;
export function fixture() {
	const dom = new JSDOM("<!doctype html><button hidden>Notice</button>", {
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = () => ({ matches: false });
	w.eval(bundle);
	const el = w.document.querySelector("button");
	const animations: any[] = [];
	w.__motionAnimations = animations;
	return { dom, w, el, animations, motion: w.MotionTest.MotionEngine };
}
