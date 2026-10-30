import links from "../../../design-system/product-links.json" with { type: "json" };
import product from "../../../package.json" with { type: "json" };
import { SillWordmark } from "../atoms/wordmark.tsx";
import { type CopyKey, copy } from "../copy.ts";
import { icon, sillIcon } from "./panel-primitives.tsx";
import { SettingRow } from "./setting-row.tsx";

export function AboutSettings() {
	return (
		<section className="about-settings" aria-labelledby="about-title">
			<h2 id="about-title">{copy("web.about.title")}</h2>
			<div className="settings-product">
				{sillIcon(56)}
				<div>
					<h3 className="settings-product-name" aria-label="Sill">
						<SillWordmark />
					</h3>
					<p className="panel-sub">{copy("web.about.description")}</p>
				</div>
			</div>
			<div className="settings-card">
				<SettingRow
					label={copy("web.about.version")}
					side={<span className="num">{product.version}</span>}
				/>
			</div>
			<div className="settings-card settings-links">
				{links.map((link) => (
					<a
						className="setting-row settings-link"
						key={link.key}
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
					>
						<span className="settings-link-label">
							{icon(link.icon)}
							{copy(link.key as CopyKey)}
						</span>
						{icon("external", 16)}
					</a>
				))}
			</div>
		</section>
	);
}
