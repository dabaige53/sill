import type { ReactNode } from "react";
import type { defaultAppearance } from "../../../contracts/appearance.ts";
import { copy } from "../copy.ts";
import type { Preferences } from "../data/store.ts";
import { Store } from "../data/store.ts";
import type { AppController } from "../views/app.ts";
import { AboutSettings } from "./about-settings.tsx";
import type { PanelRenderers } from "./panel-contract.ts";
import { keyed, segmented, toggle } from "./panel-primitives.tsx";
import { formatBytes } from "./panels-components.tsx";
import { SettingRow } from "./setting-row.tsx";
import { SystemReminderSettings } from "./system-reminder-settings.tsx";

export const panelSettings = {
	settingsGroups: [
		["desk", copy("web.common.desk"), "monitor"],
		["look", copy("web.settings.appearance"), "eye"],
		["keys", copy("web.settings.shortcuts"), "keyboard"],
		["data", copy("web.cloudentry.ebdc835e8f87"), "lock"],
		["about", copy("web.about.title"), "info"],
	],
	settings(
		this: PanelRenderers,
		app?: Partial<AppController> & { cloudSettingsContent?: ReactNode },
		group = "desk",
	) {
		const p = <K extends keyof Preferences>(k?: K) => Store.pref(k),
			row = (label?: ReactNode, side?: ReactNode, example?: { text: string; id: string }) => (
				<SettingRow label={label} side={side} example={example} />
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
			about: () => <AboutSettings />,
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
					<button type="button" className="text-link settings-reset" data-action="layout-reset">
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
								[copy("web.settings.shortcuts.openCard"), "Enter"],
								[copy("web.settings.shortcuts.closeOverlay"), "Esc"],
								[copy("web.settings.shortcuts.refresh"), "R"],
								[copy("web.settings.shortcuts.backToTop"), "T"],
							].map(([a, k]) =>
								row(
									a,
									k.split(" ").map((x) => <kbd key={x}>{x}</kbd>),
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
								[
									...this.settingsGroups.filter(([key]) => key !== "about"),
									...(app?.cloudBackupSettingsContent !== undefined
										? [["backup", copy("web.backup.navigation"), "archive"]]
										: []),
									this.settingsGroups.find(([key]) => key === "about"),
								].map(([k, v]) => (
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
								: group === "backup"
									? app?.cloudBackupSettingsContent
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
};
