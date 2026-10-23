import base from "./fixtures.json" with { type: "json" };
import media from "./media-fixtures.json" with { type: "json" };

/** All clients validate the same core and media cases. */
export const cardFixtures: {
	valid: { name: string; card: Record<string, any> }[];
	invalid: { name: string; card: Record<string, any> }[];
} = {
	valid: [...base.valid, ...media.valid],
	invalid: [...base.invalid, ...media.invalid],
};
