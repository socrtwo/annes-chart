import { lifeSpan, type GedcomData } from './gedcom';
import { esc, trim } from './render';

const RING = 90;
const CORE = 70;
const MARGIN = 16;

// Fan chart: person at the centre of a half circle, one ring per generation, father's side on the left.
export function fanChartSvg(g: GedcomData, rootId: string, generations = 5): string {
  const root = g.people.get(rootId);
  if (!root) throw new Error(`Unknown person ${rootId}`);
  const rings = Math.min(Math.max(generations, 1), 9) - 1;
  const R = CORE + rings * RING;
  const cx = R + MARGIN;
  const cy = R + MARGIN;
  const at = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy - r * Math.sin(a)).toFixed(1)}`;

  const parts: string[] = [];
  const place = (id: string, ring: number, slot: number) => {
    const p = g.people.get(id)!;
    const span = Math.PI / 2 ** ring;
    const a1 = Math.PI - slot * span;
    const a2 = a1 - span;
    const r1 = CORE + (ring - 1) * RING;
    const r2 = r1 + RING;
    const mid = (a1 + a2) / 2;
    const large = span > Math.PI ? 1 : 0;
    const d = `M${at(r2, a1)}A${r2} ${r2} 0 ${large} 1 ${at(r2, a2)}L${at(r1, a2)}A${r1} ${r1} 0 ${large} 0 ${at(r1, a1)}Z`;
    const fill = p.sex === 'M' ? '#dbeafe' : p.sex === 'F' ? '#fce7f3' : '#ffffff';
    const deg = (-mid * 180) / Math.PI;
    const flip = mid > Math.PI / 2 ? 180 : 0;
    const [tx, ty] = at((r1 + r2) / 2, mid).split(' ');
    const room = Math.max(6, Math.floor((RING - 6) / 5.5));
    parts.push(
      `<g data-id="${esc(id)}"><path d="${d}" fill="${fill}" stroke="#374151"/>` +
        `<text transform="translate(${tx} ${ty}) rotate(${deg + flip})" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#111827">` +
        `<tspan x="0" dy="-1">${esc(trim(p.name, room))}</tspan>` +
        (ring <= 4 && lifeSpan(p) ? `<tspan x="0" dy="12" font-size="9" fill="#4b5563">${esc(lifeSpan(p))}</tspan>` : '') +
        `</text></g>`,
    );
    if (ring >= rings) return;
    const fam = g.families.get(p.famc[0] ?? '');
    if (fam?.husband && g.people.has(fam.husband)) place(fam.husband, ring + 1, slot * 2);
    if (fam?.wife && g.people.has(fam.wife)) place(fam.wife, ring + 1, slot * 2 + 1);
  };

  parts.push(
    `<g data-id="${esc(rootId)}"><path d="M${cx - (CORE - 6)} ${cy}A${CORE - 6} ${CORE - 6} 0 0 1 ${cx + (CORE - 6)} ${cy}Z" fill="#f3f4f6" stroke="#374151"/>` +
      `<text x="${cx}" y="${cy - 26}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#111827">${esc(trim(root.name, 14))}</text>` +
      `<text x="${cx}" y="${cy - 10}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#4b5563">${esc(lifeSpan(root))}</text></g>`,
  );
  const fam = g.families.get(root.famc[0] ?? '');
  if (rings >= 1) {
    if (fam?.husband && g.people.has(fam.husband)) place(fam.husband, 1, 0);
    if (fam?.wife && g.people.has(fam.wife)) place(fam.wife, 1, 1);
  }
  const w = 2 * R + MARGIN * 2;
  const h = R + MARGIN * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`;
}
