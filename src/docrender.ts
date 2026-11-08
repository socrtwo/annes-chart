import { esc } from './render';
import type { Doc, Shape } from './document';

const MARGIN = 16;

function body(s: Shape, stroke: string, width: number): string {
  const paint = `fill="#fff" stroke="${stroke}" stroke-width="${width}"`;
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  switch (s.kind) {
    case 'ellipse':
      return `<ellipse cx="${cx}" cy="${cy}" rx="${s.w / 2}" ry="${s.h / 2}" ${paint}/>`;
    case 'diamond':
      return `<polygon points="${cx},${s.y} ${s.x + s.w},${cy} ${cx},${s.y + s.h} ${s.x},${cy}" ${paint}/>`;
    default:
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.kind === 'rectangle' ? 0 : 6}" ${paint}/>`;
  }
}

/** Renders a document to SVG at 1:1 scale so pointer deltas equal document units. */
export function renderDoc(doc: Doc, selected: ReadonlySet<string> = new Set(), minW = 800, minH = 500): string {
  const byId = new Map(doc.shapes.map((s) => [s.id, s]));
  let x0 = 0;
  let y0 = 0;
  let x1 = minW;
  let y1 = minH;
  for (const s of doc.shapes) {
    x0 = Math.min(x0, s.x - MARGIN);
    y0 = Math.min(y0, s.y - MARGIN);
    x1 = Math.max(x1, s.x + s.w + MARGIN);
    y1 = Math.max(y1, s.y + s.h + MARGIN);
  }
  const parts: string[] = [];
  for (const c of doc.connectors) {
    const a = byId.get(c.from);
    const b = byId.get(c.to);
    if (!a || !b) continue;
    parts.push(
      `<line data-connector="${esc(c.id)}" x1="${a.x + a.w / 2}" y1="${a.y + a.h / 2}" x2="${b.x + b.w / 2}" y2="${b.y + b.h / 2}" stroke="#6b7280" stroke-width="1.5"/>`,
    );
  }
  for (const s of doc.shapes) {
    const on = selected.has(s.id);
    parts.push(
      `<g data-id="${esc(s.id)}" style="cursor:move">${body(s, on ? '#2563eb' : '#374151', on ? 3 : 1)}` +
        `<text x="${s.x + s.w / 2}" y="${s.y + s.h / 2 + 5}" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#111827">${esc(s.text)}</text></g>`,
    );
  }
  const w = x1 - x0;
  const h = y1 - y0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}">${parts.join('')}</svg>`;
}
