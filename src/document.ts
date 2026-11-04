import type { Command } from './commands';

export interface Shape {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface Connector {
  id: string;
  from: string;
  to: string;
}

export interface Doc {
  version: 1;
  shapes: Shape[];
  connectors: Connector[];
}

export const emptyDoc = (): Doc => ({ version: 1, shapes: [], connectors: [] });

const nextId = (prefix: string, items: { id: string }[]): string => {
  let n = items.length + 1;
  while (items.some((i) => i.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

export type NewShape = Partial<Omit<Shape, 'id'>>;

export const addShape: Command<Doc, NewShape> = {
  id: 'shape.add',
  title: 'Add shape',
  run: (d, a) => ({
    ...d,
    shapes: [...d.shapes, { id: nextId('s', d.shapes), x: 0, y: 0, w: 120, h: 60, text: '', ...a }],
  }),
};

export const moveShape: Command<Doc, { id: string; dx: number; dy: number }> = {
  id: 'shape.move',
  title: 'Move shape',
  run: (d, { id, dx, dy }) => {
    if (!d.shapes.some((s) => s.id === id) || (dx === 0 && dy === 0)) return undefined;
    return { ...d, shapes: d.shapes.map((s) => (s.id === id ? { ...s, x: s.x + dx, y: s.y + dy } : s)) };
  },
};

export const setText: Command<Doc, { id: string; text: string }> = {
  id: 'shape.text',
  title: 'Edit text',
  run: (d, { id, text }) => {
    const s = d.shapes.find((x) => x.id === id);
    if (!s || s.text === text) return undefined;
    return { ...d, shapes: d.shapes.map((x) => (x.id === id ? { ...x, text } : x)) };
  },
};

/** Deletes one or more shapes and every connector attached to them, as a single step. */
export const deleteShape: Command<Doc, string | string[]> = {
  id: 'shape.delete',
  title: 'Delete shape',
  run: (d, arg) => {
    const ids = new Set(Array.isArray(arg) ? arg : [arg]);
    if (!d.shapes.some((s) => ids.has(s.id))) return undefined;
    return {
      ...d,
      shapes: d.shapes.filter((s) => !ids.has(s.id)),
      connectors: d.connectors.filter((c) => !ids.has(c.from) && !ids.has(c.to)),
    };
  },
};

export const connect: Command<Doc, { from: string; to: string }> = {
  id: 'connector.add',
  title: 'Connect shapes',
  run: (d, { from, to }) => {
    const known = (id: string) => d.shapes.some((s) => s.id === id);
    if (from === to || !known(from) || !known(to)) return undefined;
    if (d.connectors.some((c) => c.from === from && c.to === to)) return undefined;
    return { ...d, connectors: [...d.connectors, { id: nextId('c', d.connectors), from, to }] };
  },
};

export const deleteConnector: Command<Doc, string> = {
  id: 'connector.delete',
  title: 'Delete connector',
  run: (d, id) =>
    d.connectors.some((c) => c.id === id) ? { ...d, connectors: d.connectors.filter((c) => c.id !== id) } : undefined,
};

export const documentCommands = [addShape, moveShape, setText, deleteShape, connect, deleteConnector] as Command<Doc, any>[];

export const serializeDoc = (d: Doc): string => JSON.stringify(d, null, 2);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Parses and validates a saved document; throws a readable error on bad input. */
export function parseDoc(text: string): Doc {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a valid chart file (invalid JSON)');
  }
  if (!raw || raw.version !== 1 || !Array.isArray(raw.shapes) || !Array.isArray(raw.connectors)) {
    throw new Error('Unsupported chart file format');
  }
  const ids = new Set<string>();
  const shapes: Shape[] = raw.shapes.map((s: any) => {
    if (!s || typeof s.id !== 'string' || ids.has(s.id) || ![s.x, s.y, s.w, s.h].every(isNum)) {
      throw new Error('Invalid shape in chart file');
    }
    ids.add(s.id);
    return { id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, text: typeof s.text === 'string' ? s.text : '' };
  });
  const connectors: Connector[] = raw.connectors.map((c: any) => {
    if (!c || typeof c.id !== 'string' || !ids.has(c.from) || !ids.has(c.to)) {
      throw new Error('Invalid connector in chart file');
    }
    return { id: c.id, from: c.from, to: c.to };
  });
  return { version: 1, shapes, connectors };
}
