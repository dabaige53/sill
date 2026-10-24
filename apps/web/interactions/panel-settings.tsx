import type { ReactNode } from "react";
import type { defaultAppearance } from "../../../contracts/appearance.ts";
import type { Card } from "../../../contracts/card.ts";
import { CardActions } from "../../../contracts/card-actions.ts";
import { eventRelative, eventTimely, timeString } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import type { Preferences } from "../data/store.ts";
import { Store } from "../data/store.ts";
import type { AppController } from "../views/app.ts";
import { actionTypeExamples, type PanelRenderers } from "./panel-contract.ts";
import { icon, keyed, segmented, toggle } from "./panel-primitives.tsx";
import { formatBytes } from "./panels-components.tsx";
import { SystemReminderSettings } from "./system-reminder-settings.tsx";

export const panelSettings = {
	settingsGroups: [
		["add", copy("web.settings.add"), "plus"],
		["desk", copy("web.common.desk"), "monitor"],
		["look", copy("web.settings.appearance"), "eye"],
		["keys", copy("web.settings.shortcuts"), "keyboard"],
		["data", copy("web.cloudentry.ebdc835e8f87"), "lock"],
	],
	settings(
		this: PanelRenderers,
		app?: Partial<AppController> & { cloudSettingsContent?: ReactNode },
		group = "desk",
	) {
		const p = <K extends keyof Preferences>(k?: K) => Store.pref(k),
			row = (label?: ReactNode, side?: ReactNode, example?: { text: string; id: string }) => (
				<>
					<div className={"setting-row"}>
						<span>
							{label}
							{example ? (
								<>
									<small className={"setting-example"} id={example.id}>
										{example.text}
									</small>
								</>
							) : (
								""
							)}
						</span>
						<span className={"setting-side"}>{side}</span>
					</div>
				</>
			);
		const layoutRow = (
			key: keyof typeof defaultAppearance,
			options: (
				| "small"
				| "standard"
				| "large"
				| "compact"
				| "roomy"
				| "narrow"
				| "full"
				| "strong"
			)[],
		) =>
			row(
				copy(`web.settings.layout.${key}`),
				segmented(
					key,
					options.map((value) => [value, copy(`web.settings.layout.${value}`)]),
					p(key),
					copy(`web.settings.layout.${key}`),
				),
			);
		const pages: Record<string, () => ReactNode> = {
			// Adding lives here now: the same one field as the capture sheet. N still opens the sheet directly.
			add: () => (
				<>
					<h2>{copy("web.settings.add")}</h2>
					<div className={"settings-card settings-add"}>
						<div className={"capture-field"}>
							{icon("plus", 18)}
							<textarea
								id={"capture-text"}
								aria-label={copy("web.capture.placeholder")}
								placeholder={copy("web.capture.placeholder")}
								maxLength={4000}
								defaultValue={""}
							/>
						</div>
						<div className={"panel-footer"}>
							<span className={"muted"}>
								<kbd>{"N"}</kbd>
								{copy("web.capture.shortcutHint")}
							</span>
							<button type={"button"} className={"solid-button"} data-action={"capture-save"}>
								{copy("web.capture.save")}
							</button>
						</div>
					</div>
				</>
			),
			desk: () => (
				<>
					<h2>{copy("web.common.desk")}</h2>
					<SystemReminderSettings />
					<div className={"settings-card"}>
						{row(
							copy("web.settings.stackSameSource"),
							<>
								<span>{copy("web.settings.stackThreshold")}</span>
								{toggle("stack", p("stack"), copy("web.settings.stackSameSource"))}
							</>,
						)}
						{row(
							copy("web.settings.fadeRead"),
							toggle("fadeRead", p("fadeRead"), copy("web.settings.fadeRead")),
						)}
						{row(
							copy("web.settings.floatTimely"),
							toggle("floatTimely", p("floatTimely"), copy("web.settings.floatTimely")),
						)}
					</div>
					{"\n       "}
					<div className={"group-label"}>{copy("web.actions.title")}</div>
					<div className={"settings-card"}>
						{keyed(
							CardActions.map((key) =>
								row(
									copy(`web.actions.${key}`),
									toggle(
										key,
										!(p("hiddenActions") || []).includes(key),
										copy(`web.actions.${key}`),
										"action-toggle",
										`action-example-${key}`,
									),
									{ text: copy(actionTypeExamples[key]), id: `action-example-${key}` },
								),
							),
						)}
					</div>
					{"\n       "}
					<div className={"settings-card"}>
						{row(
							copy("web.settings.collapseOnFinish"),
							toggle(
								"collapseOnFinish",
								p("collapseOnFinish"),
								copy("web.settings.collapseOnFinish"),
							),
						)}
						{row(
							copy("web.settings.newContentHint.label"),
							segmented(
								"newHint",
								[
									["away", copy("web.settings.newContentHint.awayFromTop")],
									["off", copy("web.settings.newContentHint.off")],
								],
								p("newHint"),
								copy("web.settings.newContentHint.label"),
							),
						)}
					</div>
				</>
			),
			look: () => (
				<>
					<h2>{copy("web.settings.appearance")}</h2>
					<div className={"settings-card"}>
						{row(
							copy("web.settings.theme.label"),
							segmented(
								"theme",
								[
									["system", copy("web.settings.theme.system")],
									["light", copy("web.settings.theme.light")],
									["dark", copy("web.settings.theme.dark")],
								],
								p("theme"),
								copy("web.settings.theme.label"),
							),
						)}
						{row(
							copy("web.settings.cardWidth.label"),
							segmented(
								"density",
								[
									["compact", copy("web.settings.cardWidth.compact")],
									["standard", copy("web.settings.cardWidth.standard")],
									["roomy", copy("web.settings.cardWidth.roomy")],
								],
								p("density"),
								copy("web.settings.cardWidth.label"),
							),
						)}
						{layoutRow("textWeight", ["standard", "strong"])}
					</div>
					<div className="group-label">{copy("web.settings.layout.cards")}</div>
					<div className="settings-card">
						{layoutRow("cardTextSize", ["small", "standard", "large"])}
						{layoutRow("cardSpacing", ["compact", "standard", "roomy"])}
						{layoutRow("cardPadding", ["compact", "standard", "roomy"])}
					</div>
					<div className="group-label">{copy("web.settings.layout.reading")}</div>
					<div className="settings-card">
						{layoutRow("readerTextSize", ["small", "standard", "large"])}
						{layoutRow("readerSpacing", ["compact", "standard", "roomy"])}
						{layoutRow("readerWidth", ["narrow", "standard", "full"])}
					</div>
					<button type="button" className="text-link" data-action="layout-reset">
						{copy("web.settings.layout.reset")}
					</button>
				</>
			),
			keys: () => (
				<>
					<h2>{copy("web.settings.shortcuts")}</h2>
					<div className={"settings-card"}>
						{row(
							copy("web.settings.singleKeyShortcuts"),
							toggle(
								"singleKeyShortcuts",
								p("singleKeyShortcuts"),
								copy("web.settings.singleKeyShortcuts"),
							),
						)}
						{keyed(
							[
								[copy("web.search"), "⌘ K"],
								[copy("web.capture.title"), "N"],
								[copy("web.settings.shortcuts.openCard"), "Enter"],
								[copy("web.settings.shortcuts.closeOverlay"), "Esc"],
								[copy("web.settings.shortcuts.refresh"), "R"],
								[copy("web.settings.shortcuts.backToTop"), "T"],
							].map(([a, k]) =>
								row(
									a,
									k.split(" ").map((x) => (
										<>
											<kbd>{x}</kbd>
										</>
									)),
								),
							),
						)}
					</div>
				</>
			),
			data: () => (
				<>
					<h2>{copy("web.cloudentry.ebdc835e8f87")}</h2>
					<div className={"settings-card"}>
						{row(
							copy("web.settings.storage.location"),
							<>
								<span>
									{window.__QG_LOCAL__
										? copy("web.settings.storage.localDirectory")
										: copy("web.settings.storage.browser")}
								</span>
							</>,
						)}
						{row(
							copy("web.settings.storage.usage"),
							<>
								<span className={"num"}>{formatBytes(Store.bytes())}</span>
							</>,
						)}
					</div>
					{"\n       "}
					<div className={"settings-card"}>
						{row(
							<>
								<button type={"button"} className={"text-link"} data-action={"export-all"}>
									{copy("web.settings.exportAllCards")}
								</button>
							</>,
							"",
						)}
						{row(
							<>
								<button type={"button"} className={"text-link warn"} data-action={"clear-all"}>
									{copy("web.settings.clearAllData")}
								</button>
							</>,
							"",
						)}
					</div>
				</>
			),
		};
		return (
			<>
				<div className={"sheet settings-sheet"}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{/* @design settings-sheet */}
					<header className={"settings-head"}>
						<h1 id={"modal-title"}>{copy("web.nav.settings")}</h1>
						{this.close(copy("web.settings.close"))}
					</header>
					<div className={"settings-layout"}>
						<nav className={"settings-nav"} aria-label={copy("web.settings.groupsLabel")}>
							{keyed(
								this.settingsGroups.map(([k, v, ic]) => (
									<>
										<button
											type={"button"}
											className={k === group ? "on" : ""}
											data-action={"settings-group"}
											data-extra={k}
											aria-current={k === group}
										>
											{v}
										</button>
									</>
								)),
							)}
						</nav>
						<div className={"settings-main"}>
							{group === "data" && app?.cloudSettingsContent !== undefined
								? app.cloudSettingsContent
								: pages[group]()}
						</div>
					</div>
				</div>
			</>
		);
	},
	confirm(this: PanelRenderers, title?: string, detail?: string, actions?: ReactNode) {
		return (
			<>
				<div className={"sheet"}>
					<div className={"permission"}>
						<h1 id={"modal-title"}>{title}</h1>
						<p className={"muted"}>{detail}</p>
						<div className={"permission-actions"}>{actions}</div>
					</div>
				</div>
			</>
		);
	},
	capture(this: PanelRenderers, app?: unknown) {
		const next = Store.state.cards
			.filter(
				(c?: Card) =>
					c.type === "event" && c.end > Date.now() && c.start - Date.now() < 3 * 3600000,
			)
			.sort((a, b) => a.start - b.start)[0];
		return (
			<>
				<div className={"sheet"}>
					<div className={"grabber"} aria-hidden={"true"}></div>
					{this.close(copy("web.close"))}
					<div className={"panel-content"}>
						<h1 id={"modal-title"} className={"sr-only"}>
							{copy("web.capture.title")}
						</h1>
						<div className={"capture-field"}>
							{icon("plus", 18)}
							<textarea
								id={"capture-text"}
								aria-label={copy("web.capture.placeholder")}
								placeholder={copy("web.capture.placeholder")}
								maxLength={4000}
								defaultValue={""}
							/>
						</div>
						{"\n   "}
						{next ? (
							<>
								<div className={"next-event"}>
									<span className={"num"}>{timeString(next.start)}</span>
									<span>
										{next.title}
										<small>{eventRelative(next)}</small>
									</span>
									{eventTimely(next) && next.meeting ? (
										<>
											<button
												type={"button"}
												className={"solid-button"}
												data-action={"join"}
												data-id={next.id}
											>
												{copy("web.templates.451755e3831f")}
											</button>
										</>
									) : (
										""
									)}
								</div>
							</>
						) : (
							""
						)}
						{"\n   "}
						<div className={"panel-footer"}>
							<span className={"muted"}>
								<kbd>{"N"}</kbd>
								{copy("web.capture.shortcutHint")}
							</span>
							<button type={"button"} className={"solid-button"} data-action={"capture-save"}>
								{copy("web.capture.save")}
							</button>
						</div>
					</div>
				</div>
			</>
		);
	},
};
