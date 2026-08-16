const COPY_ACTION_PREFIX = "pi-tui://copy/";

export interface TerminalCopyAction {
	readonly text: string;
	readonly url: string;
	readonly copy?: (text: string) => void | Promise<void>;
}

let nextCopyActionId = 0;
const activeOwners = new Set<object>();
const copyActions = new Map<string, WeakRef<TerminalCopyAction>>();
const copyActionFinalizer = new FinalizationRegistry<string>((id) => {
	copyActions.delete(id);
});

export function setTerminalActionsEnabled(owner: object, enabled: boolean): void {
	if (enabled) {
		activeOwners.add(owner);
	} else {
		activeOwners.delete(owner);
	}
}

export function terminalActionsEnabled(): boolean {
	return activeOwners.size > 0;
}

export function createTerminalCopyAction(
	text: string,
	copy?: (text: string) => void | Promise<void>,
): TerminalCopyAction {
	const id = (++nextCopyActionId).toString(36);
	const action = Object.freeze({ text, url: `${COPY_ACTION_PREFIX}${id}`, copy });
	copyActions.set(id, new WeakRef(action));
	copyActionFinalizer.register(action, id);
	return action;
}

export function resolveTerminalCopyAction(url: string): TerminalCopyAction | undefined {
	if (!url.startsWith(COPY_ACTION_PREFIX)) return undefined;
	const id = url.slice(COPY_ACTION_PREFIX.length);
	if (!id || id.includes("/")) return undefined;
	const action = copyActions.get(id)?.deref();
	if (!action) copyActions.delete(id);
	return action;
}
