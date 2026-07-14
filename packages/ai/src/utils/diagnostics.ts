export interface DiagnosticErrorInfo {
	name?: string;
	message: string;
	stack?: string;
	code?: string | number;
	/** Validated identifier/number from the immediate Error.cause; cause text is never copied. */
	causeCode?: string | number;
}

export interface AssistantMessageDiagnostic {
	type: string;
	timestamp: number;
	error?: DiagnosticErrorInfo;
	details?: Record<string, unknown>;
}

export function formatThrownValue(value: unknown): string {
	if (value instanceof Error) return value.message || value.name;
	if (typeof value === "string") return value;
	return String(value);
}

function safeNestedCauseCode(error: Error): string | number | undefined {
	const cause = (error as Error & { cause?: unknown }).cause;
	if (!cause || typeof cause !== "object") return undefined;
	const code = (cause as { code?: unknown }).code;
	if (typeof code === "number" && Number.isSafeInteger(code)) return code;
	if (typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return code;
	return undefined;
}

export function extractDiagnosticError(error: unknown): DiagnosticErrorInfo {
	if (!(error instanceof Error)) return { name: "ThrownValue", message: formatThrownValue(error) };
	const code = (error as Error & { code?: unknown }).code;
	return {
		name: error.name || undefined,
		message: error.message || error.name,
		stack: error.stack,
		code: typeof code === "string" || typeof code === "number" ? code : undefined,
		causeCode: safeNestedCauseCode(error),
	};
}

export function createAssistantMessageDiagnostic(
	type: string,
	error: unknown,
	details?: Record<string, unknown>,
): AssistantMessageDiagnostic {
	return { type, timestamp: Date.now(), error: extractDiagnosticError(error), details };
}

export function appendAssistantMessageDiagnostic<T extends { diagnostics?: AssistantMessageDiagnostic[] }>(
	message: T,
	diagnostic: AssistantMessageDiagnostic,
): void {
	message.diagnostics = [...(message.diagnostics ?? []), diagnostic];
}
