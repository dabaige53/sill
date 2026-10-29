import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./app-fixture.ts";

test("calendar download preserves punctuation and newlines in one event", () => {
	const f = fixture();
	try {
		f.Store.state.cards = [
			{
				id: "meeting",
				type: "event",
				title: "周会, 产品;设计\\评审\n第二行",
				location: "三楼, A;B\r\n会议室",
				start: 1792000000000,
				end: 1792003600000,
			},
		];
		let downloaded: any[] = [];
		f.app.download = (...args: any[]) => {
			downloaded = args;
		};
		f.app.action("download-calendar", "meeting");
		assert.equal(downloaded[0], "sill.ics");
		assert.equal(downloaded[2], "text/calendar");
		const text = downloaded[1];
		assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n"));
		assert.ok(text.includes("SUMMARY:周会\\, 产品\\;设计\\\\评审\\n第二行\r\n"));
		assert.ok(text.includes("LOCATION:三楼\\, A\\;B\\n会议室\r\n"));
		assert.equal(text.split("BEGIN:VEVENT").length, 2);
		assert.ok(text.endsWith("END:VCALENDAR\r\n"));
	} finally {
		f.dom.window.close();
	}
});
