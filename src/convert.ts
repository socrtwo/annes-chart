import type { Chart } from './layout';
import { emptyDoc, type Doc, type Shape } from './document';

/** Turns a generated chart into an editable drawing: each box becomes a shape, each link a connector. */
export function chartToDoc(chart: Chart): Doc {
  const doc = emptyDoc();
  const ids = new Map<string, string>();
  chart.boxes.forEach((b, i) => {
    const id = `s${i + 1}`;
    ids.set(b.id, id);
    const shape: Shape = { id, x: Math.round(b.x), y: Math.round(b.y), w: b.w, h: b.h, text: [b.label, b.sublabel].filter(Boolean).join(' - '), kind: 'rounded' };
    doc.shapes.push(shape);
  });
  for (const l of chart.links) {
    const from = ids.get(l.from);
    const to = ids.get(l.to);
    if (from && to && !doc.connectors.some((c) => c.from === from && c.to === to)) doc.connectors.push({ id: `c${doc.connectors.length + 1}`, from, to });
  }
  return doc;
}
