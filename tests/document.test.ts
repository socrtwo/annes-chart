import { describe, expect, it } from 'vitest';
import { CommandBus } from '../src/commands';
import { documentCommands, emptyDoc, parseDoc, serializeDoc } from '../src/document';

function make() {
  const bus = new CommandBus(emptyDoc());
  for (const c of documentCommands) bus.register(c);
  return bus;
}

describe('document commands', () => {
  it('adds, moves and edits shapes with undo', () => {
    const bus = make();
    bus.execute('shape.add', { text: 'A', x: 10 });
    bus.execute('shape.move', { id: 's1', dx: 5, dy: 7 });
    bus.execute('shape.text', { id: 's1', text: 'B' });
    expect(bus.state.shapes[0]).toMatchObject({ x: 15, y: 7, text: 'B' });
    bus.undo();
    bus.undo();
    expect(bus.state.shapes[0]).toMatchObject({ x: 10, y: 0, text: 'A' });
  });

  it('rejects invalid connectors and removes them with their shape', () => {
    const bus = make();
    bus.execute('shape.add');
    bus.execute('shape.add');
    expect(bus.execute('connector.add', { from: 's1', to: 's1' })).toBe(false);
    expect(bus.execute('connector.add', { from: 's1', to: 'nope' })).toBe(false);
    expect(bus.execute('connector.add', { from: 's1', to: 's2' })).toBe(true);
    expect(bus.execute('connector.add', { from: 's1', to: 's2' })).toBe(false);
    bus.execute('shape.delete', 's2');
    expect(bus.state.connectors).toHaveLength(0);
    bus.undo();
    expect(bus.state.connectors).toHaveLength(1);
  });

  it('deletes several shapes as one undo step', () => {
    const bus = make();
    for (let i = 0; i < 3; i++) bus.execute('shape.add');
    bus.execute('connector.add', { from: 's1', to: 's2' });
    bus.execute('shape.delete', ['s1', 's2']);
    expect(bus.state.shapes.map((s) => s.id)).toEqual(['s3']);
    bus.undo();
    expect(bus.state.shapes).toHaveLength(3);
    expect(bus.state.connectors).toHaveLength(1);
  });

  it('generates unique ids after deletions', () => {
    const bus = make();
    bus.execute('shape.add');
    bus.execute('shape.add');
    bus.execute('shape.delete', 's1');
    bus.execute('shape.add');
    expect(bus.state.shapes.map((s) => s.id)).toEqual(['s2', 's3']);
  });
});

describe('save format', () => {
  it('round-trips', () => {
    const bus = make();
    bus.execute('shape.add', { text: 'A' });
    bus.execute('shape.add', { text: 'B' });
    bus.execute('connector.add', { from: 's1', to: 's2' });
    expect(parseDoc(serializeDoc(bus.state))).toEqual(bus.state);
  });

  it('keeps shape kinds and defaults unknown or missing ones', () => {
    const bus = make();
    bus.execute('shape.add', { kind: 'diamond' });
    expect(parseDoc(serializeDoc(bus.state)).shapes[0].kind).toBe('diamond');
    const old = { version: 1, shapes: [{ id: 'a', x: 0, y: 0, w: 1, h: 1, kind: 'star' }, { id: 'b', x: 0, y: 0, w: 1, h: 1 }], connectors: [] };
    expect(parseDoc(JSON.stringify(old)).shapes.map((s) => s.kind)).toEqual(['rounded', 'rounded']);
  });

  it('rejects bad input', () => {
    expect(() => parseDoc('{')).toThrow(/invalid JSON/);
    expect(() => parseDoc('{"version":2}')).toThrow(/Unsupported/);
    const bad = { version: 1, shapes: [], connectors: [{ id: 'c1', from: 'a', to: 'b' }] };
    expect(() => parseDoc(JSON.stringify(bad))).toThrow(/Invalid connector/);
    const dup = { version: 1, shapes: [{ id: 'a', x: 0, y: 0, w: 1, h: 1 }, { id: 'a', x: 0, y: 0, w: 1, h: 1 }], connectors: [] };
    expect(() => parseDoc(JSON.stringify(dup))).toThrow(/Invalid shape/);
  });
});
