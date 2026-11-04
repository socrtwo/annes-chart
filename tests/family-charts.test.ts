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
    expect(c.boxes.map((b) => b.id).sort()).toEqual(['@I1@', '@I2@', '@I3@', 'M:@I5@', '@I6@'].sort());
    expect(box('@I3@').x).toBeLessThan(box('@I6@').x);
    expect(box('@I1@').x).toBeLessThan(box('@I3@').x);
    expect(box('M:@I5@').x).toBeGreaterThan(box('@I6@').x);
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
    expect(box('M:@I5@').y).toBe(box('@I6@').y);
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
