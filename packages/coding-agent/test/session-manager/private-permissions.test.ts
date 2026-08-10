import {
	chmodSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionManager } from "../../src/core/session-manager.ts";

const POSIX = process.platform !== "win32";
const roots: string[] = [];

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "pi-private-session-"));
	roots.push(root);
	return root;
}

function mode(target: string): number {
	return lstatSync(target).mode & 0o777;
}

function appendPersistedExchange(session: SessionManager, label = "private session"): string {
	session.appendMessage({ role: "user", content: label, timestamp: Date.now() });
	session.appendMessage({
		role: "assistant",
		content: [{ type: "text", text: "ok" }],
		api: "test",
		provider: "test",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	});
	return session.getSessionFile()!;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!POSIX)("private session persistence", () => {
	it("creates and re-hardens custom session directories and files", () => {
		const root = tempRoot();
		const sessionDir = join(root, "custom-sessions");
		mkdirSync(sessionDir, { recursive: true, mode: 0o777 });
		chmodSync(sessionDir, 0o777);

		const session = SessionManager.create(root, sessionDir);
		expect(mode(sessionDir)).toBe(0o700);
		const sessionFile = appendPersistedExchange(session);
		expect(mode(sessionFile)).toBe(0o600);

		chmodSync(sessionDir, 0o755);
		chmodSync(sessionFile, 0o644);
		session.appendThinkingLevelChange("low");
		expect(mode(sessionDir)).toBe(0o700);
		expect(mode(sessionFile)).toBe(0o600);
	});

	it("preserves private modes across resume, migration, branch, explicit import, and fork", () => {
		const root = tempRoot();
		const sessionDir = join(root, "sessions");
		const source = SessionManager.create(root, sessionDir);
		const sourceFile = appendPersistedExchange(source);

		chmodSync(sourceFile, 0o644);
		const resumed = SessionManager.open(sourceFile, sessionDir);
		expect(mode(sourceFile)).toBe(0o600);
		const leaf = resumed.getLeafId()!;
		const branchFile = resumed.createBranchedSession(leaf)!;
		expect(mode(branchFile)).toBe(0o600);

		const legacyFile = join(sessionDir, "legacy.jsonl");
		writeFileSync(
			legacyFile,
			`${JSON.stringify({ type: "session", id: "legacy", timestamp: new Date().toISOString(), cwd: root })}\n${JSON.stringify({ type: "message", timestamp: new Date().toISOString(), message: { role: "user", content: "migrate", timestamp: 1 } })}\n`,
			{ mode: 0o644 },
		);
		chmodSync(legacyFile, 0o644);
		SessionManager.open(legacyFile, sessionDir);
		expect(mode(legacyFile)).toBe(0o600);
		expect(JSON.parse(readFileSync(legacyFile, "utf8").split("\n")[0]).version).toBe(3);

		const importedFile = join(sessionDir, "explicit-import.jsonl");
		writeFileSync(importedFile, readFileSync(sourceFile), { mode: 0o644 });
		chmodSync(importedFile, 0o644);
		SessionManager.open(importedFile, sessionDir);
		expect(mode(importedFile)).toBe(0o600);

		const forkDir = join(root, "forks");
		const forked = SessionManager.forkFrom(sourceFile, join(root, "target-project"), forkDir);
		expect(mode(forkDir)).toBe(0o700);
		expect(mode(forked.getSessionFile()!)).toBe(0o600);
	});

	it("refuses symlink session files and custom session directories without touching their targets", () => {
		const root = tempRoot();
		const realDir = join(root, "real-sessions");
		mkdirSync(realDir, { recursive: true, mode: 0o755 });
		const realFile = join(realDir, "real.jsonl");
		writeFileSync(
			realFile,
			`${JSON.stringify({ type: "session", version: 3, id: "real", timestamp: new Date().toISOString(), cwd: root })}\n`,
			{ mode: 0o644 },
		);
		chmodSync(realFile, 0o644);
		const linkedFile = join(realDir, "linked.jsonl");
		symlinkSync(realFile, linkedFile);

		expect(() => SessionManager.open(linkedFile, realDir)).toThrow(/symbolic link|symlink/i);
		expect(mode(realFile)).toBe(0o644);

		const linkedDir = join(root, "linked-sessions");
		symlinkSync(realDir, linkedDir, "dir");
		expect(() => SessionManager.create(root, linkedDir)).toThrow(/symbolic link|symlink/i);
		expect(mode(realDir)).toBe(0o755);
	});
});
