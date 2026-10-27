import { animate, motionValue } from "motion";

type Spring = { visualDuration: number; bounce: number };

/** Independent edges preserve velocity when a new destination interrupts the stretch. */
export function stretchEdges(
	paint: (start: number, end: number) => void,
	config: { lead: Spring; trail: Spring },
) {
	const start = motionValue(0);
	const end = motionValue(0);
	const draw = () => paint(start.get(), end.get());
	const offStart = start.on("change", draw);
	const offEnd = end.on("change", draw);
	let placed = false;
	return {
		move(a: number, b: number, instant = false) {
			if (!placed || instant) {
				start.jump(a);
				end.jump(b);
				placed = true;
				draw();
				return;
			}
			const forward = a >= start.get();
			animate(start, a, { type: "spring", ...(forward ? config.trail : config.lead) });
			animate(end, b, { type: "spring", ...(forward ? config.lead : config.trail) });
		},
		destroy() {
			start.stop();
			end.stop();
			offStart();
			offEnd();
		},
	};
}
