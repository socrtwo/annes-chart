import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fanChartSvg } from '../src/fan';
import { parseGedcom } from '../src/gedcom';
import { genealogyChart } from '../src/layout';
import { renderSvg } from '../src/render';

const g = parseGedcom(readFileSync('samples/family.ged', 'utf8'));
// Paul (I6): father Walter (I3, parents I1 and I2), mother Nora (I5, no parents recorded).

describe('bowtie chart', () => {
  const c = genealogyChart(g, 'bowtie', '@I6@', 3);
  const box = (id: string) => c.boxes.find((b) => b.id === id)!;

  it('puts paternal ancestors left and maternal right of the person', () => {
    expect(c.boxes.map((b) => b.id).sort()).toEqual(['@I1@', '@I2@', '@I3@', '@I5@', '@I6@'].sort());
    expect(box('@I3@').x).toBeLessThan(box('@I6@').x);
    expect(box('@I1@').x).toBeLessThan(box('@I3@').x);
    expect(box('@I5@').x).toBeGreaterThan(box('@I6@').x);
  });

  it('has unique ids, links to existing boxes and stays inside its bounds', () => {
    const ids = new Set(c.boxes.map((b) => b.id));
    expect(ids.size).toBe(c.boxes.length);
    for (const l of c.links) expect(ids.has(l.from) && ids.has(l.to)).toBe(true);
    for (const b of c.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(c.width);
      expect(b.y + b.h).toBeLessThanOrEqual(c.height);
    }
    expect(renderSvg(c)).toContain('<svg');
  });

  it('keeps the person level with both parents', () => {
    expect(box('@I3@').y).toBe(box('@I6@').y);
    expect(box('@I5@').y).toBe(box('@I6@').y);
  });

  it('works for someone with no recorded parents', () => {
    expect(genealogyChart(g, 'bowtie', '@I1@', 4).boxes).toHaveLength(1);
  });
});

describe('fan chart', () => {
  const ids = (svg: string) => [...svg.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]);

  it('draws the person and each known ancestor once', () => {
    expect(ids(fanChartSvg(g, '@I6@', 4)).sort()).toEqual(['@I1@', '@I2@', '@I3@', '@I5@', '@I6@']);
  });

  it('respects the generation limit', () => {
    expect(ids(fanChartSvg(g, '@I6@', 2)).sort()).toEqual(['@I3@', '@I5@', '@I6@']);
    expect(ids(fanChartSvg(g, '@I6@', 1))).toEqual(['@I6@']);
  });

  it('produces valid-looking paths and rejects unknown people', () => {
    const svg = fanChartSvg(g, '@I6@', 3);
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(svg.match(/<path /g)).toHaveLength(5); // root half-disc plus four ancestors
    expect(() => fanChartSvg(g, '@nope@')).toThrow();
  });
});

// Kid's parents are siblings-in-law by blood: Dad and Mum are both children of Grandpa.
const collapse = parseGedcom(`0 HEAD
0 @G@ INDI
1 NAME Shared /Grandpa/
0 @F@ INDI
1 NAME Dad /X/
1 FAMC @FG@
1 FAMS @FP@
0 @M@ INDI
1 NAME Mum /X/
1 FAMC @FG@
1 FAMS @FP@
0 @C@ INDI
1 NAME Kid /X/
1 FAMC @FP@
0 @FG@ FAM
1 HUSB @G@
1 CHIL @F@
1 CHIL @M@
0 @FP@ FAM
1 HUSB @F@
1 WIFE @M@
1 CHIL @C@
0 TRLR`);

describe('people reached by two lines', () => {
  const unique = (c: { boxes: { id: string }[] }) => new Set(c.boxes.map((b) => b.id)).size === c.boxes.length;

  it('draws a shared ancestor on both lines, as the fan chart does', () => {
    for (const kind of ['ancestors', 'hourglass', 'bowtie'] as const) {
      const c = genealogyChart(collapse, kind, '@C@', 4);
      expect(c.boxes.filter((b) => b.ref === '@G@'), kind).toHaveLength(2);
      expect(unique(c), kind).toBe(true);
      const ids = new Set(c.boxes.map((b) => b.id));
      for (const l of c.links) expect(ids.has(l.from) && ids.has(l.to), kind).toBe(true);
    }
    expect(renderSvg(genealogyChart(collapse, 'ancestors', '@C@', 4)).match(/data-id="@G@"/g)).toHaveLength(2);
  });

  it('shows a child under both descendant parents, expanding it once', () => {
    const c = genealogyChart(collapse, 'descendants', '@G@', 4);
    expect(c.boxes.filter((b) => b.ref === '@C@')).toHaveLength(2);
    expect(unique(c)).toBe(true);
  });

  it('survives a person recorded as their own ancestor', () => {
    const loop = parseGedcom('0 @A@ INDI\n1 NAME A /L/\n1 FAMC @F@\n1 FAMS @F@\n0 @F@ FAM\n1 HUSB @A@\n1 CHIL @A@\n');
    for (const kind of ['ancestors', 'descendants', 'hourglass', 'bowtie'] as const) expect(genealogyChart(loop, kind, '@A@', 6).boxes.length).toBeGreaterThan(0);
  });

  it('stops at the box limit and says so', async () => {
    const { ancestorTree, treeContext } = await import('../src/layout');
    const ctx = treeContext(3);
    ancestorTree(collapse, '@C@', 4, ctx);
    expect(ctx.truncated).toBe(true);
    expect(genealogyChart(collapse, 'ancestors', '@C@', 4).truncated).toBeUndefined();
  });
});

describe('fan chart limits', () => {
  it('rounds fractional generations down instead of drawing outside the canvas', () => {
    expect(fanChartSvg(g, '@I6@', 2.5)).toBe(fanChartSvg(g, '@I6@', 2));
    expect(fanChartSvg(g, '@I6@', Number.NaN)).toBe(fanChartSvg(g, '@I6@', 1));
  });
});
