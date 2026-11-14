import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom';
import { isLiving, livingIds, redactLiving } from '../src/privacy';
import { ancestorTree, genealogyChart } from '../src/layout';
import { renderSvg } from '../src/render';
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
  it('hides the marriage and divorce of a living partner, on charts and in both exports', () => {
    const src = parseGedcom('0 @A@ INDI\n1 NAME Al /X/\n1 BIRT\n2 DATE 1980\n1 FAMS @F@\n0 @B@ INDI\n1 NAME Bea /X/\n1 BIRT\n2 DATE 1982\n1 FAMS @F@\n0 @F@ FAM\n1 HUSB @A@\n1 WIFE @B@\n1 MARR\n2 DATE 5 MAY 2001\n2 PLAC Leeds\n1 DIV Y\n');
    const r = redactLiving(src, 2026);
    expect(r.families.get('@F@')).toMatchObject({ marriage: undefined, divorced: false, private: true });
    expect(renderSvg(genealogyChart(r, 'descendants', '@A@', 3))).not.toMatch(/2001|divorced/);
    for (const mode of ['full', 'basic'] as const) expect(writeGedcom(r, mode)).not.toMatch(/2001|Leeds|MARR|DIV|Al|Bea|198/);
    expect(src.families.get('@F@')?.marriage?.date).toBe('5 MAY 2001');
  });
  it('uses relatives to date people who have no dates of their own', () => {
    const old = parseGedcom('0 @A@ INDI\n1 NAME Old /Ancestor/\n1 FAMS @F@\n0 @W@ INDI\n1 NAME Old /Wife/\n1 FAMS @F@\n0 @B@ INDI\n1 NAME Child /Ancestor/\n1 BIRT\n2 DATE 1790\n1 FAMC @F@\n0 @S@ INDI\n1 NAME Undated /Sibling/\n1 FAMC @F@\n0 @F@ FAM\n1 HUSB @A@\n1 WIFE @W@\n1 CHIL @B@\n1 CHIL @S@\n');
    expect([...livingIds(old, 2026)]).toEqual([]);
    const recent = parseGedcom('0 @A@ INDI\n1 NAME Pa /R/\n1 FAMS @F@\n0 @B@ INDI\n1 NAME Kid /R/\n1 BIRT\n2 DATE 1990\n1 FAMC @F@\n0 @F@ FAM\n1 HUSB @A@\n1 CHIL @B@\n');
    expect([...livingIds(recent, 2026)].sort()).toEqual(['@A@', '@B@']);
    expect([...livingIds(parseGedcom('0 @A@ INDI\n1 NAME Nobody /Known/\n'), 2026)]).toEqual(['@A@']);
  });
  it('counts a burial as a death', () => {
    expect(isLiving(parseGedcom('0 @A@ INDI\n1 BIRT\n2 DATE 1990\n1 BURI\n2 DATE 2020\n').people.get('@A@')!, 2026)).toBe(false);
  });
});
