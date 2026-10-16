import { AppController } from "./views/app.ts";
import { LocalSync } from "./services/local-sync.ts";
import { Store } from "./data/store.ts";
import { Panels } from "./interactions/panels.ts";
import { esc } from './atoms/primitives.ts';
const app = new AppController();
app.init();
if(window.__QG_LOCAL__)LocalSync.connect(app);
if(window.__QG_RUNTIME__)window.__sill={app,store:Store,panels:Panels,esc};

export { app };
