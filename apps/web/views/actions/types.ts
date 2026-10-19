import type { AppController } from "../app.ts";

export type ActionArgs = Parameters<AppController["action"]>;
export type ActionContext = {
	name: string;
	id: ActionArgs[1];
	extra: ActionArgs[2];
	el: ActionArgs[3];
	event: ActionArgs[4];
};
export type ActionHandler = (this: AppController, context: ActionContext) => void;
