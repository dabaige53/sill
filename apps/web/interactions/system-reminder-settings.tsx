import { useState, useSyncExternalStore } from "react";
import { copy } from "../copy.ts";
import { systemReminders } from "../services/system-reminders.ts";

export function SystemReminderSettings() {
	useSyncExternalStore(
		systemReminders.subscribe,
		() => systemReminders.version,
		() => 0,
	);
	const [busy, setBusy] = useState(false);
	const change = async () => {
		setBusy(true);
		await systemReminders.setEnabled(!systemReminders.enabled);
		setBusy(false);
	};
	if (!systemReminders.supported) return null;
	return (
		<>
			<div className="settings-card">
				<div className="setting-row">
					<span>
						{copy("reminders.title")}
						<small className="setting-example">{copy("reminders.webHint")}</small>
					</span>
					<span className="setting-side">
						<button
							type="button"
							className={"toggle" + (systemReminders.enabled ? " on" : "")}
							role="switch"
							aria-label={copy("reminders.title")}
							aria-checked={systemReminders.enabled}
							disabled={busy || !systemReminders.supported || !systemReminders.context}
							onClick={change}
						/>
					</span>
				</div>
			</div>
			{(!systemReminders.supported || systemReminders.message) && (
				<p className="settings-hint muted" role="status">
					{systemReminders.supported ? systemReminders.message : copy("reminders.unsupported")}
				</p>
			)}
		</>
	);
}
