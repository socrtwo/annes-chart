// GEDCOM 5.5 / 5.5.1 / 7.0 reader. Tolerant: bad lines are reported as warnings, not fatal.

export interface GedLine {
  level: number;
  xref?: string;
  tag: string;
  value: string;
  children: GedLine[];
}

export interface GedEvent {
  date?: string;
  place?: string;
}

export type Where = 'INDI' | 'BIRT' | 'DEAT' | 'MARR';

export interface Citation {
  source: string;
  page?: string;
  where: Where;
}

export interface Source {
  id: string;
  title: string;
  author?: string;
}

export type Pedigree = 'birth' | 'adopted' | 'foster' | 'sealing' | 'other';

export interface Person {
  id: string;
  name: string;
  given: string;
  surname: string;
  sex: 'M' | 'F' | 'U';
  birth?: GedEvent;
  death?: GedEvent;
  famc: string[];
  fams: string[];
  /** How the person is linked to each parent family; a missing entry means birth. */
  pedigree?: Record<string, Pedigree>;
  citations?: Citation[];
}

export interface Family {
  id: string;
  husband?: string;
  wife?: string;
  children: string[];
  marriage?: GedEvent;
  divorced: boolean;
  citations?: Citation[];
}

export interface GedcomData {
  people: Map<string, Person>;
  families: Map<string, Family>;
  sources: Map<string, Source>;
  warnings: string[];
}

const LINE = /^\s*(\d+)\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?: (.*))?$/;

export function decodeGedcom(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  // Older exports declare ANSEL/ANSI/ASCII and are mostly Latin-1.
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
}

export function parseLines(text: string, warnings: string[] = []): GedLine[] {
  const roots: GedLine[] = [];
  const stack: GedLine[] = [];
  const rows = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  rows.forEach((raw, i) => {
    if (!raw.trim()) return;
    const m = LINE.exec(raw);
    if (!m) {
      warnings.push(`Line ${i + 1} is not valid GEDCOM and was skipped`);
      return;
    }
    const line: GedLine = { level: Number(m[1]), xref: m[2], tag: m[3].toUpperCase(), value: m[4] ?? '', children: [] };
    if (line.tag === 'CONC' || line.tag === 'CONT') {
      const parent = stack[line.level - 1];
      if (parent) parent.value += (line.tag === 'CONT' ? '\n' : '') + line.value;
      return;
    }
    stack.length = Math.min(stack.length, line.level);
    if (line.level === 0) roots.push(line);
    else if (stack[line.level - 1]) stack[line.level - 1].children.push(line);
    else {
      warnings.push(`Line ${i + 1} has no parent at level ${line.level - 1}`);
      return;
    }
    stack[line.level] = line;
  });
  return roots;
}

const child = (l: GedLine, tag: string) => l.children.find((c) => c.tag === tag);
const all = (l: GedLine, tag: string) => l.children.filter((c) => c.tag === tag);

function event(l: GedLine, tag: string): GedEvent | undefined {
  const e = child(l, tag);
  if (!e) return undefined;
  return { date: child(e, 'DATE')?.value.trim() || undefined, place: child(e, 'PLAC')?.value.trim() || undefined };
}

function pedigreeOf(v: string | undefined): Pedigree {
  const t = (v ?? '').trim().toLowerCase();
  return t === 'adopted' || t === 'foster' || t === 'sealing' ? t : t && t !== 'birth' ? 'other' : 'birth';
}

function splitName(raw: string): { given: string; surname: string } {
  const m = /^([^/]*)\/([^/]*)\/?\s*(.*)$/.exec(raw);
  if (!m) return { given: raw.trim(), surname: '' };
  return { given: `${m[1].trim()} ${m[3].trim()}`.trim(), surname: m[2].trim() };
}

function pedigrees(indi: GedLine): Record<string, Pedigree> {
  const out: Record<string, Pedigree> = {};
  for (const f of all(indi, 'FAMC')) out[f.value.trim()] = pedigreeOf(child(f, 'PEDI')?.value);
  // An ADOP event can also name the adopting family.
  for (const a of all(indi, 'ADOP')) {
    const f = child(a, 'FAMC');
    if (f) out[f.value.trim()] = 'adopted';
  }
  return out;
}

export function parseGedcom(input: string | Uint8Array): GedcomData {
  const warnings: string[] = [];
  const text = typeof input === 'string' ? input : decodeGedcom(input);
  const roots = parseLines(text, warnings);
  const people = new Map<string, Person>();
  const families = new Map<string, Family>();
  const sources = new Map<string, Source>();
  let inline = 0;

  for (const r of roots) {
    if (r.xref && r.tag === 'SOUR') {
      sources.set(r.xref, { id: r.xref, title: child(r, 'TITL')?.value.trim() || r.xref, author: child(r, 'AUTH')?.value.trim() || undefined });
    }
  }

  // Citations may point at a SOUR record or hold the source text inline.
  const cites = (l: GedLine | undefined, where: Where): Citation[] =>
    (l ? all(l, 'SOUR') : []).map((c) => {
      const v = c.value.trim();
      let id = v;
      if (!/^@[^@]+@$/.test(v)) {
        id = `inline:${++inline}`;
        sources.set(id, { id, title: v || 'Unnamed source' });
      } else if (!sources.has(v)) warnings.push(`Citation points at missing source ${v}`);
      return { source: id, page: child(c, 'PAGE')?.value.trim() || undefined, where };
    });

  for (const r of roots) {
    if (!r.xref) continue;
    if (r.tag === 'INDI') {
      const n = child(r, 'NAME');
      const split = n ? splitName(n.value) : { given: '', surname: '' };
      const given = (n && child(n, 'GIVN')?.value) || split.given;
      const surname = (n && child(n, 'SURN')?.value) || split.surname;
      const sex = child(r, 'SEX')?.value.trim().toUpperCase();
      people.set(r.xref, {
        id: r.xref,
        given,
        surname,
        name: `${given} ${surname}`.trim() || 'Unknown',
        sex: sex === 'M' || sex === 'F' ? sex : 'U',
        birth: event(r, 'BIRT') ?? event(r, 'CHR'),
        death: event(r, 'DEAT') ?? event(r, 'BURI'),
        famc: all(r, 'FAMC').map((x) => x.value.trim()),
        fams: all(r, 'FAMS').map((x) => x.value.trim()),
        pedigree: pedigrees(r),
        citations: [...cites(r, 'INDI'), ...cites(n, 'INDI'), ...cites(child(r, 'BIRT') ?? child(r, 'CHR'), 'BIRT'), ...cites(child(r, 'DEAT') ?? child(r, 'BURI'), 'DEAT')],
      });
    } else if (r.tag === 'FAM') {
      families.set(r.xref, {
        id: r.xref,
        husband: child(r, 'HUSB')?.value.trim() || undefined,
        wife: child(r, 'WIFE')?.value.trim() || undefined,
        children: all(r, 'CHIL').map((x) => x.value.trim()),
        marriage: event(r, 'MARR'),
        divorced: !!child(r, 'DIV'),
        citations: [...cites(r, 'INDI'), ...cites(child(r, 'MARR'), 'MARR')],
      });
    }
  }

  // Some files only record the link on one side; make both sides agree.
  for (const f of families.values()) {
    for (const c of f.children) {
      const p = people.get(c);
      if (!p) warnings.push(`${f.id} lists missing child ${c}`);
      else if (!p.famc.includes(f.id)) p.famc.push(f.id);
    }
    for (const s of [f.husband, f.wife]) {
      if (!s) continue;
      const p = people.get(s);
      if (!p) warnings.push(`${f.id} lists missing spouse ${s}`);
      else if (!p.fams.includes(f.id)) p.fams.push(f.id);
    }
  }
  return { people, families, sources, warnings };
}

export function lifeSpan(p: Person): string {
  const year = (e?: GedEvent) => /\d{3,4}/.exec(e?.date ?? '')?.[0];
  const b = year(p.birth);
  const d = year(p.death);
  if (!b && !d) return '';
  return `${b ?? '?'}–${d ?? (p.death ? '?' : '')}`;
}
