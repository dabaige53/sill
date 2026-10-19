/** Toolbar verbs a person can hide from the card detail; hiding never removes the verb itself. */
export const CardActions = [
	"bookmark",
	"tag",
	"later",
	"reply",
	"open",
	"join",
	"snooze",
	"download",
	"dismiss",
] as const;
export type CardAction = (typeof CardActions)[number];
