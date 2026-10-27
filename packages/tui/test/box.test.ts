import assert from "node:assert";
import { describe, it } from "node:test";
import { Box } from "../src/components/box.ts";
import type { Component } from "../src/tui.ts";

describe("Box render caching", () => {
	it("does not rescan stable child output arrays", () => {
		let lineReads = 0;
		const lines = new Proxy(["first", "second"], {
			get(target, property, receiver) {
				if (typeof property === "string" && /^\d+$/.test(property)) {
					lineReads++;
				}
				return Reflect.get(target, property, receiver);
			},
		});
		const child: Component = { render: () => lines, invalidate() {} };
		const box = new Box(1, 0);
		box.addChild(child);

		const first = box.render(20);
		assert.ok(lineReads > 0, "the initial render should consume child lines");
		lineReads = 0;

		assert.strictEqual(box.render(20), first);
		assert.strictEqual(lineReads, 0, "a stable output array should use the identity cache");
	});

	it("preserves content-based caching for fresh equal arrays", () => {
		const child: Component = { render: () => ["same content"], invalidate() {} };
		const box = new Box(1, 0);
		box.addChild(child);

		const first = box.render(20);
		assert.strictEqual(box.render(20), first);
	});
});
