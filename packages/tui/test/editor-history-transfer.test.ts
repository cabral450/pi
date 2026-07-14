import assert from "node:assert";
import { describe, it } from "node:test";
import { Editor } from "../src/components/editor.ts";
import { TUI } from "../src/tui.ts";
import { defaultEditorTheme } from "./test-themes.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

describe("Editor history transfer", () => {
	it("gets and replaces most-recent-first prompt history defensively", () => {
		const editor = new Editor(new TUI(new VirtualTerminal()), defaultEditorTheme);
		editor.setHistory(["newest", "older"]);

		const history = editor.getHistory();
		assert.deepStrictEqual(history, ["newest", "older"]);
		history[0] = "mutated";
		assert.deepStrictEqual(editor.getHistory(), ["newest", "older"]);

		editor.handleInput("\x1b[A");
		assert.strictEqual(editor.getText(), "newest");
		editor.handleInput("\x1b[A");
		assert.strictEqual(editor.getText(), "older");
	});

	it("resets active history browsing when history is replaced", () => {
		const editor = new Editor(new TUI(new VirtualTerminal()), defaultEditorTheme);
		editor.setHistory(["old"]);
		editor.handleInput("\x1b[A");
		editor.setText("");

		editor.setHistory(["replacement"]);
		editor.handleInput("\x1b[A");
		assert.strictEqual(editor.getText(), "replacement");
	});
});
