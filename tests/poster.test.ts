import { describe, expect, it } from 'vitest';
import { posterHtml, posterPages, svgBox } from '../src/poster';

const svg = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-16 -16 ${w} ${h}"><rect id="r" width="5" height="5"/></svg>`;

describe('poster', () => {
  it('reads the chart box from the viewBox or the size', () => {
    expect(svgBox(svg(300, 200))).toEqual({ x: -16, y: -16, w: 300, h: 200 });
    expect(svgBox('<svg width="10" height="20"></svg>')).toEqual({ x: 0, y: 0, w: 10, h: 20 });
    expect(() => svgBox('<svg></svg>')).toThrow();
  });
  it('uses one page when the chart fits', () => {
    const p = posterPages(svg(300, 200));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('width="816" height="1056"');
    expect(p[0]).toContain('Page 1 of 1');
  });
  it('tiles a large chart into a grid with overlap that covers all of it', () => {
    const p = posterPages(svg(2000, 1500), { paper: 'letter', margin: 48, overlap: 24 });
    // usable 720x960, step 696x936: ceil((2000-24)/696)=3 columns, ceil((1500-24)/936)=2 rows
    expect(p).toHaveLength(6);
    expect(p[5]).toContain('row 2, column 3');
    const vb = p.map((s) => /<svg x="48"[^>]*viewBox="(-?\d+) (-?\d+)/.exec(s)!.slice(1).map(Number));
    expect(vb[1][0] - vb[0][0]).toBe(696);
    expect(vb[3][1] - vb[0][1]).toBe(936);
    expect(vb[2][0] + 720).toBeGreaterThanOrEqual(-16 + 2000);
    expect(vb[3][1] + 960).toBeGreaterThanOrEqual(-16 + 1500);
    for (const s of p) expect(s).toContain('id="r"');
  });
  it('supports landscape and other papers in the printable HTML', () => {
    const p = posterPages(svg(100, 100), { paper: 'a4', landscape: true });
    expect(p[0]).toContain('width="1123" height="794"');
    const html = posterHtml(p, { paper: 'a4', landscape: true });
    expect(html).toContain('size:A4 landscape');
    expect(html.match(/class="p"/g)).toHaveLength(1);
  });
});
