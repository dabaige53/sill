// Previews render demo cards whose times are relative to now. A fixed clock and zone keep the
// generated files the same on every run. Import this before any product module.
process.env.TZ = "Asia/Shanghai";
const fixed = Date.parse("2026-10-20T09:30:00+08:00");
class FixedDate extends Date {
	constructor(...args: unknown[]) {
		super(...((args.length ? args : [fixed]) as [number]));
	}
	static now() {
		return fixed;
	}
}
globalThis.Date = FixedDate as DateConstructor;
