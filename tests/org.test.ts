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

  it('puts assistants first and styles them', () => {
    const r = parseOrgCsv('ID,Name,Title,Manager,Type\n1,Jane,CEO,,\n2,Bob,CTO,1,\n3,Amy,EA,1,Assistant\n');
    const c = orgChart(r);
    expect(c.boxes.find((b) => b.id === '3')?.kind).toBe('assistant');
    expect(c.boxes.find((b) => b.id === '3')!.x).toBeLessThan(c.boxes.find((b) => b.id === '2')!.x);
  });
  it('rolls up report counts', () => {
    const c = orgChart(rows, 'standard', {}, true);
    expect(c.boxes.find((b) => b.id === '1')).toMatchObject({ sublabel: 'CEO', note: '3 reports' });
    expect(c.boxes.find((b) => b.id === '2')).toMatchObject({ sublabel: 'CTO', note: '1 report' });
  });
  it('keeps the roll-up count visible beside a long title', () => {
    const svg = renderSvg(orgChart(parseOrgCsv('ID,Name,Title,Manager\n1,Jane,Vice President of Engineering,\n2,Bob,Dev,1\n'), 'standard', {}, true));
    expect(svg).toContain('>1 report<');
  });
});

describe('org data problems', () => {
  const labels = (csv: string) => orgChart(parseOrgCsv(csv)).boxes.map((b) => b.label).sort();

  it('draws a reporting loop that sits beside a real root, with a warning', () => {
    const c = orgChart(parseOrgCsv('ID,Name,Manager\n1,CEO,\n2,A,3\n3,B,2\n'));
    expect(c.boxes.map((b) => b.label).sort()).toEqual(['A', 'B', 'CEO', 'Organization']);
    expect(c.warnings?.join(' ')).toMatch(/loop/i);
  });
  it('gives people with the same name (no ID column) a box each', () => {
    const c = orgChart(parseOrgCsv('Name,Manager\nBoss,\nJohn Smith,Boss\nJohn Smith,Boss\n'));
    expect(c.boxes.filter((b) => b.label === 'John Smith')).toHaveLength(2);
    expect(new Set(c.boxes.map((b) => b.id)).size).toBe(3);
    expect(new Set(c.boxes.map((b) => b.x)).size).toBe(3);
    expect(c.links).toHaveLength(2);
    expect(c.warnings).toHaveLength(1);
  });
  it('accepts rows shorter than the header', () => {
    expect(parseOrgCsv('Name,Title,ID\nJane\n')).toEqual([{ id: '', name: 'Jane', title: undefined, manager: undefined, assistant: undefined, dotted: undefined }]);
    expect(labels('Name,Title,ID\nJane\nBob\n')).toEqual(['Bob', 'Jane', 'Organization']);
  });
  it('finds a manager given by name when IDs are numbers', () => {
    const c = orgChart(parseOrgCsv('ID,Name,Manager\n1,Jane,\n2,Bob,jane\n3,Eve,Jane\n'));
    expect(c.links).toEqual([{ from: '1', to: '2' }, { from: '1', to: '3' }]);
    expect(c.warnings).toEqual([]);
  });
  it('warns about a manager that matches nobody', () => {
    expect(orgChart(parseOrgCsv('ID,Name,Manager\n1,Jane,\n2,Bob,99\n')).warnings?.[0]).toMatch(/manager "99" was not found/);
  });
  it('reads semicolon and tab delimiters and skips a byte-order mark', () => {
    expect(parseOrgCsv('\uFEFFID;Name;Manager\n1;"Doe; Jane";\n2;Bob;1\n').map((r) => r.name)).toEqual(['Doe; Jane', 'Bob']);
    expect(parseOrgCsv('ID\tName\n1\tJane, PhD\n')[0].name).toBe('Jane, PhD');
    expect(parseOrgCsv('ID,Name\n1,"a;b;c;d"\n')[0].name).toBe('a;b;c;d');
  });
  it('keeps several assistants in file order', () => {
    const c = orgChart(parseOrgCsv('ID,Name,Manager,Type\n1,Jane,,\n2,Bob,1,\n3,A1,1,assistant\n4,A2,1,assistant\n'));
    const x = (id: string) => c.boxes.find((b) => b.id === id)!.x;
    expect(x('3')).toBeLessThan(x('4'));
    expect(x('4')).toBeLessThan(x('2'));
  });
  it('routes a dotted line between same-level boxes clear of the boxes', () => {
    const c = orgChart(parseOrgCsv('ID,Name,Manager,Dotted\n1,Jane,,\n2,Bob,1,\n3,Eve,1,2\n'));
    const top = c.boxes.find((b) => b.id === '2')!.y;
    const d = renderSvg(c).match(/<path d="([^"]*)"[^>]*dasharray/)![1];
    expect(d).toContain(`V${top - 14}H`);
    const [from, to] = ['2', '3'].map((id) => c.boxes.find((b) => b.id === id)!);
    expect(d.startsWith(`M${from.x + from.w * 0.75} `)).toBe(true); // off the centre, where the solid connector arrives
    expect(d).toContain(`H${to.x + to.w * 0.25}V`);
  });
  it('routes dotted lines down the side of a hanging chart', () => {
    const c = orgChart(rows, 'hanging');
    expect(c.links.filter((l) => l.dotted)).toEqual([{ from: '3', to: '4', dotted: true, side: true }]);
    const svg = renderSvg(c);
    expect(svg.match(/<path d="([^"]*)"[^>]*dasharray/)![1]).toContain(`H${c.width + 14}V`); // beyond every box
    expect(Number(svg.match(/width="(\d+)"/)![1])).toBeGreaterThan(c.width + 32 + 12);
  });
});
