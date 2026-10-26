import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";

export function HomeSearchField() {
	return (
		<div className="home-search" id="home-search-field">
			<Icon name="search" size={16} />
			<button
				type="button"
				className="home-search-token"
				id="home-search-token"
				data-action="home-tab"
				data-extra="all"
				hidden
			/>
			<span className="home-search-marks" id="home-search-marks" />
			<input
				type="search"
				id="home-search"
				data-input="home-search"
				autoComplete="off"
				aria-label={copy("web.search.inputLabel")}
				placeholder={copy("web.home.searchPlaceholder")}
			/>
			<span className="home-search-key" aria-hidden="true">
				⌘K
			</span>
			<button
				type="button"
				className="home-search-clear"
				data-action="home-search-clear"
				aria-label={copy("web.search.clear")}
				hidden
			>
				<Icon name="x" size={12} />
			</button>
			<div className="home-hash-slot" id="home-hash-slot" />
		</div>
	);
}
