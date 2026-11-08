import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom';
import { isLiving, redactLiving } from '../src/privacy';
import { ancestorTree } from '../src/layout';
import { writeGedcom } from '../src/gedcom-export';
import { readFileSync } from 'node:fs';

const g = parseGedcom(new Uint8Array(readFileSync('samples/family.ged')));

describe('privacy', () => {
  it('treats recorded deaths and very old births as not living', () => {
    const base = { id: 'x', name: 'A', given: 'A', surname: '', sex: 'U' as const, famc: [], fams: [] };
    expect(isLiving({ ...base, death: { date: '1990' } }, 2026)).toBe(false);
    expect(isLiving({ ...base, birth: { date: '1850' } }, 2026)).toBe(false);
    expect(isLiving({ ...base, birth: { date: '1990' } }, 2026)).toBe(true);
    expect(isLiving(base, 2026)).toBe(true);
  });
  it('redacts living people but keeps structure', () => {
    const r = redactLiving(g, 2026);
    const living = [...g.people.values()].filter((p) => isLiving(p, 2026));
    expect(living.length).toBeGreaterThan(0);
    for (const p of living) {
      const q = r.people.get(p.id)!;
      expect(q.name).toBe('Living');
      expect(q.birth).toBeUndefined();
    }
    expect(r.families.size).toBe(g.families.size);
    expect(ancestorTree(r, '@I6@', 3).label).toBe('Living');
    expect(writeGedcom(r)).not.toContain(living[0].name);
  });
  it('does not change the original data', () => {
    redactLiving(g, 2026);
    expect([...g.people.values()].some((p) => p.name === 'Living')).toBe(false);
  });
});
