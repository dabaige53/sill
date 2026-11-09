import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";

/** A native modal keeps the article mounted, including its scroll and selection. */
export function MarkdownImageViewer({
	image,
	onClose,
}: {
	image: HTMLImageElement;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	useLayoutEffect(() => {
		const node = dialog.current;
		node.showModal();
		return () => {
			node.close();
			if (image.isConnected) image.focus({ preventScroll: true });
		};
	}, [image]);
	return createPortal(
		<dialog
			ref={dialog}
			className="markdown-image-viewer"
			aria-label={image.alt || copy("web.markdown.openImage")}
			onCancel={(event) => {
				event.stopPropagation();
			}}
			onClose={onClose}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<button
				type="button"
				className="icon-button markdown-image-close"
				aria-label={copy("web.photo.close")}
				onClick={onClose}
			>
				<Icon name="x" />
			</button>
			<img src={image.src} alt={image.alt} referrerPolicy="no-referrer" />
		</dialog>,
		document.body,
	);
}
