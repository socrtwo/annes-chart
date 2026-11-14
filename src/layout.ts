import { lifeSpan, type GedcomData } from './gedcom';

export interface TreeSource {
  /** Unique within one chart. */
  id: string;
  /** The person or row this box stands for; differs from `id` when it is drawn more than once. */
  ref?: string;
  label: string;
  sublabel?: string;
  /** Third line, e.g. a roll-up count. */
  note?: string;
  kind?: string;
  children: TreeSource[];
}

export interface Box {
  id: string;
  ref?: string;
  label: string;
  sublabel?: string;
  note?: string;
  kind?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Link {
  from: string;
  to: string;
  dotted?: boolean;
  hang?: boolean;
  /** Dotted link in a hanging chart: routed down the right-hand side of the column. */
  side?: boolean;
}

export interface Chart {
  boxes: Box[];
  links: Link[];
  width: number;
  height: number;
  horizontal: boolean;
  /** The chart reached MAX_BOXES and is incomplete. */
  truncated?: boolean;
  warnings?: string[];
}

export type Orientation = 'top-down' | 'left-right' | 'right-left' | 'bottom-up';

export interface LayoutOptions {
  orientation?: Orientation;
  boxW?: number;
  boxH?: number;
  gapX?: number;
  gapY?: number;
}

// Tidy tree: leaves take consecutive slots, each parent is centered over its children.
export function layoutTree(root: TreeSource, opts: LayoutOptions = {}): Chart {
  const { orientation = 'top-down', boxW = 160, boxH = 56, gapX = 24, gapY = 48 } = opts;
  const horizontal = orientation === 'left-right' || orientation === 'right-left';
  const reversed = orientation === 'bottom-up' || orientation === 'right-left';
  const slot = horizontal ? boxH + gapX : boxW + gapX; // between siblings
  const level = horizontal ? boxW + gapY : boxH + gapY; // between generations
  const levelSize = horizontal ? boxW : boxH;

  const placed: { n: TreeSource; sib: number; depth: number }[] = [];
  const links: Link[] = [];
  const seen = new Set<string>();
  let next = 0;
  let maxDepth = 0;

  const place = (n: TreeSource, depth: number): number => {
    seen.add(n.id);
    maxDepth = Math.max(maxDepth, depth);
    const centers: number[] = [];
    for (const c of n.children) {
      if (seen.has(c.id)) continue;
      links.push({ from: n.id, to: c.id });
      centers.push(place(c, depth + 1));
    }
    const sib = centers.length ? (centers[0] + centers[centers.length - 1]) / 2 : next++ * slot;
    placed.push({ n, sib, depth });
    return sib;
  };
  place(root, 0);

  const sibSpan = Math.max(1, next) * slot - gapX;
  const levSpan = maxDepth * level + levelSize;
  const boxes: Box[] = placed.map(({ n, sib, depth }) => {
    const lev = reversed ? maxDepth * level - depth * level : depth * level;
    return {
      id: n.id,
      ref: n.ref,
      label: n.label,
      sublabel: n.sublabel,
      note: n.note,
      kind: n.kind,
      x: horizontal ? lev : sib,
      y: horizontal ? sib : lev,
      w: boxW,
      h: boxH,
    };
  });
  return { boxes, links, width: horizontal ? levSpan : sibSpan, height: horizontal ? sibSpan : levSpan, horizontal };
}

export interface OrgRow {
  id: string;
  name: string;
  title?: string;
  manager?: string;
  dotted?: string;
  assistant?: boolean;
}

export interface OrgTree {
  tree: TreeSource;
  /** Box id of each row, in row order. */
  keys: string[];
  /** Box id for a manager or dotted-line reference: an ID first, otherwise a name. */
  resolve(ref: string): string | undefined;
  warnings: string[];
}

// Every row gets a box. Several roots hang under a synthetic top box; a reporting loop is
// opened at its first row; a duplicate ID gets a box of its own.
export function buildOrg(rows: OrgRow[]): OrgTree {
  const warnings: string[] = [];
  const keys: string[] = [];
  const used = new Set<string>();
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  const who = (i: number) => `"${rows[i].name || rows[i].title || rows[i].id || 'Vacant'}" (entry ${i + 1})`;
  rows.forEach((r, i) => {
    let key = r.id;
    if (!key || used.has(key)) {
      if (key) warnings.push(`${who(i)} has the same ID or name as an earlier entry; it is shown as a separate box`);
      key = `${key || 'row'}#${i + 1}`;
      while (used.has(key)) key += '_';
    }
    used.add(key);
    keys.push(key);
    if (r.id && !byId.has(r.id)) byId.set(r.id, i);
    const name = r.name.trim().toLowerCase();
    if (name && !byName.has(name)) byName.set(name, i);
  });
  const find = (ref: string) => byId.get(ref.trim()) ?? byName.get(ref.trim().toLowerCase());

  const parent: (number | undefined)[] = rows.map((r, i) => {
    if (!r.manager) return undefined;
    const m = find(r.manager);
    if (m === undefined) warnings.push(`${who(i)}: manager "${r.manager}" was not found, so it is shown at the top level`);
    return m === i ? undefined : m;
  });

  // Open reporting loops (A reports to B, B reports to A), which no top-level box would reach.
  const state = new Uint8Array(rows.length); // 0 new, 1 on the current walk, 2 done
  for (let i = 0; i < rows.length; i++) {
    const walk: number[] = [];
    let j: number | undefined = i;
    while (j !== undefined && state[j] === 0) {
      state[j] = 1;
      walk.push(j);
      j = parent[j];
    }
    if (j !== undefined && state[j] === 1) {
      const loop = walk.slice(walk.indexOf(j));
      const top = Math.min(...loop);
      parent[top] = undefined;
      warnings.push(`Reporting loop between ${loop.map((k) => `"${rows[k].name || rows[k].id}"`).join(' and ')}; ${who(top)} is shown at the top level`);
    }
    for (const k of walk) state[k] = 2;
  }

  const nodes: TreeSource[] = rows.map((r, i) => ({
    id: keys[i],
    ref: r.id || undefined,
    label: r.name || 'Vacant',
    sublabel: r.title,
    kind: !r.name ? 'vacant' : r.assistant ? 'assistant' : undefined,
    children: [],
  }));
  const staff: TreeSource[][] = rows.map(() => []);
  const roots: TreeSource[] = [];
  rows.forEach((r, i) => {
    const p = parent[i];
    if (p === undefined) roots.push(nodes[i]);
    else if (r.assistant) staff[p].push(nodes[i]);
    else nodes[p].children.push(nodes[i]);
  });
  nodes.forEach((n, i) => n.children.unshift(...staff[i])); // assistants first, in file order

  let top = '__root__';
  while (used.has(top)) top += '_';
  const tree = roots.length === 1 ? roots[0] : { id: top, label: 'Organization', kind: 'group', children: roots };
  return {
    tree,
    keys,
    resolve: (ref) => {
      const i = find(ref);
      return i === undefined ? undefined : keys[i];
    },
    warnings,
  };
}

export const orgToTree = (rows: OrgRow[]): TreeSource => buildOrg(rows).tree;

// Comma, semicolon or tab, whichever the header line uses most (outside quotes).
function sniffDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  return counts[';'] > counts[','] && counts[';'] >= counts['\t'] ? ';' : counts['\t'] > counts[','] ? '\t' : ',';
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const sep = delimiter ?? sniffDelimiter(text);
  const table: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((c) => c.trim())) table.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
  }
  endRow();
  return table;
}

// First row is the header. Rows may be shorter than the header (spreadsheets drop trailing blanks).
export function orgRowsFromTable(rows: string[][]): OrgRow[] {
  const table = rows.filter((r) => r.some((c) => c?.trim()));
  if (!table.length) return [];
  const head = table[0].map((h) => (h ?? '').trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const id = col('id', 'employee id', 'employeeid');
  const name = col('name', 'employee', 'full name');
  const title = col('title', 'job title', 'position', 'role');
  const typ = col('type', 'position type', 'assistant');
  const dot = col('dotted', 'dotted line', 'dotted manager', 'dotted line manager');
  const mgr = col('manager', 'manager id', 'managerid', 'reports to', 'supervisor', 'parent');
  if (name < 0) throw new Error('No Name column found (expected columns: ID, Name, Title, Manager)');
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  return table.slice(1).map((r) => ({
    id: id >= 0 ? cell(r, id) : cell(r, name),
    name: cell(r, name),
    title: cell(r, title) || undefined,
    manager: cell(r, mgr) || undefined,
    assistant: typ >= 0 ? /^(assistant|asst|y|yes|true|1)$/i.test(cell(r, typ)) : undefined,
    dotted: cell(r, dot) || undefined,
  }));
}

export const parseOrgCsv = (text: string): OrgRow[] => orgRowsFromTable(parseCsv(text));

export type GenealogyKind = 'descendants' | 'ancestors' | 'hourglass' | 'bowtie';

/** A chart stops growing at this many boxes; `Chart.truncated` is then set. */
export const MAX_BOXES = 5000;

export interface TreeContext {
  /** How many boxes each person has so far; a repeat gets the id "person#2". */
  used: Map<string, number>;
  /** People whose descendants are already drawn. */
  expanded: Set<string>;
  left: number;
  truncated: boolean;
}

export const treeContext = (limit = MAX_BOXES): TreeContext => ({ used: new Map(), expanded: new Set(), left: limit, truncated: false });

function uniqueId(ctx: TreeContext, id: string): string {
  const n = (ctx.used.get(id) ?? 0) + 1;
  ctx.used.set(id, n);
  ctx.left--;
  return n === 1 ? id : `${id}#${n}`;
}

function room(ctx: TreeContext): boolean {
  if (ctx.left > 0) return true;
  ctx.truncated = true;
  return false;
}

function personNode(g: GedcomData, id: string, ctx: TreeContext): TreeSource {
  const p = g.people.get(id)!;
  return { id: uniqueId(ctx, id), ref: id, label: p.name, sublabel: lifeSpan(p), kind: p.sex === 'M' ? 'male' : p.sex === 'F' ? 'female' : 'unknown', children: [] };
}

// Pedigree: the person at the root, parents as its children, up to `generations`. An ancestor
// reached by two lines (cousins marrying) is drawn on both; `path` only stops a person from
// being their own ancestor.
export function ancestorTree(g: GedcomData, id: string, generations = 5, ctx = treeContext(), path = new Set<string>()): TreeSource {
  const node = personNode(g, id, ctx);
  if (generations <= 1) return node;
  path.add(id);
  const fam = g.families.get(g.people.get(id)!.famc[0] ?? '');
  for (const pid of [fam?.husband, fam?.wife]) {
    if (pid && g.people.has(pid) && !path.has(pid) && room(ctx)) node.children.push(ancestorTree(g, pid, generations - 1, ctx, path));
  }
  path.delete(id);
  return node;
}

// Descendants: a person, then each marriage as a node, then that marriage's children. Someone
// reached twice (both parents descend from the root) gets a box each time, but their own
// descendants are drawn only under the first.
export function descendantTree(g: GedcomData, id: string, generations = 5, ctx = treeContext()): TreeSource {
  const node = personNode(g, id, ctx);
  if (generations <= 1 || ctx.expanded.has(id)) return node;
  ctx.expanded.add(id);
  for (const fid of g.people.get(id)!.fams) {
    const fam = g.families.get(fid);
    if (!fam || !room(ctx)) continue;
    const spouseId = fam.husband === id ? fam.wife : fam.husband;
    const marriage: TreeSource = {
      id: uniqueId(ctx, `${id}+${fid}`),
      label: spouseId && g.people.has(spouseId) ? `⚭ ${g.people.get(spouseId)!.name}` : '⚭ Unknown partner',
      sublabel: [fam.marriage?.date, fam.divorced ? 'divorced' : ''].filter(Boolean).join(', '),
      kind: 'family',
      children: [],
    };
    for (const cid of fam.children) {
      if (g.people.has(cid) && room(ctx)) marriage.children.push(descendantTree(g, cid, generations - 1, ctx));
    }
    node.children.push(marriage);
  }
  return node;
}

// Moves the boxes so the top-left one sits at 0,0 and measures the result.
function frame(boxes: Box[], links: Link[], horizontal: boolean, ctx: TreeContext): Chart {
  let minX = Infinity;
  let minY = Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
  }
  let width = 0;
  let height = 0;
  for (const b of boxes) {
    b.x -= minX;
    b.y -= minY;
    width = Math.max(width, b.x + b.w);
    height = Math.max(height, b.y + b.h);
  }
  return { boxes, links, width, height, horizontal, truncated: ctx.truncated || undefined };
}

export function genealogyChart(g: GedcomData, kind: GenealogyKind, rootId: string, generations: number, opts: LayoutOptions = {}): Chart {
  if (!g.people.has(rootId)) throw new Error(`Unknown person ${rootId}`);
  const ctx = treeContext();
  if (kind === 'bowtie') return bowtieChart(g, rootId, generations, opts, ctx);
  if (kind === 'ancestors' || kind === 'descendants') {
    const tree = kind === 'ancestors' ? ancestorTree(g, rootId, generations, ctx) : descendantTree(g, rootId, generations, ctx);
    const chart = layoutTree(tree, kind === 'ancestors' ? { orientation: 'right-left', ...opts } : opts);
    return { ...chart, truncated: ctx.truncated || undefined };
  }
  // Hourglass: ancestors above, descendants below, joined at the root box.
  const upTree = ancestorTree(g, rootId, generations, ctx);
  const downTree = descendantTree(g, rootId, generations, ctx);
  downTree.id = rootId; // the same box as the root of the upper half
  const up = layoutTree(upTree, { ...opts, orientation: 'bottom-up' });
  const down = layoutTree(downTree, { ...opts, orientation: 'top-down' });
  const rootUp = up.boxes.find((b) => b.id === rootId)!;
  const rootDown = down.boxes.find((b) => b.id === rootId)!;
  const dx = rootUp.x - rootDown.x;
  const dy = rootUp.y - rootDown.y;
  const boxes = [...up.boxes, ...down.boxes.filter((b) => b !== rootDown).map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }))];
  return frame(boxes, [...up.links, ...down.links], false, ctx);
}

// Bowtie: the person in the middle, father's ancestors extending left, mother's extending right.
function bowtieChart(g: GedcomData, rootId: string, generations: number, opts: LayoutOptions, ctx: TreeContext): Chart {
  const { boxW = 160, boxH = 56, gapY = 48 } = opts;
  const me = personNode(g, rootId, ctx);
  const fam = g.families.get(g.people.get(rootId)!.famc[0] ?? '');
  const boxes: Box[] = [{ id: me.id, ref: me.ref, label: me.label, sublabel: me.sublabel, kind: me.kind, x: 0, y: 0, w: boxW, h: boxH }];
  const links: Link[] = [];
  const sides: [string | undefined, Orientation][] = [
    [fam?.husband, 'right-left'],
    [fam?.wife, 'left-right'],
  ];
  for (const [pid, orientation] of sides) {
    if (!pid || !g.people.has(pid) || pid === rootId || generations < 2 || !room(ctx)) continue;
    const tree = ancestorTree(g, pid, generations - 1, ctx, new Set([rootId]));
    const side = layoutTree(tree, { ...opts, orientation });
    const top = side.boxes.find((b) => b.id === tree.id)!;
    const dx = orientation === 'right-left' ? -gapY - boxW - top.x : boxW + gapY - top.x;
    for (const b of side.boxes) boxes.push({ ...b, x: b.x + dx, y: b.y - top.y }); // roots line up with the person
    links.push(...side.links, { from: me.id, to: tree.id });
  }
  return frame(boxes, links, true, ctx);
}
