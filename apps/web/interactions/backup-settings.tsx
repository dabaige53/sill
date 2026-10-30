import React, { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "../copy.ts";
import { icon } from "./panel-primitives.tsx";
export type BackupApi = (path: string, options?: any) => Promise<any>;
const text = (key: string) => copy(("web.backup." + key) as any);
function BackupHeading({ glyph, title, hint }: { glyph: string; title: string; hint: string }) {
	return (
		<div className="settings-section-head">
			<span className="settings-section-icon">{icon(glyph, 20)}</span>
			<div>
				<h3>{text(title)}</h3>
				<p>{text(hint)}</p>
			</div>
		</div>
	);
}
export function BackupSettings({
	api,
	owner,
	host,
	onRestore,
}: {
	api: BackupApi;
	owner: string;
	host: boolean;
	onRestore?: () => Promise<void> | void;
}) {
	const [data, setData] = useState<any>({ targets: [], backups: [] });
	const [provider, setProvider] = useState("webdav"),
		[target, setTarget] = useState("");
	const [busy, setBusy] = useState(false),
		[message, setMessage] = useState(""),
		[preview, setPreview] = useState<any>(null),
		[pending, setPending] = useState<any>(null);
	const active = useRef(true);
	const creation = useRef<{ targetId: string; idempotencyKey: string } | null>(null);
	const get = (path: string) => api("/api/v1/backups" + path);
	const post = (path: string, body: any) =>
		api("/api/v1/backups" + path, { method: "POST", body: JSON.stringify(body) });
	const refresh = useCallback(async () => {
		const result = await api("/api/v1/backups");
		if (!active.current) return;
		setData(result);
		setTarget((old) => old || result.targets[0]?.id || "");
	}, [api]);
	useEffect(() => {
		active.current = !!owner;
		void refresh().catch(() => setMessage(text("failed")));
		return () => {
			active.current = false;
		};
	}, [owner, refresh]);
	async function run(action: () => Promise<void>) {
		if (busy) return;
		setBusy(true);
		setMessage("");
		try {
			await action();
		} catch (error: any) {
			if (error.code === "revision_conflict" || error.code === "idempotency_conflict") {
				setPending(null);
				setPreview(null);
			}
			if (active.current)
				setMessage(
					text(
						error.code === "backup_refresh_failed"
							? "restoredNeedsRefresh"
							: error.code === "revision_conflict"
								? "conflict"
								: error.code === "backup_auth_failed"
									? "authFailed"
									: error.code === "backup_unknown" || !error.status
										? "unknown"
										: "failed",
					),
				);
		} finally {
			if (active.current) setBusy(false);
		}
	}
	async function save(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const values = Object.fromEntries(new FormData(form));
		const update =
			(event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-update") === "true";
		await run(async () => {
			await post("/targets", { provider, ...values, ...(update ? { id: target } : {}) });
			form.reset();
			await refresh();
			setMessage(text("connected"));
		});
	}
	async function create() {
		await run(async () => {
			if (!creation.current)
				creation.current = { targetId: target, idempotencyKey: crypto.randomUUID() };
			const body = creation.current;
			await post("", body);
			creation.current = null;
			await refresh();
			setMessage(text("created"));
		});
	}
	async function restore() {
		const body = {
			backupId: preview.backupId,
			digest: preview.digest,
			expectedRevision: preview.expectedRevision,
			confirmed: true,
			idempotencyKey: crypto.randomUUID(),
		};
		setPending(body);
		await run(async () => {
			await post("/restore", body);
			setPending(null);
			setPreview(null);
			await onRestore?.();
			setMessage(text("restored"));
		});
	}
	async function verifyRestore() {
		await run(async () => {
			const result = await post("/restore/status", pending);
			if (result.result) {
				setPending(null);
				setPreview(null);
				await onRestore?.();
				setMessage(text("restored"));
			} else setMessage(text("notRestored"));
		});
	}
	const field = (name: string, secret = false) => (
		<label className="setting-row">
			<span>{text(name)}</span>
			<input
				name={name}
				type={secret ? "password" : "text"}
				required
				disabled={busy}
				autoComplete="off"
				spellCheck={false}
			/>
		</label>
	);
	return (
		<section className="backup-settings" aria-label={text("title")} aria-busy={busy}>
			<h2>{text("title")}</h2>
			<p className="panel-sub">{text("hint")}</p>
			<BackupHeading glyph="folder" title="configure" hint="configureHint" />
			{!host ? (
				<form onSubmit={save} className="settings-card">
					<div className="setting-row backup-provider">
						<span>{text("provider")}</span>
						<fieldset className="segmented">
							<legend className="sr-only">{text("provider")}</legend>
							{["webdav", "r2"].map((value) => (
								<button
									key={value}
									type="button"
									className={provider === value ? "on" : ""}
									aria-pressed={provider === value}
									disabled={busy}
									onClick={() => setProvider(value)}
								>
									{text(value)}
								</button>
							))}
						</fieldset>
					</div>
					{provider === "webdav" ? (
						<>
							{field("endpoint")}
							{field("username")}
							{field("password", true)}
						</>
					) : (
						<>
							{field("accountId")}
							{field("bucket")}
							{field("accessKeyId")}
							{field("secretAccessKey", true)}
						</>
					)}
					<div className="setting-row settings-actions">
						<button type="submit" className="text-link" disabled={busy}>
							{icon("plus", 16)}
							{text("save")}
						</button>
						<button
							type="submit"
							data-update="true"
							className="text-link"
							disabled={busy || !target}
						>
							{icon("lock", 16)}
							{text("updateSecret")}
						</button>
					</div>
				</form>
			) : (
				<p className="panel-sub">{text("hostSetup")}</p>
			)}
			<BackupHeading glyph="cloud-upload" title="manual" hint="manualHint" />
			<div className="settings-card">
				<label className="setting-row">
					<span>{text("target")}</span>
					<select
						value={target}
						disabled={busy || !!creation.current}
						onChange={(e) => setTarget(e.target.value)}
					>
						<option value="">{text("choose")}</option>
						{data.targets.map((t: any) => (
							<option key={t.id} value={t.id}>
								{t.config.provider === "webdav" ? t.config.endpoint : `R2 · ${t.config.bucket}`}
							</option>
						))}
					</select>
				</label>
				<div className="setting-row settings-actions">
					<button
						type="button"
						className="text-link"
						disabled={busy || !target}
						onClick={() =>
							run(async () => {
								await post(`/targets/${target}/check`, {});
								setMessage(text("connected"));
							})
						}
					>
						{icon("shield-check", 16)}
						{text("check")}
					</button>
					<button
						type="button"
						className="solid-button"
						disabled={busy || !target || !!pending}
						onClick={create}
					>
						{icon("cloud-upload", 16)}
						{creation.current ? text("retry") : text("create")}
					</button>
					<button type="button" className="text-link" disabled={busy} onClick={() => run(refresh)}>
						{icon("refresh", 16)}
						{text("refresh")}
					</button>
				</div>
			</div>
			{message && (
				<p className="settings-feedback" role="status">
					{icon("info", 16)}
					{message}
				</p>
			)}
			<BackupHeading glyph="history" title="history" hint="historyHint" />
			{!data.backups.length && (
				<div className="settings-card settings-empty">
					<span className="muted">{icon("history", 20)}</span>
					<p>{text("empty")}</p>
				</div>
			)}
			{data.backups.map((b: any) => (
				<div className="settings-card backup-record" key={b.id}>
					<div className="setting-row">
						<span className="settings-link-label">
							{icon("file", 18)}
							<time dateTime={b.createdAt}>{new Date(b.createdAt).toLocaleString()}</time>
						</span>
						<span className="backup-status">{text(b.status)}</span>
					</div>
					<div className="setting-row settings-actions">
						<button
							type="button"
							className="text-link"
							disabled={busy || !!pending}
							onClick={() =>
								run(async () => {
									setPreview(await get(`/${b.id}/preview`));
								})
							}
						>
							{icon("eye", 16)}
							{text("preview")}
						</button>
						<button
							type="button"
							className="text-link"
							disabled={busy}
							onClick={() =>
								run(async () => {
									await get(`/${b.id}/check`);
									await refresh();
									setMessage(text("verified"));
								})
							}
						>
							{icon("shield-check", 16)}
							{text("verify")}
						</button>
						<button
							type="button"
							className="text-link"
							disabled={busy}
							onClick={() =>
								run(async () => {
									const snapshot = await get(`/${b.id}/download`);
									if (!active.current) return;
									const url = URL.createObjectURL(
										new Blob([JSON.stringify(snapshot)], { type: "application/json" }),
									);
									const a = document.createElement("a");
									a.href = url;
									a.download = `sill-${b.id}.json`;
									a.click();
									URL.revokeObjectURL(url);
								})
							}
						>
							{icon("download", 16)}
							{text("download")}
						</button>
					</div>
				</div>
			))}
			{preview && (
				<div className="settings-card backup-restore">
					<BackupHeading glyph="history" title="restoreTitle" hint="replaceWarning" />
					<p>
						{text("cards")}: {preview.cards} · {text("added")}: {preview.added} · {text("removed")}:{" "}
						{preview.removed}
					</p>
					<div className="setting-row settings-actions">
						{pending ? (
							<>
								<button type="button" className="text-link" disabled={busy} onClick={verifyRestore}>
									{text("verifyRestore")}
								</button>
								<button
									type="button"
									className="text-link"
									disabled={busy}
									onClick={() =>
										run(async () => {
											await post("/restore", pending);
											setPending(null);
											setPreview(null);
											await onRestore?.();
											setMessage(text("restored"));
										})
									}
								>
									{text("retryRestore")}
								</button>
							</>
						) : (
							<>
								<button type="button" className="text-link" disabled={busy} onClick={restore}>
									{text("confirm")}
								</button>
								<button
									type="button"
									className="text-link"
									disabled={busy}
									onClick={() => setPreview(null)}
								>
									{copy("web.cancel")}
								</button>
							</>
						)}
					</div>
				</div>
			)}
		</section>
	);
}
