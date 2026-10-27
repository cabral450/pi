import { describe, expect, it } from "vitest";
import { execCommand } from "../src/core/exec.ts";

describe("execCommand termination status", () => {
	it("preserves a successful exit and both output streams", async () => {
		const result = await execCommand(
			process.execPath,
			["-e", 'process.stdout.write("out"); process.stderr.write("err")'],
			process.cwd(),
		);
		expect(result).toEqual({ stdout: "out", stderr: "err", code: 0, killed: false });
	});

	it("preserves an explicit nonzero exit", async () => {
		const result = await execCommand(process.execPath, ["-e", "process.exit(7)"], process.cwd());
		expect(result.code).toBe(7);
		expect(result.killed).toBe(false);
	});

	it("reports spawn errors as failures", async () => {
		const result = await execCommand("pi-exec-nonexistent-regression-command", [], process.cwd());
		expect(result.code).not.toBe(0);
	});

	it.skipIf(process.platform === "win32").each(["SIGTERM", "SIGKILL"])(
		"reports %s termination without an executor timeout as failure",
		async (signal) => {
			const result = await execCommand(
				process.execPath,
				["-e", `process.kill(process.pid, "${signal}")`],
				process.cwd(),
			);
			expect(result.code).not.toBe(0);
			expect(result.killed).toBe(true);
		},
	);

	it("reports a timeout as failure rather than a successful null exit", async () => {
		const result = await execCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], process.cwd(), {
			timeout: 100,
		});
		expect(result.code).not.toBe(0);
		expect(result.killed).toBe(true);
	});

	it("reports an abort during execution as failure", async () => {
		const result = await execCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], process.cwd(), {
			signal: AbortSignal.timeout(100),
		});
		expect(result.code).not.toBe(0);
		expect(result.killed).toBe(true);
	});

	it("reports an already-aborted command as failure", async () => {
		const result = await execCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], process.cwd(), {
			signal: AbortSignal.abort(),
		});
		expect(result.code).not.toBe(0);
		expect(result.killed).toBe(true);
	});
});
