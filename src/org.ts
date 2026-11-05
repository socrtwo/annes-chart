import { layoutTree, orgToTree, type Chart, type Link, type LayoutOptions, type OrgRow, type TreeSource, type Box } from './layout';

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
    boxes.push({ id: n.id, label: n.label, sublabel: n.sublabel, kind: n.kind, x: depth * (indent + gapX / 2), y: row++ * (boxH + gapY), w: boxW, h: boxH });
    for (const c of n.children) {
      if (seen.has(c.id)) continue;
      links.push({ from: n.id, to: c.id, hang: true });
      place(c, depth + 1);
    }
  };
  place(root, 0);
  return { boxes, links, width: maxDepth * (indent + gapX / 2) + boxW, height: row * (boxH + gapY) - gapY, horizontal: false };
}

export function orgChart(rows: OrgRow[], style: OrgStyle = 'standard', opts: LayoutOptions = {}): Chart {
  const tree = orgToTree(rows);
  const chart =
    style === 'hanging' ? layoutHanging(tree, opts) : layoutTree(tree, { ...opts, orientation: style === 'horizontal' ? 'left-right' : 'top-down' });
  const ids = new Set(chart.boxes.map((b) => b.id));
  for (const r of rows) if (r.dotted && ids.has(r.dotted) && ids.has(r.id)) chart.links.push({ from: r.dotted, to: r.id, dotted: true });
  return chart;
}
