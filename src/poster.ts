export type Paper = 'letter' | 'legal' | 'tabloid' | 'a4' | 'a3';

// Sizes in CSS pixels (96 per inch), portrait.
const PAPER: Record<Paper, [number, number]> = {
  letter: [816, 1056],
  legal: [816, 1344],
  tabloid: [1056, 1632],
  a4: [794, 1123],
  a3: [1123, 1587],
};

export interface PosterOptions {
  paper?: Paper;
  landscape?: boolean;
  /** Printable margin on every page, in pixels. */
  margin?: number;
  /** Strip shared between neighbouring pages so they can be trimmed and taped, in pixels. */
  overlap?: number;
}

export function svgBox(svg: string): { x: number; y: number; w: number; h: number } {
  const head = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const vb = /viewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(head);
  if (vb) return { x: +vb[1], y: +vb[2], w: +vb[3], h: +vb[4] };
  const w = Number(/\swidth="([\d.]+)"/.exec(head)?.[1]);
  const h = Number(/\sheight="([\d.]+)"/.exec(head)?.[1]);
  if (!w || !h) throw new Error('SVG has no size');
  return { x: 0, y: 0, w, h };
}

/** Splits a large chart into printable pages at full size, with page labels and trim marks. */
export function posterPages(svg: string, o: PosterOptions = {}): string[] {
  const { paper = 'letter', landscape = false, margin = 48, overlap = 24 } = o;
  const [pw, ph] = landscape ? [PAPER[paper][1], PAPER[paper][0]] : PAPER[paper];
  const box = svgBox(svg);
  const tw = pw - margin * 2;
  const th = ph - margin * 2;
  const stepX = tw - overlap;
  const stepY = th - overlap;
  const cols = Math.max(1, Math.ceil((box.w - overlap) / stepX));
  const rows = Math.max(1, Math.ceil((box.h - overlap) / stepY));
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  const pages: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x + c * stepX;
      const y = box.y + r * stepY;
      const mark = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#9ca3af" stroke-width="1"/>`;
      pages.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}">` +
          `<svg x="${margin}" y="${margin}" width="${tw}" height="${th}" viewBox="${x} ${y} ${tw} ${th}">${inner}</svg>` +
          mark(margin - 12, margin, margin, margin) + mark(margin, margin - 12, margin, margin) +
          mark(pw - margin, margin, pw - margin + 12, margin) + mark(pw - margin, margin - 12, pw - margin, margin) +
          mark(margin - 12, ph - margin, margin, ph - margin) + mark(margin, ph - margin, margin, ph - margin + 12) +
          mark(pw - margin, ph - margin, pw - margin + 12, ph - margin) + mark(pw - margin, ph - margin, pw - margin, ph - margin + 12) +
          `<text x="${pw / 2}" y="${ph - 16}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#6b7280">Page ${r * cols + c + 1} of ${rows * cols} (row ${r + 1}, column ${c + 1})</text></svg>`,
      );
    }
  }
  return pages;
}

/** A printable HTML document: one poster page per sheet of paper. */
export function posterHtml(pages: string[], o: PosterOptions = {}): string {
  const { paper = 'letter', landscape = false } = o;
  const size = `${paper === 'a4' || paper === 'a3' ? paper.toUpperCase() : paper} ${landscape ? 'landscape' : 'portrait'}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Poster</title><style>@page{size:${size};margin:0}body{margin:0}.p{page-break-after:always;break-after:page}.p svg{display:block}</style></head><body>${pages.map((p) => `<div class="p">${p}</div>`).join('')}</body></html>`;
}
