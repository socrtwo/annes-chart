import { lifeSpan, type GedcomData, type Person } from './gedcom';

export interface TreeSource {
  id: string;
  label: string;
  sublabel?: string;
  kind?: string;
  photo?: string;
  children: TreeSource[];
}

export interface Box {
  id: string;
  label: string;
  sublabel?: string;
  kind?: string;
  photo?: string;
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
}

export interface Chart {
  boxes: Box[];
  links: Link[];
  width: number;
  height: number;
  horizontal: boolean;
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
    const kids = n.children.filter((c) => !seen.has(c.id));
    const centers = kids.map((c) => place(c, depth + 1));
    const sib = centers.length ? (centers[0] + centers[centers.length - 1]) / 2 : next++ * slot;
    for (const c of kids) links.push({ from: n.id, to: c.id });
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
      label: n.label,
      sublabel: n.sublabel,
      kind: n.kind,
      photo: n.photo,
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
  photo?: string;
}

// Several roots (or a cycle) still show: extra roots hang under a synthetic top box.
export function orgToTree(rows: OrgRow[]): TreeSource {
  const nodes = new Map<string, TreeSource>();
  for (const r of rows) nodes.set(r.id, { id: r.id, label: r.name || 'Vacant', sublabel: r.title, photo: r.photo, kind: !r.name ? 'vacant' : r.assistant ? 'assistant' : undefined, children: [] });
  const roots: TreeSource[] = [];
  for (const r of rows) {
    const me = nodes.get(r.id)!;
    const parent = r.manager ? nodes.get(r.manager) : undefined;
    if (parent && parent !== me) {
      if (r.assistant) parent.children.unshift(me);
      else parent.children.push(me);
    }
    else roots.push(me);
  }
  if (!roots.length && rows.length) roots.push(nodes.get(rows[0].id)!);
  return roots.length === 1 ? roots[0] : { id: '__root__', label: 'Organization', kind: 'group', children: roots };
}

export function parseOrgCsv(text: string): OrgRow[] {
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
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
  }
  endRow();
  if (!table.length) return [];
  const head = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const id = col('id', 'employee id', 'employeeid');
  const name = col('name', 'employee', 'full name');
  const title = col('title', 'job title', 'position', 'role');
  const pho = col('photo', 'picture', 'image', 'photo url');
  const typ = col('type', 'position type', 'assistant');
  const dot = col('dotted', 'dotted line', 'dotted manager', 'dotted line manager');
  const mgr = col('manager', 'manager id', 'managerid', 'reports to', 'supervisor', 'parent');
  if (name < 0) throw new Error('CSV needs a Name column (and optionally ID, Title, Manager)');
  return table.slice(1).map((r) => ({
    id: (id >= 0 ? r[id] : r[name]).trim(),
    name: (r[name] ?? '').trim(),
    title: title >= 0 ? r[title]?.trim() || undefined : undefined,
    manager: mgr >= 0 ? r[mgr]?.trim() || undefined : undefined,
    assistant: typ >= 0 ? /^(assistant|asst|y|yes|true|1)$/i.test(r[typ]?.trim() ?? '') : undefined,
    photo: pho >= 0 ? r[pho]?.trim() || undefined : undefined,
    dotted: dot >= 0 ? r[dot]?.trim() || undefined : undefined,
  }));
}

export type GenealogyKind = 'descendants' | 'ancestors' | 'hourglass' | 'bowtie';

export interface GenealogyOptions extends LayoutOptions {
  /** Which parents to follow upward: birth parents (default) or adoptive/foster parents when there are any. */
  parents?: 'birth' | 'adoptive';
}

export function parentFamily(g: GedcomData, p: Person, pref: 'birth' | 'adoptive' = 'birth') {
  const isBirth = (f: string) => (p.pedigree?.[f] ?? 'birth') === 'birth';
  const ids = p.famc.filter((f) => g.families.has(f));
  const pick = pref === 'adoptive' ? (ids.find((f) => !isBirth(f)) ?? ids[0]) : (ids.find(isBirth) ?? ids[0]);
  return pick ? g.families.get(pick) : undefined;
}

function personNode(g: GedcomData, id: string, note?: string): TreeSource {
  const p = g.people.get(id)!;
  const parts = [lifeSpan(p), note, p.citations?.length ? `${p.citations.length} src` : ''].filter(Boolean);
  return { id, label: p.name, sublabel: parts.join(' · '), kind: p.sex === 'M' ? 'male' : p.sex === 'F' ? 'female' : 'unknown', children: [] };
}

// Pedigree: the person at the root, parents as its children, up to `generations`.
export function ancestorTree(g: GedcomData, id: string, generations = 5, seen = new Set<string>(), pref: 'birth' | 'adoptive' = 'birth'): TreeSource {
  const node = personNode(g, id);
  seen.add(id);
  if (generations <= 1) return node;
  const fam = parentFamily(g, g.people.get(id)!, pref);
  for (const pid of [fam?.husband, fam?.wife]) {
    if (pid && g.people.has(pid) && !seen.has(pid)) node.children.push(ancestorTree(g, pid, generations - 1, seen, pref));
  }
  return node;
}

// Descendants: a person, then each marriage as a node, then that marriage's children.
export function descendantTree(g: GedcomData, id: string, generations = 5, seen = new Set<string>()): TreeSource {
  const node = personNode(g, id);
  seen.add(id);
  if (generations <= 1) return node;
  const marriageYear = (fid: string) => Number(/\d{3,4}/.exec(g.families.get(fid)?.marriage?.date ?? '')?.[0] ?? Infinity);
  // Multiple marriages appear in date order; marriages without a date keep their file order at the end.
  const fams = g.people.get(id)!.fams.map((f, i) => ({ f, i })).sort((a, b) => marriageYear(a.f) - marriageYear(b.f) || a.i - b.i).map((x) => x.f);
  for (const fid of fams) {
    const fam = g.families.get(fid);
    if (!fam) continue;
    const spouseId = fam.husband === id ? fam.wife : fam.husband;
    const marriage: TreeSource = {
      id: `${id}+${fid}`,
      label: spouseId && g.people.has(spouseId) ? `⚭ ${g.people.get(spouseId)!.name}` : '⚭ Unknown partner',
      sublabel: [fam.marriage?.date ? `m. ${fam.marriage.date}` : '', fam.divorced ? 'divorced' : ''].filter(Boolean).join(' · '),
      kind: 'family',
      children: [],
    };
    for (const cid of fam.children) {
      if (!g.people.has(cid) || seen.has(cid)) continue;
      const kid = descendantTree(g, cid, generations - 1, seen);
      const ped = g.people.get(cid)!.pedigree?.[fid];
      if (ped && ped !== 'birth') kid.sublabel = [kid.sublabel, ped].filter(Boolean).join(' · ');
      marriage.children.push(kid);
    }
    node.children.push(marriage);
  }
  return node;
}

export function genealogyChart(g: GedcomData, kind: GenealogyKind, rootId: string, generations: number, opts: GenealogyOptions = {}): Chart {
  const pref = opts.parents ?? 'birth';
  if (!g.people.has(rootId)) throw new Error(`Unknown person ${rootId}`);
  if (kind === 'ancestors') return layoutTree(ancestorTree(g, rootId, generations, new Set(), pref), { orientation: 'right-left', ...opts });
  if (kind === 'descendants') return layoutTree(descendantTree(g, rootId, generations), opts);
  if (kind === 'bowtie') return bowtieChart(g, rootId, generations, opts, pref);
  // Hourglass: ancestors above, descendants below, joined at the root box.
  const up = layoutTree(ancestorTree(g, rootId, generations, new Set(), pref), { ...opts, orientation: 'bottom-up' });
  const down = layoutTree(descendantTree(g, rootId, generations), { ...opts, orientation: 'top-down' });
  const rootUp = up.boxes.find((b) => b.id === rootId)!;
  const rootDown = down.boxes.find((b) => b.id === rootId)!;
  const dx = rootUp.x - rootDown.x;
  const dy = rootUp.y - rootDown.y;
  const boxes = [...up.boxes, ...down.boxes.filter((b) => b.id !== rootId).map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }))];
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  for (const b of boxes) {
    b.x -= minX;
    b.y -= minY;
  }
  return {
    boxes,
    links: [...up.links, ...down.links],
    width: Math.max(...boxes.map((b) => b.x + b.w)),
    height: Math.max(...boxes.map((b) => b.y + b.h)),
    horizontal: false,
  };
}

// Bowtie: the person in the middle, father's ancestors extending left, mother's extending right.
function bowtieChart(g: GedcomData, rootId: string, generations: number, opts: LayoutOptions, pref: 'birth' | 'adoptive' = 'birth'): Chart {
  const { boxW = 160, boxH = 56, gapY = 48 } = opts;
  const me = personNode(g, rootId);
  const fam = parentFamily(g, g.people.get(rootId)!, pref);
  const boxes: Box[] = [{ id: rootId, label: me.label, sublabel: me.sublabel, kind: me.kind, x: 0, y: 0, w: boxW, h: boxH }];
  const links: Link[] = [];
  const sides: [string | undefined, Orientation, string][] = [
    [fam?.husband, 'right-left', ''],
    [fam?.wife, 'left-right', 'M:'],
  ];
  for (const [pid, orientation, prefix] of sides) {
    if (!pid || !g.people.has(pid) || generations < 2) continue;
    const side = layoutTree(ancestorTree(g, pid, generations - 1, new Set(), pref), { ...opts, orientation });
    const top = side.boxes.find((b) => b.id === pid)!;
    const dx = orientation === 'right-left' ? -gapY - boxW - top.x : boxW + gapY - top.x;
    for (const b of side.boxes) boxes.push({ ...b, id: prefix + b.id, x: b.x + dx, y: b.y - top.y }); // roots line up with the person
    for (const l of side.links) links.push({ from: prefix + l.from, to: prefix + l.to });
    links.push({ from: rootId, to: prefix + pid });
  }
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  for (const b of boxes) {
    b.x -= minX;
    b.y -= minY;
  }
  return {
    boxes,
    links,
    width: Math.max(...boxes.map((b) => b.x + b.w)),
    height: Math.max(...boxes.map((b) => b.y + b.h)),
    horizontal: true,
  };
}
