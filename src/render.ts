import type { Box, Chart, Link } from './layout';

// Also drops the control characters XML does not allow, which would make a saved SVG unreadable.
export const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Charts name this font so that text widths can be estimated without a browser. */
export const FONT = 'Arial, Helvetica, sans-serif';

// Advance widths of Helvetica/Arial for U+0020..U+007E, in 1/1000 em.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

// Estimated width in px. Accented letters count as their base letter; anything else non-Latin as a full em.
export function textWidth(s: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of s.normalize('NFD')) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x300 && c <= 0x36f) continue; // combining mark
    units += c >= 32 && c <= 126 ? WIDTHS[c - 32] : c < 0x2000 ? 600 : 1000;
  }
  return (units / 1000) * size * (bold ? 1.1 : 1.02);
}

// Shortens `s` with an ellipsis until it fits in `max` px.
export function fit(s: string, max: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= max) return s;
  const chars = [...s];
  while (chars.length > 1 && textWidth(chars.join('').trimEnd() + '…', size, bold) > max) chars.pop();
  return chars.join('').trimEnd() + '…';
}

const FILL: Record<string, string> = { male: '#dbeafe', female: '#fce7f3', family: '#f3f4f6', group: '#f3f4f6', vacant: '#fef3c7', assistant: '#dcfce7', unknown: '#ffffff' };

function anchor(b: Box, toward: Box, horizontal: boolean): [number, number] {
  if (horizontal) return [toward.x > b.x ? b.x + b.w : b.x, b.y + b.h / 2];
  return [b.x + b.w / 2, toward.y > b.y ? b.y + b.h : b.y];
}

const CLEAR = 14; // how far a dotted line steps out of a row or column to pass its boxes
const LANE = 8; // spacing of the dotted lines that run down the side of a hanging chart

// `lane` is the x of the vertical run for a dotted line in a hanging chart.
function linkPath(l: Link, a: Box, b: Box, horizontal: boolean, lane: number): string {
  if (l.hang) return `M${a.x + 16} ${a.y + a.h}V${b.y + b.h / 2}H${b.x}`;
  const [x1, y1] = anchor(a, b, horizontal);
  const [x2, y2] = anchor(b, a, horizontal);
  if (!l.dotted) return horizontal ? `M${x1} ${y1}H${(x1 + x2) / 2}V${y2}H${x2}` : `M${x1} ${y1}V${(y1 + y2) / 2}H${x2}V${y2}`;
  // Dotted lines leave and arrive a quarter of the way along the box edge and bend off the
  // midline, so they do not run on top of the solid connectors.
  if (l.side) return `M${a.x + a.w} ${a.y + a.h / 2}H${lane}V${b.y + b.h / 2}H${b.x + b.w}`;
  if (horizontal) {
    const ya = a.y + a.h * (b.y >= a.y ? 0.75 : 0.25);
    const yb = b.y + b.h * (a.y > b.y ? 0.75 : 0.25);
    return a.x === b.x ? `M${a.x} ${ya}H${a.x - CLEAR}V${yb}H${b.x}` : `M${x1} ${ya}H${x1 + (x2 - x1) * 0.3}V${yb}H${x2}`;
  }
  const xa = a.x + a.w * (b.x >= a.x ? 0.75 : 0.25);
  const xb = b.x + b.w * (a.x > b.x ? 0.75 : 0.25);
  return a.y === b.y ? `M${xa} ${a.y}V${a.y - CLEAR}H${xb}V${b.y}` : `M${xa} ${y1}V${y1 + (y2 - y1) * 0.3}H${xb}V${y2}`;
}

export function renderSvg(chart: Chart, margin = 16): string {
  const byId = new Map(chart.boxes.map((b) => [b.id, b]));
  const parts: string[] = [];
  let lanes = 0;
  for (const l of chart.links) {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b) continue;
    const lane = l.dotted && l.side ? chart.width + CLEAR + lanes++ * LANE : 0;
    parts.push(`<path d="${linkPath(l, a, b, chart.horizontal, lane)}" fill="none" stroke="#6b7280" stroke-width="1.5"${l.dotted ? ' stroke-dasharray="5 4"' : ''}/>`);
  }
  for (const b of chart.boxes) {
    const cx = b.x + b.w / 2;
    const room = b.w - 12;
    // Up to three lines: name, title or dates, and a note such as a roll-up count.
    const lines = [b.sublabel, b.note].filter((s): s is string => !!s);
    const ys = lines.length === 2 ? [19, 33, 47] : lines.length === 1 ? [b.h / 2 - 4, b.h / 2 + 14] : [b.h / 2 + 5];
    const full = [b.label, ...lines].join('\n');
    parts.push(
      `<g data-id="${esc(b.ref ?? b.id)}"><title>${esc(full)}</title>` +
        `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="${FILL[b.kind ?? 'unknown'] ?? '#fff'}" stroke="#374151"/>` +
        `<text x="${cx}" y="${b.y + ys[0]}" text-anchor="middle" font-size="13" font-weight="600" fill="#111827">${esc(fit(b.label, room, 13, true))}</text>` +
        lines.map((s, i) => `<text x="${cx}" y="${b.y + ys[i + 1]}" text-anchor="middle" font-size="${i ? 10 : 11}" fill="#4b5563">${esc(fit(s, room, i ? 10 : 11))}</text>`).join('') +
        `</g>`,
    );
  }
  const w = chart.width + margin * 2 + (lanes ? CLEAR + (lanes - 1) * LANE : 0); // room for the side lanes
  const h = chart.height + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${-margin} ${-margin} ${w} ${h}" font-family="${FONT}">${parts.join('')}</svg>`;
}
