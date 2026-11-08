import { layoutTree, orgToTree, type Box, type Chart, type LayoutOptions, type Link, type OrgRow, type TreeSource } from './layout';

export type OrgStyle = 'standard' | 'hanging' | 'horizontal' | 'side-by-side' | 'matrix';

interface Part {
  boxes: Box[];
  links: Link[];
  w: number;
  h: number;
  cx: number; // x of the root box center
}

const INDENT = 32;

function box(n: TreeSource, x: number, y: number, w: number, h: number): Box {
  return { id: n.id, label: n.label, sublabel: n.sublabel, kind: n.kind, photo: n.photo, x, y, w, h };
}

const shift = (p: Part, dx: number, dy: number): Box[] => p.boxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }));

// Reports are stacked under their manager and indented, like a file tree.
function hung(n: TreeSource, o: Required<Pick<LayoutOptions, 'boxW' | 'boxH'>>, seen: Set<string>): Part {
  const { boxW, boxH } = o;
  const gap = 16;
  seen.add(n.id);
  const boxes = [box(n, 0, 0, boxW, boxH)];
  const links: Link[] = [];
  let y = boxH + gap;
  let w = boxW;
  for (const c of n.children) {
    if (seen.has(c.id)) continue;
    const part = hung(c, o, seen);
    boxes.push(...shift(part, INDENT, y));
    links.push({ from: n.id, to: c.id, hang: true }, ...part.links);
    w = Math.max(w, INDENT + part.w);
    y += part.h + gap;
  }
  return { boxes, links, w, h: y - gap, cx: boxW / 2 };
}

// Levels above `hangFrom` spread side by side; everything below hangs under its manager.
function mixed(n: TreeSource, depth: number, hangFrom: number, o: { boxW: number; boxH: number; gapX: number; gapY: number }, seen: Set<string>): Part {
  if (depth >= hangFrom) return hung(n, o, seen);
  seen.add(n.id);
  const kids = n.children.filter((c) => !seen.has(c.id)).map((c) => ({ c, part: mixed(c, depth + 1, hangFrom, o, seen) }));
  if (!kids.length) return { boxes: [box(n, 0, 0, o.boxW, o.boxH)], links: [], w: o.boxW, h: o.boxH, cx: o.boxW / 2 };
  const boxes: Box[] = [];
  const links: Link[] = [];
  let x = 0;
  const centers: number[] = [];
  let h = 0;
  for (const { c, part } of kids) {
    boxes.push(...shift(part, x, o.boxH + o.gapY));
    links.push({ from: n.id, to: c.id }, ...part.links);
    centers.push(x + part.cx);
    h = Math.max(h, part.h);
    x += part.w + o.gapX;
  }
  const w = x - o.gapX;
  const cx = (centers[0] + centers[centers.length - 1]) / 2;
  boxes.unshift(box(n, cx - o.boxW / 2, 0, o.boxW, o.boxH));
  // The parent can sit left of or right of the children block when it is wider than it.
  const minX = Math.min(0, cx - o.boxW / 2);
  const out = minX < 0 ? boxes.map((b) => ({ ...b, x: b.x - minX })) : boxes;
  return { boxes: out, links, w: Math.max(w, cx + o.boxW / 2) - minX, h: o.boxH + o.gapY + h, cx: cx - minX };
}

function toChart(p: Part): Chart {
  const maxX = Math.max(...p.boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...p.boxes.map((b) => b.y + b.h));
  return { boxes: p.boxes, links: p.links, width: maxX, height: maxY, horizontal: false };
}

function dims(opts: LayoutOptions) {
  return { boxW: opts.boxW ?? 160, boxH: opts.boxH ?? 56, gapX: opts.gapX ?? 24, gapY: opts.gapY ?? 48 };
}

/**
 * Matrix layout: columns are the units under the top person, rows are the matrix (dotted-line) leads.
 * Each person sits in the cell where their unit meets their matrix lead; people with no dotted line
 * go in the first row.
 */
function layoutMatrix(rows: OrgRow[], opts: LayoutOptions): Chart {
  const { boxW, boxH, gapX } = dims(opts);
  const gap = 12;
  const tree = orgToTree(rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const unitOf = new Map<string, string>();
  const mark = (n: TreeSource, unit: string, seen: Set<string>) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    unitOf.set(n.id, unit);
    for (const c of n.children) mark(c, unit, seen);
  };
  const seen = new Set<string>([tree.id]);
  for (const head of tree.children) mark(head, head.id, seen);
  const heads = tree.children;
  if (!heads.length) return layoutTree(tree, opts);

  const rowKeys: string[] = [''];
  for (const r of rows) if (r.dotted && byId.has(r.dotted) && unitOf.has(r.id) && !rowKeys.includes(r.dotted)) rowKeys.push(r.dotted);
  const cells = new Map<string, TreeSource[]>();
  const nodes = new Map<string, TreeSource>();
  const collect = (n: TreeSource, s: Set<string>) => {
    if (s.has(n.id)) return;
    s.add(n.id);
    nodes.set(n.id, n);
    n.children.forEach((c) => collect(c, s));
  };
  collect(tree, new Set());
  for (const h of heads) {
    for (const [id, unit] of unitOf) {
      if (unit !== h.id || id === h.id) continue;
      const key = rowKeys.includes(byId.get(id)?.dotted ?? '') ? (byId.get(id)?.dotted ?? '') : '';
      const k = `${key}|${unit}`;
      cells.set(k, [...(cells.get(k) ?? []), nodes.get(id)!]);
    }
  }

  const labelW = boxW;
  const colX = (i: number) => labelW + gapX + i * (boxW + gapX);
  const boxes: Box[] = [];
  const links: Link[] = [];
  const totalW = colX(heads.length) - gapX;
  boxes.push(box(tree, (totalW - boxW) / 2, 0, boxW, boxH));
  const headY = boxH + 48;
  heads.forEach((h, i) => {
    boxes.push(box(h, colX(i), headY, boxW, boxH));
    links.push({ from: tree.id, to: h.id });
  });
  let y = headY + boxH + gap * 2;
  for (const key of rowKeys) {
    const rowCells = heads.map((h) => cells.get(`${key}|${h.id}`) ?? []);
    const tallest = Math.max(1, ...rowCells.map((c) => c.length));
    const label = key ? byId.get(key)! : undefined;
    boxes.push({ id: `row:${key || 'line'}`, label: label ? label.name : 'Line organization', sublabel: label ? 'Matrix lead' : 'No dotted line', kind: 'group', x: 0, y, w: labelW, h: boxH });
    rowCells.forEach((members, i) => members.forEach((m, j) => boxes.push(box(m, colX(i), y + j * (boxH + gap), boxW, boxH))));
    y += tallest * (boxH + gap) + gap;
  }
  return { boxes, links, width: totalW, height: y - gap * 2, horizontal: false };
}

export function orgChart(rows: OrgRow[], style: OrgStyle = 'standard', opts: LayoutOptions = {}, rollup = false, highlight?: Map<string, string>): Chart {
  const tree = orgToTree(rows);
  if (rollup) rollUp(tree);
  const d = dims(opts);
  let chart: Chart;
  if (style === 'hanging') chart = toChart(hung(tree, d, new Set()));
  else if (style === 'side-by-side') chart = toChart(mixed(tree, 0, 1, d, new Set()));
  else if (style === 'matrix') chart = layoutMatrix(rows, opts);
  else chart = layoutTree(tree, { ...opts, orientation: style === 'horizontal' ? 'left-right' : 'top-down' });
  const ids = new Set(chart.boxes.map((b) => b.id));
  if (style !== 'matrix') {
    for (const r of rows) if (r.dotted && ids.has(r.dotted) && ids.has(r.id)) chart.links.push({ from: r.dotted, to: r.id, dotted: true });
  }
  if (highlight) for (const b of chart.boxes) if (highlight.has(b.id)) b.kind = highlight.get(b.id);
  return chart;
}

// Appends the total number of people below each manager.
function rollUp(n: TreeSource, seen = new Set<string>()): number {
  seen.add(n.id);
  let total = 0;
  for (const c of n.children) if (!seen.has(c.id)) total += 1 + rollUp(c, seen);
  if (total) n.sublabel = `${n.sublabel ? n.sublabel + ' · ' : ''}${total} report${total === 1 ? '' : 's'}`;
  return total;
}
