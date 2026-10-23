import React, { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "../copy.ts";
export type BackupApi = (path: string, options?: any) => Promise<any>;
const text = (key: string) => copy(("web.backup." + key) as any);
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
			{text(name)}
			<input
				name={name}
				type={secret ? "password" : "text"}
				required
				autoComplete="off"
				spellCheck={false}
			/>
		</label>
	);
	return (
		<section aria-label={text("title")}>
			<h3>{text("title")}</h3>
			<p className="panel-sub">{text("hint")}</p>
			{!host ? (
				<form onSubmit={save} className="settings-card">
					<label className="setting-row">
						{text("provider")}
						<select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={busy}>
							<option value="webdav">{text("webdav")}</option>
							<option value="r2">{text("r2")}</option>
						</select>
					</label>
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
					<div className="setting-row">
						<button type="submit" className="text-link" disabled={busy}>
							{text("save")}
						</button>
						<button
							type="submit"
							data-update="true"
							className="text-link"
							disabled={busy || !target}
						>
							{text("updateSecret")}
						</button>
					</div>
				</form>
			) : (
				<p className="panel-sub">{text("hostSetup")}</p>
			)}
			<div className="settings-card">
				<label className="setting-row">
					{text("target")}
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
				<div className="setting-row">
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
						{text("check")}
					</button>
					<button
						type="button"
						className="text-link"
						disabled={busy || !target || !!pending}
						onClick={create}
					>
						{creation.current ? text("retry") : text("create")}
					</button>
					<button type="button" className="text-link" disabled={busy} onClick={() => run(refresh)}>
						{text("refresh")}
					</button>
				</div>
			</div>
			{message && <p role="status">{message}</p>}
			<h3>{text("history")}</h3>
			{!data.backups.length && <p className="panel-sub">{text("empty")}</p>}
			{data.backups.map((b: any) => (
				<div className="setting-row" key={b.id}>
					<span>
						{new Date(b.createdAt).toLocaleString()} · {text(b.status)}
					</span>
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
						{text("download")}
					</button>
				</div>
			))}
			{preview && (
				<div className="settings-card">
					<p>{text("replaceWarning")}</p>
					<p>
						{text("cards")}: {preview.cards} · {text("added")}: {preview.added} · {text("removed")}:{" "}
						{preview.removed}
					</p>
					<div className="setting-row">
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
