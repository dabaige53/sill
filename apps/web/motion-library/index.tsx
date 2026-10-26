import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { Icon } from "../atoms/react-primitives.tsx";
import {
	type AnimationEntry,
	availabilityLabel,
	catalog,
	describe,
	exampleURL,
	type Platform,
	platforms,
	t,
} from "./catalog.ts";
import {
	criteria,
	type Reviews,
	readReviews,
	reviewKey,
	reviewStatus,
	saveReviews,
} from "./reviews.ts";
import "./library.css";

function parameterValue(name: string) {
	const timing = tokens.timing.tokens.find((token) => token.name === name);
	if (timing) return timing.value;
	const value = name
		.split(".")
		.reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], tokens);
	return typeof value === "object" ? JSON.stringify(value) : String(value ?? "—");
}

function Preview({
	entry,
	platform,
	cover = false,
	reset = 0,
}: {
	entry: AnimationEntry;
	platform: Platform;
	cover?: boolean;
	reset?: number;
}) {
	const parent = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const observer = new ResizeObserver(([value]) => setWidth(value.contentRect.width));
		observer.observe(parent.current);
		return () => observer.disconnect();
	}, []);
	const availability = entry.platforms[platform];
	const frameWidth = platform === "phone" ? 390 : cover ? 960 : Math.max(720, width);
	const height = cover ? 600 : platform === "phone" ? 760 : 690;
	const scale = Math.min(1, width / frameWidth);
	const unavailable = availability !== "preview";
	return (
		<div ref={parent} className={`motion-preview ${cover ? "is-cover" : ""}`}>
			{unavailable ? (
				<div className="motion-unavailable">
					<span>{availabilityLabel(availability)}</span>
					{!cover && (
						<p>{t(availability === "missing-native" ? "nativeExplanation" : "unsupportedHint")}</p>
					)}
				</div>
			) : (
				<div className="motion-frame-space" style={{ height: height * scale }}>
					<iframe
						key={`${entry.id}:${platform}:${reset}`}
						title={`${describe(entry, "title")} · ${t(platform)}`}
						loading={cover ? "lazy" : "eager"}
						src={exampleURL(entry.id, platform, cover, true)}
						style={{
							width: frameWidth,
							height,
							left: Math.max(0, (width - frameWidth * scale) / 2),
							transform: `scale(${scale})`,
						}}
					/>
				</div>
			)}
		</div>
	);
}

function Library() {
	const [selected, setSelected] = useState(() => decodeURIComponent(location.hash.slice(1)));
	const [query, setQuery] = useState("");
	const [feature, setFeature] = useState("all");
	const [interaction, setInteraction] = useState("all");
	const [platform, setPlatform] = useState<Platform>("web");
	const [favoriteOnly, setFavoriteOnly] = useState(false);
	const [status, setStatus] = useState("all");
	const [reviews, setReviews] = useState<Reviews>(() => readReviews(localStorage));
	const [storageError, setStorageError] = useState(false);
	const [reset, setReset] = useState(0);
	const [sources, setSources] = useState<Record<string, string>>({});
	const [sourceFile, setSourceFile] = useState("");
	useEffect(() => {
		const change = () => {
			setSelected(decodeURIComponent(location.hash.slice(1)));
			setReset(0);
			setSourceFile("");
		};
		window.addEventListener("hashchange", change);
		return () => window.removeEventListener("hashchange", change);
	}, []);
	function patch(key: string, value: Record<string, unknown>) {
		const next = { ...reviews, [key]: { ...reviews[key], ...value } };
		setReviews(next);
		setStorageError(!saveReviews(localStorage, next));
	}
	const active = catalog.find((entry) => entry.id === selected);
	const visible = catalog.filter((entry) => {
		const review = reviews[reviewKey(entry.id, platform)] || {};
		return (
			entry.platforms[platform] !== "not-applicable" &&
			(feature === "all" || feature === entry.feature) &&
			(interaction === "all" || interaction === entry.interaction) &&
			(!favoriteOnly || reviews[entry.id]?.favorite) &&
			(status === "all" ||
				(status === "missingPreview"
					? entry.platforms[platform] !== "preview"
					: reviewStatus(review) === status)) &&
			[
				entry.id,
				entry.component,
				entry.implementation,
				describe(entry, "title"),
				describe(entry, "location"),
				t(`feature.${entry.feature}`),
				t(`interaction.${entry.interaction}`),
			]
				.join(" ")
				.toLocaleLowerCase()
				.includes(query.trim().toLocaleLowerCase())
		);
	});
	const platformControl = (
		<label className="motion-filter">
			{t("platform")}
			<select
				value={platform}
				onChange={(event) => {
					setPlatform(event.target.value as Platform);
					setSourceFile("");
					setReset(0);
				}}
			>
				{platforms.map((p) => (
					<option key={p} value={p}>
						{t(p)}
					</option>
				))}
			</select>
		</label>
	);
	const favoriteButton = (entry: AnimationEntry) => {
		const favorite = reviews[entry.id]?.favorite;
		return (
			<button
				type="button"
				className={`icon-button ${favorite ? "active" : ""}`}
				aria-label={t(favorite ? "unfavorite" : "favorite")}
				aria-pressed={!!favorite}
				onClick={() => patch(entry.id, { favorite: !favorite })}
			>
				<Icon name="bookmark" />
			</button>
		);
	};
	const review = active ? reviews[reviewKey(active.id, platform)] || {} : {};
	async function showSource(file: string) {
		setSourceFile(file);
		if (!sources[file]) {
			try {
				setSources(await (await fetch("./sources.json")).json());
			} catch {
				setSources({ [file]: t("sourceMissing") });
			}
		}
	}
	return (
		<main className="motion-library">
			<header className="motion-library-header">
				<a className="motion-brand" href="./">
					Sill <span>{t("title")}</span>
				</a>
				{!active && (
					<a
						className="text-link"
						href="https://motion.dev/examples"
						target="_blank"
						rel="noreferrer"
					>
						{t("motionReference")}
					</a>
				)}
			</header>
			{active ? (
				<>
					<button
						type="button"
						className="text-link"
						onClick={() => {
							location.hash = "";
						}}
					>
						{t("back")}
					</button>
					<div className="motion-title-row">
						<div>
							<h1>{describe(active, "title")}</h1>
							<p>{describe(active, "trigger")}</p>
						</div>
						{favoriteButton(active)}
					</div>
					<div className="motion-preview-controls">
						{platformControl}
						<button
							type="button"
							className="text-button"
							disabled={active.platforms[platform] !== "preview"}
							onClick={() => setReset(reset + 1)}
						>
							{t("reset")}
						</button>
						<a
							className="text-link"
							href={exampleURL(active.id, platform)}
							target="_blank"
							rel="noreferrer"
						>
							{t("open")}
						</a>
					</div>
					<Preview entry={active} platform={platform} reset={reset} />
					<details className="motion-details">
						<summary>{t("details")}</summary>
						<dl>
							{["location", "trigger", "end", "differences"].map((key) => (
								<div key={key}>
									<dt>{t(key)}</dt>
									<dd>{describe(active, key)}</dd>
								</div>
							))}
						</dl>
						<p>{t("checkRules")}</p>
						<div className="motion-source-buttons">
							{[...new Set([active.component, active.implementation])].map((file) => (
								<button
									type="button"
									className="text-link"
									key={file}
									onClick={() => showSource(file)}
								>
									{file}
								</button>
							))}
						</div>
						{sourceFile && (
							<pre className="motion-source">
								<code>{sources[sourceFile] || t("sourceMissing")}</code>
							</pre>
						)}
						<dl>
							<dt>{t("parameters")}</dt>
							<dd>
								{active.parameters.map((name) => (
									<div key={name}>
										<code>{name}</code> {parameterValue(name)}
									</div>
								))}
							</dd>
						</dl>
					</details>
					<details className="motion-details">
						<summary>
							{t("review")} · {t(reviewStatus(review))}
						</summary>
						<p>{t("reviewHint")}</p>
						<fieldset className="motion-checks">
							<legend>{t("allChecks")}</legend>
							{criteria.map((key) => (
								<label key={key}>
									<input
										type="checkbox"
										checked={review.checks?.includes(key) || false}
										onChange={(event) =>
											patch(reviewKey(active.id, platform), {
												checks: event.target.checked
													? [...(review.checks || []), key]
													: review.checks?.filter((value) => value !== key),
											})
										}
									/>
									{t(key)}
								</label>
							))}
							<label>
								<input
									type="checkbox"
									checked={review.issue || false}
									onChange={(event) =>
										patch(reviewKey(active.id, platform), { issue: event.target.checked })
									}
								/>
								{t("issue")}
							</label>
						</fieldset>
						<label className="motion-notes">
							{t("notes")}
							<textarea
								value={review.notes || ""}
								placeholder={t("notesPlaceholder")}
								onChange={(event) =>
									patch(reviewKey(active.id, platform), { notes: event.target.value })
								}
							/>
						</label>
					</details>
				</>
			) : (
				<>
					<div className="motion-title-row">
						<div>
							<h1>{t("title")}</h1>
							<p>{t("subtitle")}</p>
						</div>
						<span>
							{visible.length} {t("count")}
						</span>
					</div>
					<div className="motion-filters">
						<label className="motion-search">
							<Icon name="search" size={18} />
							<input
								type="search"
								aria-label={t("search")}
								placeholder={t("search")}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</label>
						{platformControl}
						<label className="motion-filter">
							{t("feature")}
							<select value={feature} onChange={(event) => setFeature(event.target.value)}>
								<option value="all">{t("all")}</option>
								{[...new Set(catalog.map((entry) => entry.feature))].map((key) => (
									<option key={key} value={key}>
										{t(`feature.${key}`)}
									</option>
								))}
							</select>
						</label>
						<label className="motion-filter">
							{t("interaction")}
							<select value={interaction} onChange={(event) => setInteraction(event.target.value)}>
								<option value="all">{t("all")}</option>
								{[...new Set(catalog.map((entry) => entry.interaction))].map((key) => (
									<option key={key} value={key}>
										{t(`interaction.${key}`)}
									</option>
								))}
							</select>
						</label>
						<label className="motion-filter">
							{t("status")}
							<select value={status} onChange={(event) => setStatus(event.target.value)}>
								{["all", "unchecked", "checked", "issue", "missingPreview"].map((key) => (
									<option key={key} value={key}>
										{t(key)}
									</option>
								))}
							</select>
						</label>
						<label className="motion-favorite">
							<input
								type="checkbox"
								checked={favoriteOnly}
								onChange={(event) => setFavoriteOnly(event.target.checked)}
							/>
							{t("favorites")}
						</label>
					</div>
					<div className="motion-grid">
						{visible.map((entry) => (
							<article className="motion-example" key={entry.id}>
								<a
									className="motion-cover-link"
									href={`#${entry.id}`}
									aria-label={`${t("preview")} ${describe(entry, "title")}`}
								>
									<Preview entry={entry} platform={platform} cover />
									<span className="motion-cover-hit" />
								</a>
								<div className="motion-example-caption">
									<a href={`#${entry.id}`}>
										<h2>{describe(entry, "title")}</h2>
										<span>
											{t(`feature.${entry.feature}`)} · {t(`interaction.${entry.interaction}`)}
										</span>
									</a>
									{favoriteButton(entry)}
								</div>
								<div className="motion-example-status">
									<code>{entry.id}</code>
									<span>{t(reviewStatus(reviews[reviewKey(entry.id, platform)]))}</span>
								</div>
							</article>
						))}
					</div>
					{!visible.length && <p className="motion-empty">{t("empty")}</p>}
				</>
			)}
			{storageError && <p role="alert">{t("storageError")}</p>}
		</main>
	);
}

createRoot(document.getElementById("root")).render(<Library />);
