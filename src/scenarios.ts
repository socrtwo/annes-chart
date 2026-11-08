import type { OrgRow } from './layout';

export type Change =
  | { op: 'move'; id: string; manager?: string }
  | { op: 'remove'; id: string }
  | { op: 'add'; row: OrgRow }
  | { op: 'retitle'; id: string; title?: string }
  | { op: 'rename'; id: string; name: string };

export interface Scenario {
  name: string;
  rows: OrgRow[];
}

const descends = (rows: OrgRow[], id: string, maybeAncestor: string): boolean => {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (let cur = byId.get(id)?.manager, n = 0; cur && n <= rows.length; cur = byId.get(cur)?.manager, n++) if (cur === maybeAncestor) return true;
  return false;
};

/** Applies one what-if change and returns new rows. Throws when the change makes no sense. */
export function applyChange(rows: OrgRow[], ch: Change): OrgRow[] {
  const has = (id: string) => rows.some((r) => r.id === id);
  if (ch.op === 'add') {
    if (has(ch.row.id)) throw new Error(`Person ${ch.row.id} already exists`);
    if (ch.row.manager && !has(ch.row.manager)) throw new Error(`Unknown manager ${ch.row.manager}`);
    return [...rows, ch.row];
  }
  if (!has(ch.id)) throw new Error(`Unknown person ${ch.id}`);
  switch (ch.op) {
    case 'move':
      if (ch.manager && !has(ch.manager)) throw new Error(`Unknown manager ${ch.manager}`);
      if (ch.manager === ch.id || (ch.manager && descends(rows, ch.manager, ch.id))) throw new Error('A person cannot report to themselves or to their own report');
      return rows.map((r) => (r.id === ch.id ? { ...r, manager: ch.manager } : r));
    case 'remove': {
      // Reports move up to the removed person's manager.
      const gone = rows.find((r) => r.id === ch.id)!;
      return rows.filter((r) => r.id !== ch.id).map((r) => (r.manager === ch.id ? { ...r, manager: gone.manager } : r)).map((r) => (r.dotted === ch.id ? { ...r, dotted: undefined } : r));
    }
    case 'retitle':
      return rows.map((r) => (r.id === ch.id ? { ...r, title: ch.title } : r));
    case 'rename':
      return rows.map((r) => (r.id === ch.id ? { ...r, name: ch.name } : r));
  }
}

export interface Diff {
  added: string[];
  removed: string[];
  moved: string[];
  changed: string[];
}

/** What differs between two versions of the organization, by person id. */
export function diffRows(before: OrgRow[], after: OrgRow[]): Diff {
  const b = new Map(before.map((r) => [r.id, r]));
  const a = new Map(after.map((r) => [r.id, r]));
  const d: Diff = { added: [], removed: [], moved: [], changed: [] };
  for (const [id, r] of a) {
    const old = b.get(id);
    if (!old) d.added.push(id);
    else if ((old.manager ?? '') !== (r.manager ?? '')) d.moved.push(id);
    else if (old.title !== r.title || old.name !== r.name) d.changed.push(id);
  }
  for (const id of b.keys()) if (!a.has(id)) d.removed.push(id);
  return d;
}

export const highlightOf = (d: Diff): Map<string, string> =>
  new Map([...d.added.map((id) => [id, 'added'] as const), ...[...d.moved, ...d.changed].map((id) => [id, 'moved'] as const)]);

/** The base organization plus named what-if copies. */
export class ScenarioSet {
  scenarios: Scenario[] = [];
  constructor(public base: OrgRow[]) {}

  create(name: string, from?: string): Scenario {
    if (!name.trim()) throw new Error('Scenario needs a name');
    if (this.scenarios.some((s) => s.name === name)) throw new Error(`Scenario "${name}" already exists`);
    const src = from ? this.get(from).rows : this.base;
    const s = { name, rows: src.map((r) => ({ ...r })) };
    this.scenarios.push(s);
    return s;
  }

  get(name: string): Scenario {
    const s = this.scenarios.find((x) => x.name === name);
    if (!s) throw new Error(`Unknown scenario "${name}"`);
    return s;
  }

  apply(name: string, change: Change): void {
    const s = this.get(name);
    s.rows = applyChange(s.rows, change);
  }

  delete(name: string): void {
    this.scenarios = this.scenarios.filter((s) => s.name !== name);
  }

  compare(name: string): Diff {
    return diffRows(this.base, this.get(name).rows);
  }

  toJSON(): string {
    return JSON.stringify({ version: 1, base: this.base, scenarios: this.scenarios }, null, 2);
  }

  static fromJSON(text: string): ScenarioSet {
    let raw: any;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('Not a valid scenarios file');
    }
    const ok = (rows: unknown): rows is OrgRow[] => Array.isArray(rows) && rows.every((r) => r && typeof r.id === 'string' && typeof r.name === 'string');
    if (raw?.version !== 1 || !ok(raw.base) || !Array.isArray(raw.scenarios) || !raw.scenarios.every((s: any) => typeof s?.name === 'string' && ok(s.rows))) {
      throw new Error('Unsupported scenarios file');
    }
    const set = new ScenarioSet(raw.base);
    set.scenarios = raw.scenarios;
    return set;
  }
}
