import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom';
import { writeGedcom } from '../src/gedcom-export';

describe('gedcom export', () => {
  const g = parseGedcom(readFileSync('samples/family.ged', 'utf8'));

  it('loads the sample file', () => {
    expect(g.people.size).toBe(6);
    expect(g.families.size).toBe(2);
    expect(g.warnings).toEqual([]);
  });

  it('round-trips people, families and events', () => {
    const back = parseGedcom(writeGedcom(g));
    expect(back.warnings).toEqual([]);
    expect([...back.people.values()]).toEqual([...g.people.values()]);
    expect([...back.families.values()]).toEqual([...g.families.values()]);
  });
});
