import { resetCapabilitiesCache, setCapabilities } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it } from "vitest";
import {
	detectColorFgBgTheme,
	detectTerminalTheme,
	getThemeByName,
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

describe("detectColorFgBgTheme", () => {
	it("classifies the last field by palette index like Vim", () => {
		expect(detectColorFgBgTheme({ COLORFGBG: "15;0" })).toBe("dark");
		expect(detectColorFgBgTheme({ COLORFGBG: "0;7;15" })).toBe("light");
		// Solarized Dark's background is bright black.
		expect(detectColorFgBgTheme({ COLORFGBG: "12;8" })).toBe("dark");
		// rxvt writes "default" when the background is not a palette color.
		expect(detectColorFgBgTheme({ COLORFGBG: "15;default" })).toBeUndefined();
		expect(detectColorFgBgTheme({})).toBeUndefined();
	});
});

describe("detectTerminalTheme", () => {
	it("prefers the background, then the reported scheme, then COLORFGBG, then dark", () => {
		const env = { COLORFGBG: "0;15" };
		expect(detectTerminalTheme({ background: { r: 8, g: 8, b: 8 } }, "light", env)).toBe("dark");
		expect(detectTerminalTheme({}, "dark", env)).toBe("dark");
		expect(detectTerminalTheme({}, undefined, env)).toBe("light");
		expect(detectTerminalTheme({}, undefined, {})).toBe("dark");
	});

	it("follows the foreground when text is readable that way", () => {
		const background = { r: 118, g: 118, b: 118 };
		expect(detectTerminalTheme({ background })).toBe("light");
		expect(detectTerminalTheme({ background, foreground: { r: 255, g: 255, b: 255 } })).toBe("dark");
		// White text cannot reach 4.5:1 on mid-gray.
		const midGray = { r: 128, g: 128, b: 128 };
		expect(detectTerminalTheme({ background: midGray, foreground: { r: 255, g: 255, b: 255 } })).toBe("light");
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

	it("does not trust inherited COLORTERM inside basic-color multiplexers", () => {
		withEnv({ TERM: "screen", TMUX: "1", STY: undefined, COLORTERM: "truecolor", PI_COLOR_MODE: undefined }, () => {
			resetCapabilitiesCache();
			const ansi16Theme = getThemeByName("dark");
			if (!ansi16Theme) throw new Error("dark theme not found");
			expect(ansi16Theme.getColorMode()).toBe("ansi16");
			expect(ansi16Theme.getFgAnsi("accent")).toMatch(/^\x1b\[(?:3\d|9\d)m$/);
		});

		withEnv(
			{ TERM: "screen-256color", TMUX: "1", STY: undefined, COLORTERM: undefined, PI_COLOR_MODE: undefined },
			() => {
				resetCapabilitiesCache();
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

describe("theme setting helpers", () => {
	it("parses and resolves automatic theme settings", () => {
		expect(parseAutoThemeSetting("light/dark")).toEqual({ lightTheme: "light", darkTheme: "dark" });
		expect(resolveThemeSetting("dark", "light")).toBe("dark");
		expect(resolveThemeSetting("light/dark", "light")).toBe("light");
		expect(resolveThemeSetting("light/dark", "dark")).toBe("dark");
		expect(resolveThemeSetting("light/dark/extra", "dark")).toBeUndefined();
	});
});
