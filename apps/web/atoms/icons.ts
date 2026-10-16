/**
 * Mono24: locally authored SVG primitives behind one renderer.
 * Production replacement point: Lucide. No icon-font or SF Symbols files are distributed.
 */
const Glyphs = {
	"bell-off":
		'<path d="M10 21h4M6 8a6 6 0 0 1 9.5-4.9M18 8v5l2 3H6.5M4 4l16 16"/><path d="M6 8v5l-2 3h3"/>',
	gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
	glasses:
		'<circle cx="6.5" cy="14.5" r="3.5"/><circle cx="17.5" cy="14.5" r="3.5"/><path d="M10 14.5a2 2 0 0 1 4 0M3 14.5 5 6m16 8.5L19 6"/>',
	rss: '<path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1"/>',
	globe:
		'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
	chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z"/>',
	mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
	image:
		'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/>',
	folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
	pull: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4m2-2-2 2 2 2"/>',
	target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
	upload: '<path d="M12 15V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
	lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
	chart: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
	at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
	pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
	chevron: '<path d="m9 6 6 6-6 6"/>',
	monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8m-4-4v4"/>',
	keyboard:
		'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',

	circle: '<circle cx="12" cy="12" r="9"/>',
	trash: '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/>',
	link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
	forward: '<path d="m13 5 7 7-7 7M4 12h16"/>',
	rewind: '<path d="m11 7-5 5 5 5m7-10-5 5 5 5"/>',
	ffwd: '<path d="m13 7 5 5-5 5M6 7l5 5-5 5"/>',
	sparkles:
		'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="M20 2v4m-2-2h4"/>',
	refresh: '<path d="M20 8a8 8 0 0 0-14-2L3 9m0-5v5h5M4 16a8 8 0 0 0 14 2l3-3m-5 0h5v5"/>',
	filter:
		'<path d="M4 6h7m4 0h5M4 12h2m4 0h10M4 18h11m4 0h1"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
	search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
	bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
	tag: '<path d="M3 4v7l10 10 8-8L11 3H4a1 1 0 0 0-1 1Z"/><circle cx="7.5" cy="7.5" r="1"/>',
	note: '<path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M8 8h5M8 12h3"/><path d="m14 12 6-6 2-2-2-2-2 2-6 6-1 4Z"/>',
	more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
	check: '<path d="m5 12 4 4L19 6"/>',
	"check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
	x: '<path d="m6 6 12 12M18 6 6 18"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
	up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
	back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
	expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
	collapse: '<path d="M3 8h5V3m13 5h-5V3M3 16h5v5m13-5h-5v5"/>',
	external:
		'<path d="M14 3h7v7M21 3l-10 10M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
	clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
	calendar:
		'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18M7 14h2m3 0h2m3 0h0M7 17h2m3 0h2"/>',
	mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
	book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/><path d="M12 5v15"/>',
	layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 17l9 5 9-5"/>',
	bell: '<path d="M5 9a7 7 0 0 1 14 0c0 8 2 8 2 9H3c0-1 2-1 2-9M9 21h6"/>',
	play: '<path d="m9 5 11 7-11 7Z"/>',
	pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
	file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 14h8M8 17h5"/>',
	download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
	video: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
	select: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>',
	undo: '<path d="M3 5v6h6M3 11a9 9 0 1 1 2 8"/>',
	info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
	home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6v5.5H5.5A1.5 1.5 0 0 1 4 19Z"/>',
	person: '<circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 20a7.25 7.25 0 0 1 14.5 0"/>',
	grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
	grip: '<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>',
	send: '<path d="m21 3-7 18-4-7-7-4Zm0 0L10 14"/>',
	quote: '<path d="M10 5H4v7h5c0 4-2 6-5 7M21 5h-6v7h5c0 4-2 6-5 7"/>',
	eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
	ring: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9" stroke-width="3"/>',
	moon: '<path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z"/>',
};
/** Stroke follows the size tier in the design manual: S16 2.0, M20 1.8, L24 1.65. */
function iconStroke(size: number) {
	return size <= 17 ? 2 : size <= 21 ? 1.8 : 1.65;
}
function icon(name?: any, size: any = 18) {
	return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${iconStroke(Number(size))}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${Glyphs[name] || Glyphs.file}</svg>`;
}
/** The Sill mark: sky above, a ledge, two cards resting on it. */
function sillIcon(size: any = 64) {
	return `<svg class="sill-icon" width="${size}" height="${size}" viewBox="0 0 160 160" aria-hidden="true" style="border-radius:${Math.round(size * 0.225)}px;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 6px 16px rgba(0,0,0,.1);flex:none"><defs><linearGradient id="sill-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bcd5ef"/><stop offset=".62" stop-color="#eef4fa"/><stop offset=".62" stop-color="#f7f5f0"/><stop offset="1" stop-color="#ebe7df"/></linearGradient></defs><rect width="160" height="160" rx="36" fill="url(#sill-g)"/><rect x="0" y="97" width="160" height="5" fill="#fff" opacity=".9"/><rect x="44" y="58" width="34" height="42" rx="7" fill="#fff" stroke="rgba(0,0,0,.06)"/><rect x="84" y="68" width="32" height="32" rx="7" fill="#fff" stroke="rgba(0,0,0,.06)"/><rect x="50" y="66" width="16" height="4" rx="2" fill="#0066cc"/></svg>`;
}

export { Glyphs, icon, sillIcon };
