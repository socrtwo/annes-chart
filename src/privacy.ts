import { eventYear, type Family, type GedcomData, type Person } from './gedcom';

const born = (p: Person) => eventYear(p.birth) ?? eventYear(p.baptism);

// One person on their own record: presumed living unless a death or burial is recorded
// or they were born `maxAge` or more years ago.
export function isLiving(p: Person, now = new Date().getFullYear(), maxAge = 110): boolean {
  if (p.death || p.burial) return false;
  const b = born(p);
  return b === undefined || now - b < maxAge;
}

// Latest year each person can have been born. People without a birth date get a bound from
// their relatives: a parent is at least 12 years older than a child and at most 80, a spouse
// was at least 12 at the marriage and is at most 60 years younger than the partner.
function latestBirth(g: GedcomData): Map<string, number> {
  const latest = new Map<string, number>();
  for (const p of g.people.values()) latest.set(p.id, born(p) ?? Infinity);
  const lower = (id: string | undefined, year: number) => {
    if (!id || !latest.has(id) || year >= latest.get(id)!) return false;
    latest.set(id, year);
    return true;
  };
  for (let pass = 0, changed = true; changed && pass < 64; pass++) {
    changed = false;
    for (const f of g.families.values()) {
      const parents = [f.husband, f.wife];
      const married = eventYear(f.marriage);
      const [h, w] = parents.map((id) => (id ? (latest.get(id) ?? Infinity) : Infinity));
      if (lower(f.husband, w + 60)) changed = true;
      if (lower(f.wife, h + 60)) changed = true;
      for (const id of parents) if (married !== undefined && lower(id, married - 12)) changed = true;
      const youngestParent = Math.min(h, w);
      for (const c of f.children) {
        if (lower(c, youngestParent + 80)) changed = true;
        const cb = latest.get(c) ?? Infinity;
        for (const id of parents) if (lower(id, cb - 12)) changed = true;
      }
    }
  }
  return latest;
}

// Ids of everyone presumed living, using relatives' dates for people who have none of their own.
export function livingIds(g: GedcomData, now = new Date().getFullYear(), maxAge = 110): Set<string> {
  const latest = latestBirth(g);
  const out = new Set<string>();
  for (const p of g.people.values()) {
    if (p.death || p.burial) continue;
    if (now - (latest.get(p.id) ?? Infinity) < maxAge) out.add(p.id);
  }
  return out;
}

// Returns a copy where living people appear as "Living" with no dates, places or exact names,
// and where the marriage and divorce of a living partner are removed too.
export function redactLiving(g: GedcomData, now?: number): GedcomData {
  const living = livingIds(g, now);
  const people = new Map<string, Person>();
  for (const [id, p] of g.people) {
    people.set(
      id,
      living.has(id)
        ? { ...p, name: 'Living', given: 'Living', surname: '', suffix: undefined, birth: undefined, baptism: undefined, death: undefined, burial: undefined, private: true }
        : p,
    );
  }
  const families = new Map<string, Family>();
  for (const [id, f] of g.families) {
    const hide = (!!f.husband && living.has(f.husband)) || (!!f.wife && living.has(f.wife));
    families.set(id, hide ? { ...f, marriage: undefined, divorced: false, private: true } : f);
  }
  return { people, families, warnings: g.warnings, records: g.records };
}
