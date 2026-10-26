import { copy } from "../copy.ts";

export function ToastSurface() {
	return (
		<div id="toast" className="glass" role="status" aria-live="polite" hidden>
			<span id="toast-text" />
			<span id="toast-action" />
		</div>
	);
}

export function OfflineNotice() {
	return (
		<button type="button" id="offline" className="glass" data-action="retry" hidden>
			{copy("web.app.3d52574ce150")}
		</button>
	);
}

export function NewContentNotice() {
	return (
		<button
			type="button"
			id="new-count"
			className="glass"
			data-action="show-new"
			hidden
			aria-label={copy("web.app.3fa133e511d1")}
		/>
	);
}
