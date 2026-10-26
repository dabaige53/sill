import { createElement } from "react";
import { FeedBoot } from "../atoms/feed-boot.tsx";
import { MotionEngine } from "../interactions/motion.ts";
import type { AppController } from "../views/app.ts";

/** Keep the shell visible while the first authoritative local snapshot is loading. */
export async function startLocalWorkspace(app: AppController, connect: () => Promise<unknown>) {
	app.initializing = true;
	let visible = false;
	const deskView = app.deskView.bind(app);
	app.deskView = () => createElement(FeedBoot, { visible });
	app.init();
	app.grid.setAttribute("aria-busy", "true");
	const timer = window.setTimeout(() => {
		visible = true;
		app.renderCurrent(false);
	}, MotionEngine.time("delay-loading"));
	try {
		await connect();
	} finally {
		window.clearTimeout(timer);
		app.deskView = deskView;
		try {
			// Still initializing: images do not start a second fade after card entry.
			app.renderCurrent(true);
		} finally {
			app.initializing = false;
			app.grid.removeAttribute("aria-busy");
		}
		app.route();
	}
}
