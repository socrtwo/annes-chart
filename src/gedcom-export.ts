import type { Family, GedcomData, GedEvent, GedLine, Person } from './gedcom';

/**
 * full:  every record and tag of the source file is written back (notes, sources, media, other
 *        events, custom tags). Needs `GedcomData.records`; falls back to basic without them.
 * basic: only what the charts use: names, sex, birth/baptism, death/burial, marriages, divorces
 *        and family links, as plain GEDCOM 5.5.1.
 */
export type GedcomExportMode = 'full' | 'basic';

const MAX_LINE = 200; // GEDCOM 5.5.1 allows 255 characters per line; stay well inside it

// Cuts a long value for CONC. No piece may start or end with a space: readers drop those.
function chunk(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_LINE) {
    let k = MAX_LINE;
    while (k > 1 && (rest[k - 1] === ' ' || rest[k] === ' ')) k--;
    if (k <= 1) k = MAX_LINE;
    out.push(rest.slice(0, k));
    rest = rest.slice(k);
  }
  out.push(rest);
  return out;
}

// One logical line. Line breaks in the value become CONT lines; over-long values become CONC
// lines, except in GEDCOM 7, which has no CONC.
function emit(out: string[], level: number, tag: string, value = '', xref?: string, conc = true): void {
  value.split(/\r\n|\r|\n/).forEach((part, i) => {
    (conc ? chunk(part) : [part]).forEach((piece, j) => {
      const first = i === 0 && j === 0;
      const head = first ? `${level}${xref ? ` ${xref}` : ''} ${tag}` : `${level + 1} ${j === 0 ? 'CONT' : 'CONC'}`;
      out.push(piece ? `${head} ${piece}` : head);
    });
  });
}

function emitTree(out: string[], l: GedLine, conc: boolean): void {
  emit(out, l.level, l.tag, l.value, l.xref, conc);
  for (const c of l.children) emitTree(out, c, conc);
}

const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();

function eventLines(out: string[], tag: string, e?: GedEvent): void {
  if (!e) return;
  const t = e.tag ?? tag;
  if (!e.date && !e.place) return emit(out, 1, t, 'Y'); // the event happened; nothing more is known
  emit(out, 1, t);
  if (e.date) emit(out, 2, 'DATE', oneLine(e.date));
  if (e.place) emit(out, 2, 'PLAC', oneLine(e.place));
}

function personLines(out: string[], p: Person): void {
  const part = (s: string) => oneLine(s).replace(/\//g, ' ');
  emit(out, 0, 'INDI', '', p.id);
  emit(out, 1, 'NAME', [part(p.given), `/${part(p.surname)}/`, part(p.suffix ?? '')].filter(Boolean).join(' '));
  if (p.sex !== 'U') emit(out, 1, 'SEX', p.sex);
  eventLines(out, 'BIRT', p.birth);
  eventLines(out, 'CHR', p.baptism);
  eventLines(out, 'DEAT', p.death);
  eventLines(out, 'BURI', p.burial);
  for (const f of p.famc) emit(out, 1, 'FAMC', f);
  for (const f of p.fams) emit(out, 1, 'FAMS', f);
}

function familyLines(out: string[], f: Family): void {
  emit(out, 0, 'FAM', '', f.id);
  if (f.husband) emit(out, 1, 'HUSB', f.husband);
  if (f.wife) emit(out, 1, 'WIFE', f.wife);
  for (const c of f.children) emit(out, 1, 'CHIL', c);
  eventLines(out, 'MARR', f.marriage);
  if (f.divorced) emit(out, 1, 'DIV', 'Y');
}

function basicHead(out: string[], g: GedcomData): void {
  let subm = '@SUBM@';
  while (g.people.has(subm) || g.families.has(subm)) subm = subm.replace(/@$/, '_@');
  out.push('0 HEAD', '1 SOUR Annes-Chart', "2 NAME Anne's Chart", `1 SUBM ${subm}`, '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8');
  out.push(`0 ${subm} SUBM`, '1 NAME Unknown');
}

function writeBasic(g: GedcomData): string[] {
  const out: string[] = [];
  basicHead(out, g);
  for (const p of g.people.values()) personLines(out, p);
  for (const f of g.families.values()) familyLines(out, f);
  return out;
}

const POINTER = /^@[^@\s]+@$/;
function pointersIn(l: GedLine, into: Set<string>): void {
  if (POINTER.test(l.value.trim())) into.add(l.value.trim());
  for (const c of l.children) pointersIn(c, into);
}

// Notes, sources and media that only privacy-filtered records point to are left out with them.
function orphanedByPrivacy(records: GedLine[], isPrivate: (r: GedLine) => boolean): Set<string> {
  const byId = new Map<string, GedLine>();
  for (const r of records) if (r.xref && r.tag !== 'INDI' && r.tag !== 'FAM') byId.set(r.xref, r);
  // Everything the private records lead to, directly or through another record (a source's repository).
  const reachable = new Set<string>();
  for (const r of records) if (isPrivate(r)) pointersIn(r, reachable);
  const candidates = new Map<string, GedLine>();
  for (const id of reachable) {
    const r = byId.get(id);
    if (!r || candidates.has(id)) continue;
    candidates.set(id, r);
    pointersIn(r, reachable); // a Set visits entries added while it is being iterated
  }
  const kept = new Set<string>();
  for (const r of records) if (!isPrivate(r) && !(r.xref && candidates.has(r.xref))) pointersIn(r, kept);
  const reached = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const [id, r] of candidates) {
      if (reached.has(id) || !kept.has(id)) continue;
      reached.add(id);
      pointersIn(r, kept);
      grew = true;
    }
  }
  return new Set([...candidates.keys()].filter((id) => !reached.has(id)));
}

function writeFull(g: GedcomData, records: GedLine[]): string[] {
  const out: string[] = [];
  const head = records.find((r) => r.tag === 'HEAD');
  const version = head?.children.find((c) => c.tag === 'GEDC')?.children.find((c) => c.tag === 'VERS')?.value.trim() ?? '';
  const v7 = /^7/.test(version);
  const isPrivate = (r: GedLine) =>
    !!r.xref && ((r.tag === 'INDI' && !!g.people.get(r.xref)?.private) || (r.tag === 'FAM' && !!g.families.get(r.xref)?.private));
  const dropped = records.some(isPrivate) ? orphanedByPrivacy(records, isPrivate) : new Set<string>();

  if (!head) basicHead(out, g);
  for (const r of records) {
    if (r.tag === 'TRLR' || (r.xref && dropped.has(r.xref))) continue;
    if (r === head) {
      // The text is written as UTF-8 whatever the source file used.
      const children = r.children.map((c) => (c.tag === 'CHAR' ? { ...c, value: 'UTF-8', children: [] } : c));
      if (!v7 && !children.some((c) => c.tag === 'CHAR')) children.push({ level: 1, tag: 'CHAR', value: 'UTF-8', children: [] });
      emitTree(out, { ...r, children }, !v7);
    } else if (isPrivate(r) && r.tag === 'INDI') personLines(out, g.people.get(r.xref!)!);
    else if (isPrivate(r)) familyLines(out, g.families.get(r.xref!)!);
    else emitTree(out, r, !v7);
  }
  return out;
}

export function writeGedcom(g: GedcomData, mode: GedcomExportMode = 'full'): string {
  const lines = mode === 'full' && g.records?.length ? writeFull(g, g.records) : writeBasic(g);
  lines.push('0 TRLR');
  return lines.join('\n') + '\n';
}
