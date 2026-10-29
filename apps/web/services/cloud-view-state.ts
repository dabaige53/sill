import { itemDefaults } from "./cloud-sync.ts";

/** Compare visible content and effective personal state, not save receipt metadata. */
export function cloudViewCard(record: any, item: any) {
	if (!record) return null;
	const {
		state: _state,
		revision: _revision,
		updated_at: _updated,
		change_version: _version,
		owner_id: _owner,
		...card
	} = record;
	const state = { ...itemDefaults(record), ...item };
	// The server mirrors completion into done; the controls read the specific fields.
	if (record.type !== "reminder") state.reminderDone = false;
	if (record.type === "task") {
		state.taskDone = (record.tasks || [])
			.filter((task: any) => state.taskDone.includes(task.id))
			.map((task: any) => task.id);
		state.done = state.taskDone.length === (record.tasks || []).length && state.taskDone.length > 0;
	} else if (record.type === "reminder") state.done = state.reminderDone;
	return { card, state };
}
