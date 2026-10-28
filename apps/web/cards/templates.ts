import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardView, OpenStackView, ShelfView, StackView } from "./components.tsx";
import { CardPresentation } from "./presentation.ts";

export { CardView, OpenStackView, ShelfView, StackView };

function cardHTML(c?: any, options: any = {}) {
	return renderToStaticMarkup(createElement(CardView, { card: c, options }));
}
function stackHTML(key?: any, cards?: any) {
	return renderToStaticMarkup(createElement(StackView, { stackKey: key, cards }));
}
function stackOpenHTML(key?: any, cards?: any) {
	return renderToStaticMarkup(createElement(OpenStackView, { stackKey: key, cards }));
}
function shelfHTML(read?: any, stale?: any) {
	return renderToStaticMarkup(createElement(ShelfView, { read, stale }));
}

export { CardPresentation, cardHTML, shelfHTML, stackHTML, stackOpenHTML };
