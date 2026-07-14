import { describe, expect, test } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";

describe("built-in slash command aliases", () => {
	test("registers clear and exit aliases", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "clear",
			description: "Start a new session (alias for /new)",
		});
		expect(BUILTIN_SLASH_COMMANDS.some((command) => command.name === "exit")).toBe(true);
	});
});
