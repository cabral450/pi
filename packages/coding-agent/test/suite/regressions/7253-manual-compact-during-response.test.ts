import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../harness.ts";

function createNoopTool(): AgentTool {
	return {
		name: "noop",
		label: "No-op",
		description: "Return immediately",
		parameters: Type.Object({}),
		execute: async () => ({ content: [{ type: "text", text: "done" }], details: {} }),
	};
}

describe("issue #7253: manual compaction during an active response", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("serializes a settled-hook compaction with a concurrent manual request", async () => {
		let markSecondResponseStarted = () => {};
		const secondResponseStarted = new Promise<void>((resolve) => {
			markSecondResponseStarted = resolve;
		});
		let releaseSecondResponse = () => {};
		const secondResponseReleased = new Promise<void>((resolve) => {
			releaseSecondResponse = resolve;
		});
		let markCompactionHookStarted = () => {};
		const compactionHookStarted = new Promise<void>((resolve) => {
			markCompactionHookStarted = resolve;
		});
		let releaseCompactionHook = () => {};
		const compactionHookReleased = new Promise<void>((resolve) => {
			releaseCompactionHook = resolve;
		});
		let compactionHookCalls = 0;
		let requestSettledCompaction = true;

		const harness = await createHarness({
			models: [{ id: "faux-1", contextWindow: 1000, maxTokens: 100 }],
			// Automatic compaction is off so only the settled hook and the manual request compete.
			settings: { compaction: { enabled: false, reserveTokens: 999, keepRecentTokens: 2 } },
			tools: [createNoopTool()],
			extensionFactories: [
				(pi) => {
					pi.on("session_before_compact", async (event) => {
						compactionHookCalls++;
						if (compactionHookCalls === 1) {
							markCompactionHookStarted();
							await compactionHookReleased;
						}
						return {
							compaction: {
								summary: "shared checkpoint",
								firstKeptEntryId: event.preparation.firstKeptEntryId,
								tokensBefore: event.preparation.tokensBefore,
								details: {},
							},
						};
					});
					pi.on("agent_settled", (_event, ctx) => {
						if (!requestSettledCompaction) return;
						requestSettledCompaction = false;
						ctx.compact({ onError: () => {} });
					});
				},
			],
		});
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("noop", {}), { stopReason: "toolUse" }),
			async () => {
				markSecondResponseStarted();
				await secondResponseReleased;
				return fauxAssistantMessage("second response");
			},
		]);

		const promptPromise = harness.session.prompt("Run the tool, then continue responding.");
		await secondResponseStarted;
		const compactPromise = harness.session.compact();
		releaseSecondResponse();
		await compactionHookStarted;
		await new Promise((resolve) => setImmediate(resolve));
		releaseCompactionHook();
		await Promise.all([promptPromise, compactPromise]);
		await new Promise((resolve) => setImmediate(resolve));

		expect(compactionHookCalls).toBe(1);
		expect(harness.eventsOfType("compaction_start")).toHaveLength(1);
		expect(harness.eventsOfType("compaction_end")).toHaveLength(1);
		expect(harness.sessionManager.getEntries().filter((entry) => entry.type === "compaction")).toHaveLength(1);
	});

	it("persists the aborted response before running the requested manual compaction", async () => {
		let markSecondResponseStarted = () => {};
		const secondResponseStarted = new Promise<void>((resolve) => {
			markSecondResponseStarted = resolve;
		});
		let releaseSecondResponse = () => {};
		const secondResponseReleased = new Promise<void>((resolve) => {
			releaseSecondResponse = resolve;
		});

		const harness = await createHarness({
			models: [{ id: "faux-1", contextWindow: 1000, maxTokens: 1000 }],
			settings: { compaction: { enabled: true, reserveTokens: 200, keepRecentTokens: 2 } },
			tools: [createNoopTool()],
			extensionFactories: [
				(pi) => {
					pi.on("session_before_compact", async (event) => ({
						compaction: {
							summary: `${event.reason} summary`,
							firstKeptEntryId: event.preparation.firstKeptEntryId,
							tokensBefore: event.preparation.tokensBefore,
							details: {},
						},
					}));
				},
			],
		});
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("noop", {}), { stopReason: "toolUse" }),
			async () => {
				markSecondResponseStarted();
				await secondResponseReleased;
				return fauxAssistantMessage(`second response:${"x".repeat(4000)}`);
			},
		]);

		const promptPromise = harness.session.prompt("Run the tool, then continue responding.");
		await secondResponseStarted;

		const compactPromise = harness.session.compact();
		const compactExpectation = expect(compactPromise).resolves.toMatchObject({ summary: "manual summary" });
		releaseSecondResponse();
		await Promise.all([promptPromise, compactExpectation]);

		expect(harness.eventsOfType("compaction_start").map((event) => event.reason)).toEqual(["manual"]);
		expect(harness.eventsOfType("compaction_end").map((event) => event.reason)).toEqual(["manual"]);
		const entries = harness.sessionManager.getEntries();
		const abortedResponseIndex = entries.findIndex(
			(entry) =>
				entry.type === "message" && entry.message.role === "assistant" && entry.message.stopReason === "aborted",
		);
		const compactionIndex = entries.findIndex((entry) => entry.type === "compaction");
		expect(abortedResponseIndex).toBeGreaterThan(-1);
		expect(compactionIndex).toBeGreaterThan(abortedResponseIndex);
		expect(entries.filter((entry) => entry.type === "compaction")).toHaveLength(1);
	});
});
