import type { Component } from "../tui.ts";

/**
 * Spacer component that renders empty lines
 */
export class Spacer implements Component {
	private lines: number;
	private cachedLines?: string[];

	constructor(lines: number = 1) {
		this.lines = lines;
	}

	setLines(lines: number): void {
		if (this.lines === lines) return;
		this.lines = lines;
		this.cachedLines = undefined;
	}

	invalidate(): void {
		this.cachedLines = undefined;
	}

	render(_width: number): string[] {
		if (!this.cachedLines) this.cachedLines = Array.from({ length: this.lines }, () => "");
		return this.cachedLines;
	}
}
