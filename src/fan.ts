import { lifeSpan, type GedcomData } from './gedcom';
import { esc, fit, FONT } from './render';

const RING = 90;
const CORE = 70;
const MARGIN = 16;
export const MAX_FAN_GENERATIONS = 9;

// Fan chart: person at the centre of a half circle, one ring per generation, father's side on the left.
export function fanChartSvg(g: GedcomData, rootId: string, generations = 5): string {
  const root = g.people.get(rootId);
  if (!root) throw new Error(`Unknown person ${rootId}`);
  const rings = Math.min(Math.max(Math.floor(generations) || 1, 1), MAX_FAN_GENERATIONS) - 1;
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
    const d = `M${at(r2, a1)}A${r2} ${r2} 0 0 1 ${at(r2, a2)}L${at(r1, a2)}A${r1} ${r1} 0 0 0 ${at(r1, a1)}Z`;
    const fill = p.sex === 'M' ? '#dbeafe' : p.sex === 'F' ? '#fce7f3' : '#ffffff';
    const deg = (-mid * 180) / Math.PI;
    const flip = mid > Math.PI / 2 ? 180 : 0;
    const [tx, ty] = at((r1 + r2) / 2, mid).split(' ');
    // Names run along the radius, so the wedge's inner arc is the line height available.
    const arc = r1 * span;
    const size = Math.max(5, Math.min(11, arc - 2));
    const span2 = lifeSpan(p);
    const two = !!span2 && arc >= 26;
    parts.push(
      `<g data-id="${esc(id)}"><title>${esc(span2 ? `${p.name}\n${span2}` : p.name)}</title><path d="${d}" fill="${fill}" stroke="#374151"/>` +
        `<text transform="translate(${tx} ${ty}) rotate(${deg + flip})" text-anchor="middle" font-size="${size.toFixed(1)}" fill="#111827">` +
        `<tspan x="0" dy="${two ? -2 : (size * 0.35).toFixed(1)}">${esc(fit(p.name, RING - 6, size))}</tspan>` +
        (two ? `<tspan x="0" dy="12" font-size="9" fill="#4b5563">${esc(span2)}</tspan>` : '') +
        `</text></g>`,
    );
    if (ring >= rings) return;
    const fam = g.families.get(p.famc[0] ?? '');
    if (fam?.husband && g.people.has(fam.husband)) place(fam.husband, ring + 1, slot * 2);
    if (fam?.wife && g.people.has(fam.wife)) place(fam.wife, ring + 1, slot * 2 + 1);
  };

  const rootSpan = lifeSpan(root);
  parts.push(
    `<g data-id="${esc(rootId)}"><title>${esc(rootSpan ? `${root.name}\n${rootSpan}` : root.name)}</title>` +
      `<path d="M${cx - (CORE - 6)} ${cy}A${CORE - 6} ${CORE - 6} 0 0 1 ${cx + (CORE - 6)} ${cy}Z" fill="#f3f4f6" stroke="#374151"/>` +
      `<text x="${cx}" y="${cy - 26}" text-anchor="middle" font-size="12" font-weight="600" fill="#111827">${esc(fit(root.name, 104, 12, true))}</text>` +
      (rootSpan ? `<text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="10" fill="#4b5563">${esc(rootSpan)}</text>` : '') +
      `</g>`,
  );
  const fam = g.families.get(root.famc[0] ?? '');
  if (rings >= 1) {
    if (fam?.husband && g.people.has(fam.husband)) place(fam.husband, 1, 0);
    if (fam?.wife && g.people.has(fam.wife)) place(fam.wife, 1, 1);
  }
  const w = 2 * R + MARGIN * 2;
  const h = R + MARGIN * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">${parts.join('')}</svg>`;
}
