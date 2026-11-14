import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom';
import { ancestorTree, descendantTree, genealogyChart, layoutTree, orgToTree, parseOrgCsv } from '../src/layout';
import { renderSvg } from '../src/render';

const GED = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1 JAN 1900
1 DEAT
2 DATE 1970
1 FAMS @F1@
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Anne /Smith/
1 SEX F
1 FAMC @F1@
1 NOTE a long
2 CONC  note
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1925
0 TRLR`;

describe('gedcom', () => {
  const g = parseGedcom(GED);
  it('reads people and families', () => {
    expect(g.people.size).toBe(3);
    expect(g.people.get('@I1@')).toMatchObject({ given: 'John', surname: 'Smith', sex: 'M' });
    expect(g.families.get('@F1@')?.children).toEqual(['@I3@']);
    expect(g.warnings).toEqual([]);
  });
  it('builds ancestor and descendant trees', () => {
    expect(ancestorTree(g, '@I3@').children.map((c) => c.id)).toEqual(['@I1@', '@I2@']);
    const d = descendantTree(g, '@I1@');
    expect(d.children[0].children[0].id).toBe('@I3@');
  });
  it('reports bad lines and decodes BOM/Latin-1', () => {
    expect(parseGedcom('garbage\n0 @I1@ INDI').warnings.length).toBe(1);
    const bytes = new Uint8Array([0x30, 0x20, 0x40, 0x49, 0x31, 0x40, 0x20, 0x49, 0x4e, 0x44, 0x49, 0x0a, 0x31, 0x20, 0x4e, 0x41, 0x4d, 0x45, 0x20, 0x4a, 0x6f, 0xe9, 0x20, 0x2f, 0x41, 0x2f]);
    expect(parseGedcom(bytes).people.get('@I1@')?.name).toBe('Joé A');
  });
  it('lays out every chart kind without overlap', () => {
    for (const k of ['descendants', 'ancestors', 'hourglass', 'bowtie'] as const) {
      const c = genealogyChart(g, k, k === 'descendants' ? '@I1@' : '@I3@', 4);
      expect(c.boxes.length, k).toBeGreaterThan(1);
      for (const a of c.boxes) {
        for (const b of c.boxes) {
          if (a === b) continue;
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart, `${k}: ${a.id} overlaps ${b.id}`).toBe(true);
        }
        expect(a.x >= 0 && a.y >= 0 && a.x + a.w <= c.width && a.y + a.h <= c.height, `${k}: ${a.id} inside the chart`).toBe(true);
      }
      expect(renderSvg(c)).toContain('<svg');
    }
  });
});

describe('org chart', () => {
  it('imports CSV with quoted fields and lays out a tree', () => {
    const rows = parseOrgCsv('ID,Name,Title,Manager\n1,"Doe, Jane",CEO,\n2,Bob,CTO,1\n3,Eve,CFO,1\n');
    expect(rows[0].name).toBe('Doe, Jane');
    const chart = layoutTree(orgToTree(rows));
    const top = chart.boxes.find((b) => b.id === '1')!;
    const [b, e] = ['2', '3'].map((id) => chart.boxes.find((x) => x.id === id)!);
    expect(top.y).toBeLessThan(b.y);
    expect(top.x).toBe((b.x + e.x) / 2);
    expect(e.x - b.x).toBeGreaterThanOrEqual(b.w);
  });
  it('survives cycles and multiple roots', () => {
    const t = orgToTree([
      { id: 'a', name: 'A', manager: 'b' },
      { id: 'b', name: 'B', manager: 'a' },
    ]);
    expect(layoutTree(t).boxes.length).toBe(2);
  });
});
