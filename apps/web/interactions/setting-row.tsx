import type { ReactNode } from "react";

export function SettingRow({
	label,
	side,
	example,
}: {
	label?: ReactNode;
	side?: ReactNode;
	example?: { text: string; id: string };
}) {
	return (
		<div className="setting-row">
			<span>
				{label}
				{example && (
					<small className="setting-example" id={example.id}>
						{example.text}
					</small>
				)}
			</span>
			<span className="setting-side">{side}</span>
		</div>
	);
}
