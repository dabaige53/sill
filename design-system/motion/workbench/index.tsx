import {
	ExternalLinkIcon,
	MonitorIcon,
	PlayIcon,
	RotateCcwIcon,
	SmartphoneIcon,
	SparklesIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { catalog, type Platform, t } from "./catalog.ts";
import { canPlay } from "./play-example.ts";
import { motionReference } from "./references.ts";
import { type Review, type Reviews, readReviews, reviewKey, saveReviews } from "./reviews.ts";
import { draftKey, type Overrides, readDrafts, validOverrides } from "./tuning.ts";
import { Alert, AlertDescription } from "./ui/alert.tsx";
import { Button } from "./ui/button.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable.tsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";
import { defaultFilters, WorkbenchCatalog } from "./workbench-catalog.tsx";
import { WorkbenchInspector } from "./workbench-inspector.tsx";
import { previewURL, WorkbenchPreview } from "./workbench-preview.tsx";

function Library() {
	const [selected, setSelected] = useState(location.hash.slice(1) || "detail.resize");
	const [platform, setPlatform] = useState<Platform>("web");
	const [filters, setFilters] = useState(defaultFilters);
	const [reviews, setReviews] = useState<Reviews>(() => readReviews(localStorage));
	const [drafts, setDrafts] = useState(() => readDrafts(localStorage));
	const [storageError, setStorageError] = useState(false);
	const [version, setVersion] = useState("draft");
	const [reset, setReset] = useState(0);
	const active = catalog.find((e) => e.id === selected) || catalog[0];
	const key = reviewKey(active.id, platform);
	const overrides = validOverrides(active, drafts[key]);
	const [applied, setApplied] = useState({ key, values: overrides });
	const serialized = JSON.stringify(overrides);
	useEffect(() => {
		const timer = setTimeout(() => setApplied({ key, values: JSON.parse(serialized) }), 180);
		return () => clearTimeout(timer);
	}, [serialized, key]);
	useEffect(() => {
		const change = () => setSelected(location.hash.slice(1));
		window.addEventListener("hashchange", change);
		return () => window.removeEventListener("hashchange", change);
	}, []);
	function patchReview(key: string, value: Partial<Review>) {
		const next = { ...reviews, [key]: { ...reviews[key], ...value } };
		setReviews(next);
		setStorageError(!saveReviews(localStorage, next));
	}
	function changeDraft(value: Overrides) {
		const next = { ...drafts, [key]: value };
		setDrafts(next);
		setVersion("draft");
		try {
			localStorage.setItem(draftKey, JSON.stringify(next));
			setStorageError(false);
		} catch {
			setStorageError(true);
		}
	}
	function exportDraft() {
		const blob = new Blob(
			[
				JSON.stringify(
					{ scope: "design-preview-only", id: active.id, platform, parameters: overrides },
					null,
					2,
				),
			],
			{ type: "application/json" },
		);
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = active.id + "-preview.json";
		link.click();
		URL.revokeObjectURL(url);
	}
	const values =
		version === "draft"
			? validOverrides(active, applied.key === key ? applied.values : overrides)
			: {};
	const reference = motionReference(active);
	return (
		<main className="motion-workbench">
			<header className="workbench-header">
				<a href="./" className="workbench-brand">
					<SparklesIcon />
					<strong>Sill</strong>
					<span>{t("workbench")}</span>
				</a>
				<Button asChild variant="ghost" size="sm">
					<a href="https://motion.dev/examples" target="_blank" rel="noreferrer">
						Motion <ExternalLinkIcon data-icon="inline-end" />
					</a>
				</Button>
			</header>
			{storageError && (
				<Alert variant="destructive">
					<AlertDescription>{t("storageError")}</AlertDescription>
				</Alert>
			)}
			<div className="workbench-body">
				<WorkbenchCatalog
					selected={active.id}
					platform={platform}
					reviews={reviews}
					filters={filters}
					onFilter={setFilters}
					onFavorite={(id) => patchReview(id, { favorite: !reviews[id]?.favorite })}
				/>
				<ResizablePanelGroup orientation="horizontal">
					<ResizablePanel defaultSize="340px" minSize="300px" maxSize="520px">
						<WorkbenchInspector
							key={key}
							entry={active}
							overrides={overrides}
							onChange={changeDraft}
							review={reviews[key] || {}}
							onReview={(v) => patchReview(key, v)}
							onExport={exportDraft}
						/>
					</ResizablePanel>
					<ResizableHandle withHandle />
					<ResizablePanel minSize="360px">
						<section className="workbench-preview" aria-label={t("previewPanel")}>
							<header className="preview-toolbar">
								<Button
									size="sm"
									disabled={!canPlay(active.id) || active.platforms[platform] !== "preview"}
									title={!canPlay(active.id) ? t("manualOperation") : t("playAnimation")}
									onClick={() =>
										document
											.querySelector<HTMLIFrameElement>(".preview-device iframe")
											?.contentWindow?.postMessage({ type: "sill-motion-play" }, location.origin)
									}
								>
									<PlayIcon data-icon="inline-start" />
									{t("playAnimation")}
								</Button>
								<ToggleGroup
									type="single"
									value={platform}
									variant="outline"
									size="sm"
									onValueChange={(v) => v && setPlatform(v as Platform)}
									aria-label={t("platform")}
								>
									<ToggleGroupItem value="web">
										<MonitorIcon />
										{t("web")}
									</ToggleGroupItem>
									<ToggleGroupItem value="phone">
										<SmartphoneIcon />
										{t("phone")}
									</ToggleGroupItem>
								</ToggleGroup>
								<ToggleGroup
									type="single"
									value={version}
									size="sm"
									onValueChange={(v) => v && setVersion(v)}
									aria-label={t("compareLabel")}
								>
									<ToggleGroupItem value="original">{t("original")}</ToggleGroupItem>
									<ToggleGroupItem value="draft">{t("draft")}</ToggleGroupItem>
								</ToggleGroup>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={t("resetExample")}
									title={t("resetHint")}
									onClick={() => setReset(reset + 1)}
								>
									<RotateCcwIcon />
								</Button>
								<Button asChild variant="ghost" size="icon-sm">
									<a
										href={previewURL(active, platform, values, "light", false)}
										target="_blank"
										rel="noreferrer"
										aria-label={t("open")}
									>
										<ExternalLinkIcon />
									</a>
								</Button>
							</header>
							<WorkbenchPreview
								key={key}
								entry={active}
								platform={platform}
								overrides={values}
								reset={reset}
								theme="light"
							/>
							<footer className="preview-footer">
								{reference && (
									<a href={reference[1]} title={reference[0]} target="_blank" rel="noreferrer">
										{t("officialPreview")} <ExternalLinkIcon size={13} />
									</a>
								)}
							</footer>
						</section>
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>
		</main>
	);
}
createRoot(document.getElementById("root")!).render(<Library />);
