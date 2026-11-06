import type { GedcomData, Person } from './gedcom';

const year = (d?: string) => {
  const m = /\d{3,4}/.exec(d ?? '');
  return m ? Number(m[0]) : undefined;
};

// A person is presumed living unless a death is recorded or they were born over `maxAge` years ago.
export function isLiving(p: Person, now = new Date().getFullYear(), maxAge = 110): boolean {
  if (p.death) return false;
  const b = year(p.birth?.date);
  return b === undefined || now - b < maxAge;
}

// Returns a copy where living people appear as "Living" with no dates, places or exact names.
export function redactLiving(g: GedcomData, now?: number): GedcomData {
  const people = new Map<string, Person>();
  for (const [id, p] of g.people) {
    people.set(id, isLiving(p, now) ? { ...p, name: 'Living', given: 'Living', surname: '', birth: undefined, death: undefined } : p);
  }
  return { people, families: g.families, warnings: g.warnings };
}
