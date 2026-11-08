import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom';
import { writeGedcom } from '../src/gedcom-export';
import { ancestorTree, descendantTree, genealogyChart } from '../src/layout';
import { relationship, relationshipTree } from '../src/relationship';
import { redactLiving } from '../src/privacy';

// Grandparents G1+G2 -> Dad, Aunt; Dad+Mom -> Me, Sis; Dad+Mom2 (second marriage) -> HalfBro; Aunt -> Cousin -> CousinKid
// Me is also adopted into F9 (Foster Dad + Foster Mom).
const GED = `0 HEAD
0 @S1@ SOUR
1 TITL 1950 Census
1 AUTH US Bureau
0 @G1@ INDI
1 NAME Gus /Old/
1 SEX M
1 FAMS @F1@
0 @G2@ INDI
1 NAME Gail /Old/
1 SEX F
1 FAMS @F1@
0 @DAD@ INDI
1 NAME Dad /Old/
1 SEX M
1 FAMC @F1@
1 FAMS @F2@
1 FAMS @F3@
0 @MOM@ INDI
1 NAME Mom /X/
1 SEX F
1 FAMS @F2@
0 @MOM2@ INDI
1 NAME Mom /Two/
1 SEX F
1 FAMS @F3@
0 @AUNT@ INDI
1 NAME Aunt /Old/
1 SEX F
1 FAMC @F1@
1 FAMS @F4@
0 @ME@ INDI
1 NAME Me /Old/
1 SEX M
1 BIRT
2 DATE 1990
2 SOUR @S1@
3 PAGE 12
1 SOUR Family Bible
1 FAMC @F2@
1 FAMC @F9@
2 PEDI adopted
0 @SIS@ INDI
1 NAME Sis /Old/
1 SEX F
1 FAMC @F2@
0 @HALF@ INDI
1 NAME Half /Old/
1 SEX M
1 FAMC @F3@
0 @FD@ INDI
1 NAME Foster /Dad/
1 SEX M
1 FAMS @F9@
0 @FM@ INDI
1 NAME Foster /Mom/
1 SEX F
1 FAMS @F9@
0 @COUS@ INDI
1 NAME Cousin /Old/
1 SEX F
1 FAMC @F4@
1 FAMS @F5@
0 @CK@ INDI
1 NAME Kid /Old/
1 SEX M
1 FAMC @F5@
0 @F1@ FAM
1 HUSB @G1@
1 WIFE @G2@
1 CHIL @DAD@
1 CHIL @AUNT@
0 @F2@ FAM
1 HUSB @DAD@
1 WIFE @MOM@
1 CHIL @ME@
1 CHIL @SIS@
1 MARR
2 DATE 1985
1 DIV
0 @F3@ FAM
1 HUSB @DAD@
1 WIFE @MOM2@
1 CHIL @HALF@
1 MARR
2 DATE 1960
0 @F4@ FAM
1 WIFE @AUNT@
1 CHIL @COUS@
0 @F5@ FAM
1 WIFE @COUS@
1 CHIL @CK@
0 @F9@ FAM
1 HUSB @FD@
1 WIFE @FM@
1 CHIL @ME@
`;
const g = parseGedcom(GED);
const rel = (a: string, b: string) => relationship(g, a, b).label;

describe('citations', () => {
  it('parses record and inline sources with pages', () => {
    expect(g.sources.get('@S1@')).toMatchObject({ title: '1950 Census', author: 'US Bureau' });
    const me = g.people.get('@ME@')!;
    expect(me.citations).toHaveLength(2);
    expect(me.citations!.find((c) => c.where === 'BIRT')).toMatchObject({ source: '@S1@', page: '12' });
    expect(g.sources.get(me.citations!.find((c) => c.where === 'INDI')!.source)?.title).toBe('Family Bible');
  });
  it('round-trips through GEDCOM export', () => {
    const again = parseGedcom(writeGedcom(g));
    const me = again.people.get('@ME@')!;
    expect(me.citations!.map((c) => [c.where, c.page]).sort()).toEqual([['BIRT', '12'], ['INDI', undefined]]);
    expect(me.citations).toHaveLength(2);
    expect(again.sources.get('@S1@')?.title).toBe('1950 Census');
    expect(again.people.get('@ME@')!.pedigree?.['@F9@']).toBe('adopted');
  });
  it('marks people with sources in charts and strips them when hiding living people', () => {
    expect(ancestorTree(g, '@ME@', 1).sublabel).toContain('2 src');
    expect(redactLiving(g, 2026).people.get('@ME@')!.citations).toEqual([]);
  });
});

describe('adoption and marriages', () => {
  it('reads PEDI', () => {
    expect(g.people.get('@ME@')!.pedigree).toEqual({ '@F2@': 'birth', '@F9@': 'adopted' });
  });
  it('follows birth parents by default and adoptive parents on request', () => {
    expect(ancestorTree(g, '@ME@', 2).children.map((c) => c.id)).toEqual(['@DAD@', '@MOM@']);
    expect(ancestorTree(g, '@ME@', 2, new Set(), 'adoptive').children.map((c) => c.id)).toEqual(['@FD@', '@FM@']);
    const chart = genealogyChart(g, 'ancestors', '@ME@', 2, { parents: 'adoptive' });
    expect(chart.boxes.map((b) => b.id).sort()).toEqual(['@FD@', '@FM@', '@ME@']);
  });
  it('labels adopted children and orders multiple marriages by date', () => {
    const t = descendantTree(g, '@FD@', 3);
    expect(t.children[0].children[0].sublabel).toContain('adopted');
    const d = descendantTree(g, '@DAD@', 3);
    expect(d.children.map((c) => c.sublabel)).toEqual(['m. 1960', 'm. 1985 · divorced']);
    expect(d.children[1].children.map((c) => c.id)).toEqual(['@ME@', '@SIS@']);
  });
});

describe('relationships', () => {
  it('names direct and collateral relationships', () => {
    expect(rel('@ME@', '@DAD@')).toBe('father');
    expect(rel('@DAD@', '@ME@')).toBe('son');
    expect(rel('@ME@', '@G1@')).toBe('grandfather');
    expect(rel('@ME@', '@SIS@')).toBe('sister');
    expect(rel('@ME@', '@HALF@')).toBe('half-brother');
    expect(rel('@ME@', '@AUNT@')).toBe('aunt');
    expect(rel('@AUNT@', '@ME@')).toBe('nephew');
    expect(rel('@ME@', '@COUS@')).toBe('1st cousin');
    expect(rel('@ME@', '@CK@')).toBe('1st cousin once removed');
    expect(rel('@CK@', '@G1@')).toBe('great-grandfather');
    expect(rel('@G1@', '@CK@')).toBe('great-grandson');
    expect(rel('@ME@', '@ME@')).toBe('same person');
    expect(rel('@ME@', '@MOM2@')).toBe('no known relationship');
  });
  it('builds a chart from the common ancestor', () => {
    const t = relationshipTree(g, '@ME@', '@COUS@');
    expect(t.id).toBe('@G1@');
    const ids: string[] = [];
    const walk = (n: typeof t) => (ids.push(n.id), n.children.forEach(walk));
    walk(t);
    expect(ids.sort()).toEqual(['@AUNT@', '@COUS@', '@DAD@', '@G1@', '@ME@']);
    expect(t.children).toHaveLength(2);
  });
  it('rejects unknown people', () => {
    expect(() => relationship(g, '@ME@', '@NOPE@')).toThrow();
  });
});
