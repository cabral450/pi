import { describe, expect, test } from "vitest";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const BG_RESET = "\x1b[49m";

describe("UserMessageComponent", () => {
	test("keeps user message height stable without OSC 133 zone markers", () => {
		initTheme("dark");

		const component = new UserMessageComponent("hello");
		const lines = component.render(20);

		expect(lines).toHaveLength(3);
		expect(lines.join("\n")).not.toContain(OSC133_ZONE_START);
		expect(lines.join("\n")).not.toContain(OSC133_ZONE_END);
		expect(lines.join("\n")).not.toContain(OSC133_ZONE_FINAL);
		expect(lines[0].endsWith(BG_RESET)).toBe(true);
		expect(lines[1]).toContain("hello");
		expect(lines[2].endsWith(BG_RESET)).toBe(true);
	});
});
