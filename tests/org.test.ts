import { describe, expect, it } from 'vitest';
import { parseOrgCsv } from '../src/layout';
import { orgChart } from '../src/org';
import { renderSvg } from '../src/render';

const rows = parseOrgCsv('ID,Name,Title,Manager,Dotted Line\n1,Jane,CEO,,\n2,Bob,CTO,1,\n3,,Open role,1,\n4,Eve,Dev,2,3\n');

describe('org styles', () => {
  it('marks vacancies and keeps the dotted column', () => {
    const c = orgChart(rows);
    expect(c.boxes.find((b) => b.id === '3')?.kind).toBe('vacant');
    expect(c.links.filter((l) => l.dotted)).toEqual([{ from: '3', to: '4', dotted: true }]);
  });
  it('hanging layout indents reports under managers', () => {
    const c = orgChart(rows, 'hanging');
    const x = (id: string) => c.boxes.find((b) => b.id === id)!.x;
    expect(x('2')).toBeGreaterThan(x('1'));
    expect(x('4')).toBeGreaterThan(x('2'));
    expect(new Set(c.boxes.map((b) => b.y)).size).toBe(4);
  });
  it('horizontal style is left-right', () => {
    const c = orgChart(rows, 'horizontal');
    expect(c.horizontal).toBe(true);
  });
  it('renders dashed links', () => {
    expect(renderSvg(orgChart(rows))).toContain('stroke-dasharray');
  });
});
