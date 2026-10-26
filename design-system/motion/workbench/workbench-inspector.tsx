import {
	ClipboardCheckIcon,
	CodeIcon,
	DownloadIcon,
	RotateCcwIcon,
	SlidersHorizontalIcon,
} from "lucide-react";
import { useState } from "react";
import { type AnimationEntry, describe, t } from "./catalog.ts";
import { ParameterControls } from "./parameter-controls.tsx";
import { criteria, type Review } from "./reviews.ts";
import { type Overrides, parametersFor } from "./tuning.ts";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert.tsx";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "./ui/field.tsx";
import { NativeSelect, NativeSelectOption } from "./ui/native-select.tsx";
import { Separator } from "./ui/separator.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.tsx";
import { Textarea } from "./ui/textarea.tsx";

function SourcePanel() {
	const [file, setFile] = useState("design-system/motion/workbench/runtime.tsx");
	const [sources, setSources] = useState<Record<string, string>>({});
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(false);
	const load = async (selected: string) => {
		setFile(selected);
		setLoading(true);
		setError(false);
		try {
			const response = await fetch("./sources.json");
			if (!response.ok) throw new Error("source_read_failed");
			setSources(await response.json());
		} catch {
			setError(true);
		} finally {
			setLoading(false);
		}
	};
	return (
		<div className="flex flex-col gap-4">
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="motion-source-file">{t("sourceSelect")}</FieldLabel>
					<NativeSelect
						className="w-full"
						id="motion-source-file"
						value={file}
						onChange={(event) => load(event.target.value)}
					>
						{[
							"design-system/motion/workbench/runtime.tsx",
							"design-system/motion/workbench/tuning.ts",
							"design-system/motion/workbench/references.ts",
						].map((path) => (
							<NativeSelectOption value={path} key={path}>
								{path.split("/").at(-1)}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</Field>
			</FieldGroup>
			<Button variant="outline" onClick={() => load(file)} disabled={loading}>
				<CodeIcon data-icon="inline-start" />
				{t(loading ? "sourceLoading" : "source")}
			</Button>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{t("sourceError")}</AlertDescription>
				</Alert>
			)}
			{sources[file] && (
				<pre className="source-code">
					<code>{sources[file]}</code>
				</pre>
			)}
		</div>
	);
}
export function WorkbenchInspector({
	entry,
	overrides,
	onChange,
	review,
	onReview,
	onExport,
}: {
	entry: AnimationEntry;
	overrides: Overrides;
	onChange: (next: Overrides) => void;
	review: Review;
	onReview: (next: Partial<Review>) => void;
	onExport: () => void;
}) {
	const parameters = parametersFor(entry);
	const count = Object.keys(overrides).length;
	return (
		<aside className="workbench-inspector" aria-label={t("detailsPanel")}>
			<header className="inspector-header">
				<div>
					<h2>{describe(entry, "title")}</h2>
				</div>
			</header>
			<Tabs defaultValue="parameters" className="inspector-tabs">
				<TabsList className="mx-5" variant="line">
					<TabsTrigger value="parameters">
						<SlidersHorizontalIcon data-icon="inline-start" />
						{t("parametersTab")}
					</TabsTrigger>
					<TabsTrigger value="review">
						<ClipboardCheckIcon data-icon="inline-start" />
						{t("reviewTab")}
					</TabsTrigger>
					<TabsTrigger value="source">
						<CodeIcon data-icon="inline-start" />
						{t("sourceTab")}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="parameters" className="inspector-scroll">
					<div className="flex flex-col gap-5">
						{parameters.length ? (
							<ParameterControls
								parameters={parameters}
								overrides={overrides}
								onChange={onChange}
							/>
						) : (
							<Alert>
								<AlertTitle>{t("noParameters")}</AlertTitle>
								<AlertDescription>{t("noParametersDetail")}</AlertDescription>
							</Alert>
						)}
						<Separator />
						<div className="flex flex-wrap gap-2">
							<Button variant="outline" size="sm" disabled={!count} onClick={() => onChange({})}>
								<RotateCcwIcon data-icon="inline-start" />
								{t("restoreDefaults")}
							</Button>
							<Button variant="ghost" size="sm" onClick={onExport}>
								<DownloadIcon data-icon="inline-start" />
								{t("exportDraft")}
							</Button>
						</div>
					</div>
				</TabsContent>
				<TabsContent value="review" className="inspector-scroll">
					<FieldGroup>
						<FieldSet>
							<FieldLegend>{t("allChecks")}</FieldLegend>
							<FieldGroup>
								{criteria.map((key) => (
									<Field key={key} orientation="horizontal">
										<Checkbox
											id={key}
											checked={review.checks?.includes(key) || false}
											onCheckedChange={(checked) =>
												onReview({
													checks:
														checked === true
															? [...(review.checks || []), key]
															: (review.checks || []).filter((value) => value !== key),
												})
											}
										/>
										<FieldLabel htmlFor={key}>{t(key)}</FieldLabel>
									</Field>
								))}
								<Field orientation="horizontal">
									<Checkbox
										id="motion-has-issue"
										checked={review.issue || false}
										onCheckedChange={(checked) => onReview({ issue: checked === true })}
									/>
									<FieldLabel htmlFor="motion-has-issue">{t("issue")}</FieldLabel>
								</Field>
							</FieldGroup>
						</FieldSet>
						<Separator />
						<Field className="motion-notes">
							<FieldLabel htmlFor="motion-notes">{t("notes")}</FieldLabel>
							<Textarea
								id="motion-notes"
								value={review.notes || ""}
								placeholder={t("notesPlaceholder")}
								onChange={(event) => onReview({ notes: event.target.value })}
							/>
						</Field>
					</FieldGroup>
				</TabsContent>
				<TabsContent value="source" className="inspector-scroll">
					<SourcePanel key={entry.id} />
				</TabsContent>
			</Tabs>
		</aside>
	);
}
