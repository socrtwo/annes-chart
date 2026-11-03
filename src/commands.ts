export interface Command<S, A = void> {
  id: string;
  title: string;
  /** Returns the new state, or undefined when the command does nothing. */
  run(state: S, arg: A): S | undefined;
}

/**
 * Holds a document state and applies registered commands to it.
 * States are treated as immutable, so undo/redo just swaps snapshots.
 */
export class CommandBus<S> {
  private commands = new Map<string, Command<S, any>>();
  private past: S[] = [];
  private future: S[] = [];
  private listeners = new Set<(state: S) => void>();

  constructor(
    private current: S,
    private limit = 100,
  ) {}

  get state(): S {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  register<A = void>(command: Command<S, A>): void {
    if (this.commands.has(command.id)) throw new Error(`Command already registered: ${command.id}`);
    this.commands.set(command.id, command);
  }

  list(): Command<S, any>[] {
    return [...this.commands.values()];
  }

  /** Runs a command; returns true when it changed the state. */
  execute<A = void>(id: string, arg?: A): boolean {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown command: ${id}`);
    const next = command.run(this.current, arg as A);
    if (next === undefined || next === this.current) return false;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.current = next;
    this.emit();
    return true;
  }

  undo(): boolean {
    const prev = this.past.pop();
    if (prev === undefined) return false;
    this.future.push(this.current);
    this.current = prev;
    this.emit();
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (next === undefined) return false;
    this.past.push(this.current);
    this.current = next;
    this.emit();
    return true;
  }

  subscribe(listener: (state: S) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.current);
  }
}
