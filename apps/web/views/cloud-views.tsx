import React from "react";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { type BackupApi, BackupSettings } from "../interactions/backup-settings.tsx";
import { WelcomeView } from "../interactions/panels-components.tsx";

export { FeedBoot as CloudBoot } from "../atoms/feed-boot.tsx";

export function CloudWelcome({
	user,
	host,
	connectionError,
	callbackFailed,
	drafts,
}: {
	user: boolean;
	host: boolean;
	connectionError: boolean;
	callbackFailed: boolean;
	drafts: [string, { locked?: boolean; values: { title?: string } }][];
}) {
	const recovery = drafts
		.filter(([, draft]) => draft.locked)
		.map(([key, draft]) => (
			<button
				key={key}
				type="button"
				className="soft-button"
				data-action="resume-draft"
				data-id={key}
			>
				{copy("web.cloudentry.b9e8d3a1bc64")}
				{draft.values.title || copy("web.unnamedNote")}
			</button>
		));
	if (host && !user && !connectionError)
		return (
			<WelcomeView
				actions={recovery}
				detail={
					<p className="cloud-detail" role="status">
						{copy("web.cloudentry.c4b63bd25d98")}
					</p>
				}
			/>
		);
	if (host && !user)
		return (
			<WelcomeView
				actions={
					<>
						<button type="button" className="solid-button" data-action="refresh">
							{copy("web.cloudentry.b31296c9c33e")}
						</button>
						{recovery}
					</>
				}
				detail={<p className="cloud-detail">{copy("web.cloudentry.8b8a45a6a4a2")}</p>}
			/>
		);
	return (
		<WelcomeView
			actions={
				<>
					{!user && (
						<a
							className="solid-button"
							href={callbackFailed ? "/auth/login?login_error=1" : "/auth/login"}
						>
							{copy("auth.loginTitle")}
						</a>
					)}
					{recovery}
				</>
			}
			detail={
				recovery.length ? (
					<p className="cloud-detail">{copy("web.cloudentry.a7c0c329d7a1")}</p>
				) : user ? (
					<p className="cloud-detail">{copy("web.cloudentry.4da32c150cfa")}</p>
				) : null
			}
		/>
	);
}
export function CloudSettings({
	user,
	host,
	backupApi,
	backupOwner,
	onBackupRestore,
}: {
	user: boolean;
	host: boolean;
	backupApi?: BackupApi;
	backupOwner?: string;
	onBackupRestore?: () => Promise<void> | void;
}) {
	return (
		<>
			<h2>{copy("web.cloudentry.ebdc835e8f87")}</h2>
			<div className="settings-card">
				<div className="setting-row">
					<span>{copy("web.settings.storage.location")}</span>
					<span className="setting-side">{copy("web.settings.storage.cloudAccount")}</span>
				</div>
			</div>
			<div className="settings-card">
				<div className="setting-row">
					<button type="button" className="text-link" data-action="export-all">
						{copy("web.cloud.export")}
					</button>
				</div>
				<div className="setting-row">
					<button type="button" className="text-link warn" data-action="clear-all">
						{copy("web.cloud.clear")}
					</button>
				</div>
			</div>
			{user && backupApi && backupOwner && (
				<BackupSettings
					key={backupOwner}
					api={backupApi}
					owner={backupOwner}
					host={host}
					onRestore={onBackupRestore}
				/>
			)}
			{user && (
				<div className="settings-card">
					<div className="setting-row">
						<span>{copy("web.cloudentry.4cc5be794516")}</span>
						<button type="button" className="text-link" id="cloud-logout">
							{host ? copy("web.cloudentry.55cce35fb13e") : copy("web.cloudentry.3ab8cc15939f")}
						</button>
					</div>
				</div>
			)}
		</>
	);
}
export function CloudCompose({
	id,
	host,
	canDelete,
	values,
}: {
	id?: string;
	host: boolean;
	canDelete: boolean;
	values: { title: string; body: string; read: boolean };
}) {
	return (
		<div className="sheet cloud-compose">
			<header className="cloud-compose-head">
				<h1 id="modal-title">
					{id ? copy("web.cloudentry.b1c46471ae91") : copy("web.cloudentry.d3d2d99f6003")}
				</h1>
				<span id="cloud-draft-state" role="status" />
				<button
					type="button"
					className="icon-button "
					aria-label={copy("web.cloudentry.48ada7873f17")}
					data-action="close"
				>
					<Icon name="x" size={18} />
				</button>
			</header>
			<form id="cloud-editor">
				<div className="cloud-compose-body">
					<label className="sr-only" htmlFor="cloud-title">
						{copy("web.title")}
					</label>
					<input
						id="cloud-title"
						required
						maxLength={1000}
						placeholder={copy("web.cloudentry.a90371571cc7")}
						defaultValue={values.title}
					/>
					<label className="sr-only" htmlFor="cloud-body">
						{copy("web.body")}
					</label>
					<textarea
						id="cloud-body"
						rows={10}
						placeholder={copy("web.cloudentry.cbef01d0a3d3")}
						defaultValue={values.body}
					/>
					<div className="cloud-compose-meta">
						<label>
							<input id="cloud-read" type="checkbox" defaultChecked={values.read} />
							{copy("web.cloudentry.419893e7d756")}
						</label>
						<span id="cloud-word-count" className="num" />
					</div>
					<p id="cloud-save-status" role="status" />
				</div>
				<footer className="cloud-compose-actions">
					<button className="solid-button" type={host ? "button" : "submit"} id="cloud-save">
						{copy("web.cloudentry.c6a1f219cdc8")}
					</button>
					<button type="button" className="soft-button" data-action="close">
						{copy("web.close")}
					</button>
					<button type="button" className="text-link" id="cloud-discard" hidden>
						{copy("web.cloudentry.70403791a994")}
					</button>
					{id && canDelete && (
						<button className="text-link cloud-delete" type="button" id="cloud-delete">
							{copy("web.cloudentry.92d8b5e3dc99")}
						</button>
					)}
					<span className="cloud-save-hint">⌘ / Ctrl + Enter</span>
				</footer>
			</form>
		</div>
	);
}
export function ConfirmActions({
	label,
	action,
	id,
	danger = false,
}: {
	label: string;
	action?: string;
	id?: string;
	danger?: boolean;
}) {
	return (
		<>
			<button type="button" className="soft-button" data-action="close">
				{copy("web.cancel")}
			</button>
			<button
				type="button"
				className="solid-button"
				id={id}
				style={danger ? { background: "var(--alert)" } : undefined}
				data-action={action}
			>
				{label}
			</button>
		</>
	);
}
export function RecoveryNotice({ message, cloud = false }: { message: string; cloud?: boolean }) {
	return (
		<>
			<span role="status">{message}</span>
			{["retry", "export", "discard"].map((action, index) => (
				<button key={action} type="button" className="text-link" data-action={`sync-${action}`}>
					{copy(
						(
							[
								"web.localsync.87d53fea3f05",
								"web.localsync.9d43037aecb7",
								"web.localsync.169c72a6d254",
							] as const
						)[index],
					)}
				</button>
			))}
		</>
	);
}
