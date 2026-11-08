import type { Box, Chart } from './layout';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const FILL: Record<string, string> = { male: '#dbeafe', female: '#fce7f3', family: '#f3f4f6', group: '#f3f4f6', vacant: '#fef3c7', assistant: '#dcfce7', added: '#bbf7d0', moved: '#fed7aa', target: '#fef08a', unknown: '#ffffff' };

export function trim(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function anchor(b: Box, toward: Box, horizontal: boolean): [number, number] {
  if (horizontal) return [toward.x > b.x ? b.x + b.w : b.x, b.y + b.h / 2];
  return [b.x + b.w / 2, toward.y > b.y ? b.y + b.h : b.y];
}

// Only web and embedded images are allowed, so an imported file cannot point at local or script URLs.
export const safePhoto = (u?: string) => (u && /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i.test(u.trim()) ? u.trim() : undefined);

export function renderSvg(chart: Chart, margin = 16): string {
  const byId = new Map(chart.boxes.map((b) => [b.id, b]));
  const horizontal = chart.horizontal;
  const parts: string[] = [];
  for (const l of chart.links) {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b) continue;
    const [x1, y1] = anchor(a, b, horizontal);
    const [x2, y2] = anchor(b, a, horizontal);
    const d = l.hang
      ? `M${a.x + 16} ${a.y + a.h}V${b.y + b.h / 2}H${b.x}`
      : l.dotted
        ? `M${x1} ${y1}V${(y1 + y2) / 2}H${x2}V${y2}`
        : horizontal
      ? `M${x1} ${y1}H${(x1 + x2) / 2}V${y2}H${x2}`
      : `M${x1} ${y1}V${(y1 + y2) / 2}H${x2}V${y2}`;
    parts.push(`<path d="${d}" fill="none" stroke="#6b7280" stroke-width="1.5"${l.dotted ? ' stroke-dasharray="5 4"' : ''}/>`);
  }
  for (const b of chart.boxes) {
    const photo = safePhoto(b.photo);
    const cx = b.x + b.w / 2 + (photo ? 16 : 0);
    parts.push(
      `<g data-id="${esc(b.id)}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="${FILL[b.kind ?? 'unknown'] ?? '#fff'}" stroke="#374151"/>` +
        (photo ? `<image href="${esc(photo)}" x="${b.x + 6}" y="${b.y + (b.h - 36) / 2}" width="36" height="36" preserveAspectRatio="xMidYMid slice"/>` : '') +
        `<text x="${cx}" y="${b.y + (b.sublabel ? b.h / 2 - 4 : b.h / 2 + 5)}" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="600" fill="#111827">${esc(trim(b.label, photo ? 18 : 24))}</text>` +
        (b.sublabel ? `<text x="${cx}" y="${b.y + b.h / 2 + 14}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#4b5563">${esc(trim(b.sublabel, photo ? 22 : 28))}</text>` : '') +
        `</g>`,
    );
  }
  const w = chart.width + margin * 2;
  const h = chart.height + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${-margin} ${-margin} ${w} ${h}">${parts.join('')}</svg>`;
}
