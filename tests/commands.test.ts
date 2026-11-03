import { describe, expect, it, vi } from 'vitest';
import { CommandBus } from '../src/commands';

function make() {
  const bus = new CommandBus<number[]>([]);
  bus.register<number>({ id: 'add', title: 'Add', run: (s, n) => [...s, n] });
  bus.register({ id: 'noop', title: 'Noop', run: () => undefined });
  return bus;
}

describe('CommandBus', () => {
  it('executes, undoes and redoes', () => {
    const bus = make();
    bus.execute('add', 1);
    bus.execute('add', 2);
    expect(bus.state).toEqual([1, 2]);
    expect(bus.undo()).toBe(true);
    expect(bus.state).toEqual([1]);
    expect(bus.redo()).toBe(true);
    expect(bus.state).toEqual([1, 2]);
    expect(bus.canRedo).toBe(false);
  });

  it('clears redo history on a new command', () => {
    const bus = make();
    bus.execute('add', 1);
    bus.undo();
    bus.execute('add', 9);
    expect(bus.canRedo).toBe(false);
    expect(bus.state).toEqual([9]);
  });

  it('ignores no-op commands and reports unknown ones', () => {
    const bus = make();
    expect(bus.execute('noop')).toBe(false);
    expect(bus.canUndo).toBe(false);
    expect(() => bus.execute('missing')).toThrow(/Unknown command/);
    expect(() => bus.register({ id: 'add', title: 'x', run: (s) => s })).toThrow(/already registered/);
  });

  it('caps history and notifies subscribers', () => {
    const bus = new CommandBus<number>(0, 2);
    bus.register({ id: 'inc', title: 'Inc', run: (s) => s + 1 });
    const seen = vi.fn();
    const off = bus.subscribe(seen);
    for (let i = 0; i < 5; i++) bus.execute('inc');
    expect(seen).toHaveBeenCalledTimes(5);
    bus.undo();
    bus.undo();
    expect(bus.undo()).toBe(false);
    expect(bus.state).toBe(3);
    off();
    bus.redo();
    expect(seen).toHaveBeenCalledTimes(7);
  });
});
