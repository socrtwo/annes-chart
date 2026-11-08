import type { GedcomData, Person } from './gedcom';
import type { TreeSource } from './layout';

export interface Relationship {
  /** What B is to A, e.g. "2nd cousin once removed". */
  label: string;
  /** Steps from A and from B up to the closest common ancestor. */
  up: [number, number];
  ancestor?: string;
  /** Person ids from A up to the ancestor, and from B up to the ancestor. */
  pathA: string[];
  pathB: string[];
}

const parentsOf = (g: GedcomData, p: Person): string[] =>
  p.famc.flatMap((f) => [g.families.get(f)?.husband, g.families.get(f)?.wife]).filter((x): x is string => !!x && g.people.has(x));

// Shortest upward path from `id` to every ancestor (including itself).
function climb(g: GedcomData, id: string): Map<string, string[]> {
  const out = new Map<string, string[]>([[id, [id]]]);
  let frontier = [id];
  while (frontier.length) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const par of parentsOf(g, g.people.get(cur)!)) {
        if (!out.has(par)) {
          out.set(par, [...out.get(cur)!, par]);
          next.push(par);
        }
      }
    }
    frontier = next;
  }
  return out;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const gender = (sex: Person['sex'], m: string, f: string, n: string) => (sex === 'M' ? m : sex === 'F' ? f : n);
const great = (n: number) => (n <= 0 ? '' : n === 1 ? 'great-' : `${ordinal(n)} great-`);

function term(up: [number, number], sex: Person['sex'], half: boolean): string {
  const [da, db] = up;
  const h = half ? 'half-' : '';
  if (da === 0 && db === 0) return 'same person';
  if (da === 0) {
    if (db === 1) return gender(sex, 'son', 'daughter', 'child');
    return `${great(db - 2)}${gender(sex, 'grandson', 'granddaughter', 'grandchild')}`;
  }
  if (db === 0) {
    if (da === 1) return gender(sex, 'father', 'mother', 'parent');
    return `${great(da - 2)}${gender(sex, 'grandfather', 'grandmother', 'grandparent')}`;
  }
  if (da === 1 && db === 1) return `${h}${gender(sex, 'brother', 'sister', 'sibling')}`;
  if (da === 1) return `${db >= 3 ? great(db - 3) + 'grand' : ''}${gender(sex, 'nephew', 'niece', 'nephew/niece')}`;
  if (db === 1) return `${great(da - 2)}${gender(sex, 'uncle', 'aunt', 'uncle/aunt')}`;
  const degree = Math.min(da, db) - 1;
  const removed = Math.abs(da - db);
  const rem = removed === 0 ? '' : removed === 1 ? ' once removed' : removed === 2 ? ' twice removed' : ` ${removed} times removed`;
  return `${ordinal(degree)} cousin${rem}`;
}

export function relationship(g: GedcomData, aId: string, bId: string): Relationship {
  const a = g.people.get(aId);
  const b = g.people.get(bId);
  if (!a || !b) throw new Error('Unknown person');
  const ca = climb(g, aId);
  const cb = climb(g, bId);
  let best: { id: string; da: number; db: number } | undefined;
  const common: string[] = [];
  for (const [id, pa] of ca) {
    const pb = cb.get(id);
    if (!pb) continue;
    common.push(id);
    const da = pa.length - 1;
    const db = pb.length - 1;
    if (!best || da + db < best.da + best.db) best = { id, da, db };
  }
  if (!best) {
    const spouse = a.fams.some((f) => g.families.get(f)?.husband === bId || g.families.get(f)?.wife === bId);
    return { label: spouse ? gender(b.sex, 'husband', 'wife', 'spouse') : 'no known relationship', up: [0, 0], pathA: [aId], pathB: [bId] };
  }
  // Siblings who share only one parent are half-siblings.
  const atBest = common.filter((id) => ca.get(id)!.length - 1 === best!.da && cb.get(id)!.length - 1 === best!.db);
  const half = best.da === 1 && best.db === 1 && atBest.length === 1;
  return {
    label: term([best.da, best.db], b.sex, half),
    up: [best.da, best.db],
    ancestor: best.id,
    pathA: ca.get(best.id)!,
    pathB: cb.get(best.id)!,
  };
}

/** A tree with the common ancestor on top and a branch down to each person; the two people are marked. */
export function relationshipTree(g: GedcomData, aId: string, bId: string): TreeSource {
  const r = relationship(g, aId, bId);
  const node = (id: string): TreeSource => {
    const p = g.people.get(id)!;
    const end = id === aId || id === bId;
    return { id, label: p.name, sublabel: id === aId ? 'start' : id === bId ? 'target' : '', kind: end ? 'target' : p.sex === 'M' ? 'male' : p.sex === 'F' ? 'female' : 'unknown', children: [] };
  };
  const top = r.ancestor ?? aId;
  const root = node(top);
  for (const path of [r.pathA, r.pathB]) {
    let cur = root;
    for (const id of [...path].reverse().slice(1)) {
      const n = node(id);
      cur.children.push(n);
      cur = n;
    }
  }
  if (!r.ancestor && aId !== bId) root.children.push(node(bId));
  return root;
}
