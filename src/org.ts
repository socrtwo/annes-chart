import { buildOrg, layoutTree, type Box, type Chart, type LayoutOptions, type Link, type OrgRow, type TreeSource } from './layout';

export type OrgStyle = 'standard' | 'hanging' | 'horizontal';

// Children are stacked under their manager and indented, like a file tree.
function layoutHanging(root: TreeSource, opts: LayoutOptions = {}): Chart {
  const { boxW = 160, boxH = 56, gapX = 24, gapY = 16 } = opts;
  const indent = 32;
  const boxes: Box[] = [];
  const links: Link[] = [];
  const seen = new Set<string>();
  let row = 0;
  let maxDepth = 0;
  const place = (n: TreeSource, depth: number) => {
    seen.add(n.id);
    maxDepth = Math.max(maxDepth, depth);
    boxes.push({ id: n.id, ref: n.ref, label: n.label, sublabel: n.sublabel, note: n.note, kind: n.kind, x: depth * (indent + gapX / 2), y: row++ * (boxH + gapY), w: boxW, h: boxH });
    for (const c of n.children) {
      if (seen.has(c.id)) continue;
      links.push({ from: n.id, to: c.id, hang: true });
      place(c, depth + 1);
    }
  };
  place(root, 0);
  return { boxes, links, width: maxDepth * (indent + gapX / 2) + boxW, height: row * (boxH + gapY) - gapY, horizontal: false };
}

// Notes the total number of positions below each manager, on a line of its own.
function rollUp(n: TreeSource, seen = new Set<string>()): number {
  seen.add(n.id);
  let total = 0;
  for (const c of n.children) if (!seen.has(c.id)) total += 1 + rollUp(c, seen);
  if (total) n.note = `${total} report${total === 1 ? '' : 's'}`;
  return total;
}

export function orgChart(rows: OrgRow[], style: OrgStyle = 'standard', opts: LayoutOptions = {}, rollup = false): Chart {
  const org = buildOrg(rows);
  const warnings = [...org.warnings];
  if (rollup) rollUp(org.tree);
  const chart =
    style === 'hanging' ? layoutHanging(org.tree, opts) : layoutTree(org.tree, { ...opts, orientation: style === 'horizontal' ? 'left-right' : 'top-down' });
  rows.forEach((r, i) => {
    if (!r.dotted) return;
    const from = org.resolve(r.dotted);
    if (!from) warnings.push(`"${r.name || r.id}": dotted-line manager "${r.dotted}" was not found`);
    else if (from !== org.keys[i]) chart.links.push(style === 'hanging' ? { from, to: org.keys[i], dotted: true, side: true } : { from, to: org.keys[i], dotted: true });
  });
  return { ...chart, warnings };
}
