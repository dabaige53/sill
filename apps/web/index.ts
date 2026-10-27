import { esc } from "./atoms/primitives.ts";
import { Store } from "./data/store.ts";
import { PanelViews as Panels } from "./interactions/panels-components.tsx";
import { LocalSync } from "./services/local-sync.ts";
import { AppController } from "./views/app.ts";

const app = new AppController();
app.initializing = !!window.__QG_LOCAL__;
if (app.initializing) document.body.style.visibility = "hidden";
app.init();
if (window.__QG_LOCAL__)
	LocalSync.connect(app).finally(() => {
		app.initializing = false;
		app.route();
		document.body.style.visibility = "";
	});
if (window.__QG_RUNTIME__) window.__sill = { app, store: Store, panels: Panels, esc };

export { app };
