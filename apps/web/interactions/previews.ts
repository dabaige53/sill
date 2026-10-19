import { renderToStaticMarkup } from "react-dom/server";
import { PanelViews } from "./panels-components.tsx";
import { previewView } from "./previews-components.tsx";

export { relativeTime } from "./previews-components.tsx";
/** Static compatibility entry; live overlays render previewView directly. */
export function preview(...args: Parameters<typeof previewView>) {
	return renderToStaticMarkup(previewView.apply(PanelViews, args));
}
