import { useEffect, useRef, useState } from "react";
import { type AnimationEntry, describe, exampleURL, type Platform, t } from "./catalog.ts";
import type { Overrides } from "./tuning.ts";

export function previewURL(
	entry: AnimationEntry,
	platform: Platform,
	overrides: Overrides,
	_theme: string,
	embedded = true,
) {
	const url = new URL(exampleURL(entry.id, platform, false, embedded), location.href);
	if (Object.keys(overrides).length) url.searchParams.set("tuning", JSON.stringify(overrides));
	return url.href;
}
export function WorkbenchPreview({
	entry,
	platform,
	overrides,
	reset,
	theme,
}: {
	entry: AnimationEntry;
	platform: Platform;
	overrides: Overrides;
	reset: number;
	theme: string;
}) {
	const parent = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

	const url = previewURL(entry, platform, overrides, theme);

	useEffect(() => {
		const observer = new ResizeObserver(([value]) =>
			setSize({ width: value.contentRect.width, height: value.contentRect.height }),
		);
		if (parent.current) observer.observe(parent.current);
		return () => observer.disconnect();
	}, []);
	const frameWidth = platform === "phone" ? 390 : Math.max(720, size.width - 48);
	const frameHeight = platform === "phone" ? 844 : Math.max(520, size.height - 48);
	const scale = Math.max(
		0.1,
		Math.min(1, (size.width - 48) / frameWidth, (size.height - 48) / frameHeight),
	);
	return (
		<div className="preview-stage" ref={parent} data-platform={platform}>
			<div
				className="preview-device"
				style={{ width: frameWidth * scale, height: frameHeight * scale }}
			>
				<iframe
					key={url + reset}
					title={describe(entry, "title") + " · " + t(platform)}
					src={url}
					style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})` }}
				/>
			</div>
		</div>
	);
}
