import { describe, expect, it } from "vitest";
import { extractDiagnosticError } from "../src/utils/diagnostics.ts";

describe("provider diagnostics", () => {
	it("captures a safe immediate nested cause code without copying cause text", () => {
		const cause = Object.assign(new Error("private host and socket details"), { code: "UND_ERR_CONNECT_TIMEOUT" });
		const error = new TypeError("fetch failed") as TypeError & { cause?: unknown };
		error.cause = cause;

		const diagnostic = extractDiagnosticError(error);

		expect(diagnostic).toMatchObject({
			name: "TypeError",
			message: "fetch failed",
			causeCode: "UND_ERR_CONNECT_TIMEOUT",
		});
		expect(JSON.stringify(diagnostic)).not.toContain("private host and socket details");
	});

	it("rejects arbitrary nested cause-code text", () => {
		const error = new TypeError("fetch failed") as TypeError & { cause?: unknown };
		error.cause = { code: "token=private-secret", message: "private host and socket details" };

		const diagnostic = extractDiagnosticError(error);

		expect(diagnostic.causeCode).toBeUndefined();
		expect(JSON.stringify(diagnostic)).not.toContain("private-secret");
		expect(JSON.stringify(diagnostic)).not.toContain("private host and socket details");
	});
});
