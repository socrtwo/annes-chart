import { describe, expect, it } from 'vitest';
import { parseOrgCsv, type OrgRow } from '../src/layout';
import { parseLdif } from '../src/ldif';
import { ScenarioSet, applyChange, diffRows, highlightOf } from '../src/scenarios';
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
    expect(c.boxes.find((b) => b.id === '1')?.sublabel).toBe('CEO · 3 reports');
    expect(c.boxes.find((b) => b.id === '2')?.sublabel).toBe('CTO · 1 report');
  });
});

const big: OrgRow[] = [
  { id: 'ceo', name: 'Jane', title: 'CEO' },
  { id: 'a', name: 'Ann', manager: 'ceo' },
  { id: 'b', name: 'Bob', manager: 'ceo' },
  { id: 'a1', name: 'A One', manager: 'a' },
  { id: 'a2', name: 'A Two', manager: 'a', dotted: 'b' },
  { id: 'b1', name: 'B One', manager: 'b', dotted: 'a' },
  { id: 'b2', name: 'B Two', manager: 'b' },
];
const overlaps = (boxes: { x: number; y: number; w: number; h: number }[]) =>
  boxes.some((p, i) => boxes.some((q, j) => i < j && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h));

describe('side-by-side and matrix layouts', () => {
  it('side-by-side puts managers in a row with reports hung below, without overlaps', () => {
    const c = orgChart(big, 'side-by-side');
    const at = (id: string) => c.boxes.find((b) => b.id === id)!;
    expect(at('a').y).toBe(at('b').y);
    expect(at('a').x).toBeLessThan(at('b').x);
    expect(at('a1').y).toBeGreaterThan(at('a').y);
    expect(at('a1').x).toBeGreaterThan(at('a').x);
    expect(at('a2').y).toBeGreaterThan(at('a1').y);
    expect(at('b1').x).toBeGreaterThan(at('b').x);
    expect(c.boxes).toHaveLength(7);
    expect(overlaps(c.boxes)).toBe(false);
    expect(c.links.filter((l) => l.hang)).toHaveLength(4);
  });
  it('matrix puts people in unit columns and matrix-lead rows', () => {
    const c = orgChart(big, 'matrix');
    const at = (id: string) => c.boxes.find((b) => b.id === id)!;
    expect(at('a').y).toBe(at('b').y);
    expect(at('a2').x).toBe(at('a').x); // same column (unit A)
    expect(at('b2').x).toBe(at('b').x);
    expect(at('a1').y).toBeLessThan(at('a2').y); // line row above matrix row
    expect(at('b1').y).toBeGreaterThan(at('a2').y); // each matrix lead gets its own row
    expect(c.boxes.some((b) => b.id === 'row:line')).toBe(true);
    expect(c.boxes.some((b) => b.id === 'row:b' && b.label === 'Bob')).toBe(true);
    expect(overlaps(c.boxes)).toBe(false);
  });
});

describe('photos', () => {
  it('reads a photo column and only renders safe image URLs', () => {
    const r = parseOrgCsv('ID,Name,Photo\n1,Jane,https://x.test/j.png\n2,Bob,javascript:alert(1)\n3,Eve,"data:image/png;base64,AAAA"\n');
    const svg = renderSvg(orgChart(r));
    expect(svg).toContain('href="https://x.test/j.png"');
    expect(svg).toContain('data:image/png;base64,AAAA');
    expect(svg).not.toContain('javascript');
  });
});

describe('LDIF import', () => {
  const ldif = `dn: cn=Jane Doe,ou=People,dc=ex,dc=com
objectClass: inetOrgPerson
cn: Jane Doe
title: CEO

dn: cn=Bob Roe,ou=People,dc=ex,dc=com
cn: Bob Roe
title: CTO with a very long
  description
manager: CN=Jane Doe, OU=People, DC=ex, DC=com

dn: cn=Eve,ou=People,dc=ex,dc=com
displayName:: w4l2ZSDDlg==
manager: cn=Bob Roe,ou=People,dc=ex,dc=com
jpegPhoto:: QUJD

dn: ou=Empty,dc=ex,dc=com
objectClass: organizationalUnit
`;
  it('maps entries to people linked by manager DN', () => {
    const rows = parseLdif(ldif);
    expect(rows).toHaveLength(3);
    expect(rows[1].title).toBe('CTO with a very long description');
    expect(rows[1].manager).toBe(rows[0].id);
    expect(rows[2].name).toBe('Éve Ö');
    expect(rows[2].manager).toBe(rows[1].id);
    expect(rows[2].photo).toBe('data:image/jpeg;base64,QUJD');
    expect(orgChart(rows).boxes).toHaveLength(3);
  });
});

describe('scenarios', () => {
  it('applies what-if changes without touching the base and diffs them', () => {
    const set = new ScenarioSet(big);
    set.create('Reorg');
    set.apply('Reorg', { op: 'move', id: 'a1', manager: 'b' });
    set.apply('Reorg', { op: 'add', row: { id: 'n', name: 'New', manager: 'ceo' } });
    set.apply('Reorg', { op: 'remove', id: 'b2' });
    expect(set.base.find((r) => r.id === 'a1')!.manager).toBe('a');
    const d = set.compare('Reorg');
    expect(d).toEqual({ added: ['n'], removed: ['b2'], moved: ['a1'], changed: [] });
    const c = orgChart(set.get('Reorg').rows, 'standard', {}, false, highlightOf(d));
    expect(c.boxes.find((b) => b.id === 'n')!.kind).toBe('added');
    expect(c.boxes.find((b) => b.id === 'a1')!.kind).toBe('moved');
  });
  it('reparents reports of a removed manager and rejects cycles and unknown ids', () => {
    const after = applyChange(big, { op: 'remove', id: 'a' });
    expect(after.find((r) => r.id === 'a1')!.manager).toBe('ceo');
    expect(() => applyChange(big, { op: 'move', id: 'a', manager: 'a1' })).toThrow(/report/);
    expect(() => applyChange(big, { op: 'move', id: 'zzz' })).toThrow(/Unknown/);
    expect(() => applyChange(big, { op: 'add', row: { id: 'a', name: 'dup' } })).toThrow(/exists/);
    expect(diffRows(big, applyChange(big, { op: 'retitle', id: 'a', title: 'VP' })).changed).toEqual(['a']);
  });
  it('round-trips through JSON and validates input', () => {
    const set = new ScenarioSet(big);
    set.create('One');
    set.create('Two', 'One');
    expect(() => set.create('One')).toThrow();
    const again = ScenarioSet.fromJSON(set.toJSON());
    expect(again.scenarios.map((s) => s.name)).toEqual(['One', 'Two']);
    expect(() => ScenarioSet.fromJSON('{"version":2}')).toThrow();
    expect(() => ScenarioSet.fromJSON('nope')).toThrow();
  });
});
