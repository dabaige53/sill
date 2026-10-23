import type { AppController } from "../app.ts";
import { aiActions } from "./ai.ts";
import { cardsActions } from "./cards.ts";
import { externalActions } from "./external.ts";
import { feedbackActions } from "./feedback.ts";
import { mediaReminderActions } from "./media-reminders.ts";
import { navigationActions } from "./navigation.ts";
import { selectionActions } from "./selection.ts";
import { settingsActions } from "./settings.ts";
import type { ActionArgs, ActionHandler } from "./types.ts";

const handlers: Record<string, ActionHandler> = {
	...navigationActions,
	...cardsActions,
	...selectionActions,
	...settingsActions,
	...externalActions,
	...mediaReminderActions,
	...feedbackActions,
	...aiActions,
};

export function action(
	this: AppController,
	name?: ActionArgs[0],
	id: ActionArgs[1] = "",
	extra: ActionArgs[2] = "",
	el: ActionArgs[3] = null,
	event: ActionArgs[4] = null,
) {
	if (typeof name !== "string" || !Object.hasOwn(handlers, name)) return;
	handlers[name].call(this, { name, id, extra, el, event });
}
