import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { SessionEntry } from "../src/core/session-manager.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function userEntry(id: string, parentId: string | null, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: new Date().toISOString(),
		message: { role: "user", content: [{ type: "text", text }], timestamp: Date.now() },
	};
}

function bashEntry(id: string, parentId: string | null, command: string, excludeFromContext = false): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: new Date().toISOString(),
		message: {
			role: "bashExecution",
			command,
			output: "",
			exitCode: 0,
			cancelled: false,
			truncated: false,
			excludeFromContext,
			timestamp: Date.now(),
		},
	};
}

describe("InteractiveMode prompt history", () => {
	test("merges repo sessions, the active branch, shell commands, and in-memory history", () => {
		const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-prompt-history-"));
		tempDirs.push(sessionDir);
		const currentSessionFile = path.join(sessionDir, "current.jsonl");
		const oldSessionFile = path.join(sessionDir, "old.jsonl");
		const oldEntries = [userEntry("old-user", null, "older"), bashEntry("old-bash", "old-user", "pwd")];
		fs.writeFileSync(
			oldSessionFile,
			[
				JSON.stringify({
					type: "session",
					version: 3,
					id: "old-session",
					timestamp: new Date().toISOString(),
					cwd: sessionDir,
				}),
				...oldEntries.map((entry) => JSON.stringify(entry)),
			].join("\n"),
		);

		const activeBranch = [
			userEntry("current-user", null, "current"),
			bashEntry("current-bash", "current-user", "ls", true),
		];
		let replacedHistory: readonly string[] | undefined;
		const editor = {
			getHistory: () => ["draft", "current"],
			setHistory: (history: readonly string[]) => {
				replacedHistory = [...history];
			},
		};
		const sessionManager = {
			getBranch: () => activeBranch,
			getSessionDir: () => sessionDir,
			getSessionFile: () => currentSessionFile,
		};
		const mode = Object.create(InteractiveMode.prototype) as Record<string, unknown>;
		mode.runtimeHost = { session: { sessionManager } };
		mode.editor = editor;

		const rebuild = Reflect.get(InteractiveMode.prototype, "rebuildEditorPromptHistoryFromBranch") as (
			this: unknown,
			branchEntries?: SessionEntry[],
			options?: { preserveCurrent?: boolean },
		) => void;
		rebuild.call(mode, undefined, { preserveCurrent: true });

		expect(replacedHistory).toEqual(["draft", "current", "!!ls", "!pwd", "older"]);
	});
});
