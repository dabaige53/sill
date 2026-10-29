import { Icon } from "../atoms/react-primitives.tsx";
import { SillWordmark } from "../atoms/wordmark.tsx";
import { copy } from "../copy.ts";
import { CardTypes } from "../data/cards.ts";

export const homeTabs = [
	["all", "web.all"],
	["unread", "web.unread"],
	["todo", "web.home.todo"],
	["later", "web.later"],
	["saved", "web.bookmark"],
] as const;

const homeTabIcons = {
	all: "layers",
	unread: "circle",
	todo: CardTypes.task.icon,
	later: "glasses",
	saved: "bookmark",
} as const;

export function HomeScopeMenu() {
	return (
		<>
			<button
				type="button"
				className="home-menu-toggle"
				id="home-menu-toggle"
				data-action="home-menu"
				aria-haspopup="menu"
				aria-expanded="false"
				aria-controls="home-menu"
				aria-label={`${copy("web.home.filterMenu")}：${copy("web.all")}`}
			>
				<SillWordmark />
				<Icon name="chevron" size={20} />
			</button>
			<div className="home-menu" id="home-menu" role="menu" hidden>
				{homeTabs.map(([key, label], i) => (
					<button
						key={key}
						type="button"
						role="menuitemradio"
						className="home-menu-item"
						data-action="home-tab"
						data-extra={key}
						aria-checked={key === "all"}
					>
						<span className="home-menu-check" aria-hidden="true">
							<Icon name="check" size={16} />
						</span>
						<Icon name={homeTabIcons[key]} />
						<span className="home-menu-label">{copy(label)}</span>
						<span className="home-menu-key" aria-hidden="true">
							⌘{i + 1}
						</span>
					</button>
				))}
			</div>
		</>
	);
}
