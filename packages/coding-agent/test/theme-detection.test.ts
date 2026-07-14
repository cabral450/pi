import { type RgbColor, resetCapabilitiesCache, setCapabilities } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it } from "vitest";
import {
	detectTerminalBackgroundFromEnv,
	detectTerminalBackgroundTheme,
	getThemeByName,
	getThemeForRgbColor,
	parseAutoThemeSetting,
	resolveThemeSetting,
} from "../src/modes/interactive/theme/theme.ts";

afterEach(() => {
	resetCapabilitiesCache();
});

function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
	const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
	try {
		for (const [key, value] of Object.entries(values)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		return run();
	} finally {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

describe("detectTerminalBackgroundFromEnv", () => {
	it("uses the COLORFGBG background color index", () => {
		expect(detectTerminalBackgroundFromEnv({ env: { COLORFGBG: "0;15" } })).toMatchObject({
			theme: "light",
			source: "COLORFGBG",
			confidence: "high",
		});
		expect(detectTerminalBackgroundFromEnv({ env: { COLORFGBG: "15;0" } })).toMatchObject({
			theme: "dark",
			source: "COLORFGBG",
			confidence: "high",
		});
	});

	it("uses the last COLORFGBG field as the background", () => {
		expect(detectTerminalBackgroundFromEnv({ env: { COLORFGBG: "0;7;15" } }).theme).toBe("light");
	});

	it("defaults to dark without terminal background hints", () => {
		expect(detectTerminalBackgroundFromEnv({ env: {} })).toMatchObject({
			theme: "dark",
			source: "fallback",
			confidence: "low",
		});
	});
});

describe("detectTerminalBackgroundTheme", () => {
	it("uses the queried terminal background before environment hints", async () => {
		let queriedTimeoutMs: number | undefined;
		const detection = await detectTerminalBackgroundTheme({
			env: { COLORFGBG: "15;0" },
			timeoutMs: 250,
			ui: {
				async queryTerminalBackgroundColor({ timeoutMs }: { timeoutMs: number }): Promise<RgbColor | undefined> {
					queriedTimeoutMs = timeoutMs;
					return { r: 250, g: 250, b: 250 };
				},
			},
		});

		expect(queriedTimeoutMs).toBe(250);
		expect(detection).toMatchObject({
			theme: "light",
			source: "terminal background",
			confidence: "high",
		});
	});

	it("falls back to environment hints when the terminal query returns no color", async () => {
		const detection = await detectTerminalBackgroundTheme({
			env: { COLORFGBG: "15;0" },
			timeoutMs: 250,
			ui: {
				async queryTerminalBackgroundColor(): Promise<RgbColor | undefined> {
					return undefined;
				},
			},
		});

		expect(detection).toMatchObject({
			theme: "dark",
			source: "COLORFGBG",
			confidence: "high",
		});
	});

	it("falls back to environment hints when the terminal query fails", async () => {
		const detection = await detectTerminalBackgroundTheme({
			env: { COLORFGBG: "0;15" },
			timeoutMs: 250,
			ui: {
				async queryTerminalBackgroundColor(): Promise<RgbColor | undefined> {
					throw new Error("terminal write failed");
				},
			},
		});

		expect(detection).toMatchObject({
			theme: "light",
			source: "COLORFGBG",
			confidence: "high",
		});
	});
});

describe("theme color mode", () => {
	it("uses terminal capabilities outside multiplexers", () => {
		withEnv({ TERM: "xterm-256color", TMUX: undefined, STY: undefined, PI_COLOR_MODE: undefined }, () => {
			setCapabilities({ images: null, trueColor: false, hyperlinks: false });
			const ansi256Theme = getThemeByName("dark");
			if (!ansi256Theme) throw new Error("dark theme not found");
			expect(ansi256Theme.getColorMode()).toBe("256color");
			expect(ansi256Theme.getFgAnsi("accent")).toMatch(/^\x1b\[38;5;\d+m$/);

			setCapabilities({ images: null, trueColor: true, hyperlinks: false });
			const truecolorTheme = getThemeByName("dark");
			if (!truecolorTheme) throw new Error("dark theme not found");
			expect(truecolorTheme.getColorMode()).toBe("truecolor");
			expect(truecolorTheme.getFgAnsi("accent")).toMatch(/^\x1b\[38;2;\d+;\d+;\d+m$/);
		});
	});

	it("trusts TERM rather than inherited COLORTERM inside multiplexers", () => {
		setCapabilities({ images: null, trueColor: true, hyperlinks: false });
		withEnv({ TERM: "screen", TMUX: "1", STY: undefined, COLORTERM: "truecolor", PI_COLOR_MODE: undefined }, () => {
			const ansi16Theme = getThemeByName("dark");
			if (!ansi16Theme) throw new Error("dark theme not found");
			expect(ansi16Theme.getColorMode()).toBe("ansi16");
			expect(ansi16Theme.getFgAnsi("accent")).toMatch(/^\x1b\[(?:3\d|9\d)m$/);
		});

		withEnv(
			{ TERM: "screen-256color", TMUX: "1", STY: undefined, COLORTERM: "truecolor", PI_COLOR_MODE: undefined },
			() => {
				const ansi256Theme = getThemeByName("dark");
				if (!ansi256Theme) throw new Error("dark theme not found");
				expect(ansi256Theme.getColorMode()).toBe("256color");
			},
		);
	});

	it("allows PI_COLOR_MODE to override multiplexer detection", () => {
		setCapabilities({ images: null, trueColor: false, hyperlinks: false });
		withEnv({ TERM: "screen", TMUX: "1", STY: undefined, PI_COLOR_MODE: "truecolor" }, () => {
			const theme = getThemeByName("dark");
			if (!theme) throw new Error("dark theme not found");
			expect(theme.getColorMode()).toBe("truecolor");
		});
	});
});

describe("theme detection from RGB", () => {
	it("classifies RGB colors by luminance", () => {
		expect(getThemeForRgbColor({ r: 8, g: 8, b: 8 })).toBe("dark");
		expect(getThemeForRgbColor({ r: 250, g: 250, b: 250 })).toBe("light");
	});
});

describe("theme setting helpers", () => {
	it("parses and resolves automatic theme settings", () => {
		expect(parseAutoThemeSetting("light/dark")).toEqual({ lightTheme: "light", darkTheme: "dark" });
		expect(resolveThemeSetting("dark", "light")).toBe("dark");
		expect(resolveThemeSetting("light/dark", "light")).toBe("light");
		expect(resolveThemeSetting("light/dark", "dark")).toBe("dark");
		expect(resolveThemeSetting("light/dark/extra", "dark")).toBeUndefined();
	});
});
