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
  /** Source tag when it is not the default for the field: CHR/BAPM for a baptism, BURI/CREM for a burial. */
  tag?: string;
}

export interface Person {
  id: string;
  name: string;
  given: string;
  surname: string;
  /** Name suffix written after the surname, as in "John /Smith/ Jr." */
  suffix?: string;
  sex: 'M' | 'F' | 'U';
  birth?: GedEvent;
  /** Christening or baptism; stands in for a missing birth date. */
  baptism?: GedEvent;
  death?: GedEvent;
  /** Burial or cremation; stands in for a missing death. */
  burial?: GedEvent;
  famc: string[];
  fams: string[];
  /** Set by the privacy filter: this person's details were removed. */
  private?: boolean;
}

export interface Family {
  id: string;
  husband?: string;
  wife?: string;
  children: string[];
  marriage?: GedEvent;
  divorced: boolean;
  /** Set by the privacy filter: this family's events were removed. */
  private?: boolean;
}

export interface GedcomData {
  people: Map<string, Person>;
  families: Map<string, Family>;
  warnings: string[];
  /** Every record of the source file, in order, so an export can keep what the model does not hold. */
  records?: GedLine[];
}

const LINE = /^\s*(\d+)\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:[ \t](.*))?$/;
const VOID = '@VOID@'; // GEDCOM 7: a pointer that deliberately points nowhere

// ANSEL (ANSI Z39.47), the default character set of GEDCOM 5.5. Diacritics are
// separate bytes written BEFORE the letter they modify.
const ANSEL_CHARS: Record<number, string> = {
  0xa1: 'Ł', 0xa2: 'Ø', 0xa3: 'Đ', 0xa4: 'Þ', 0xa5: 'Æ', 0xa6: 'Œ', 0xa7: 'ʹ', 0xa8: '·', 0xa9: '♭', 0xaa: '®', 0xab: '±',
  0xac: 'Ơ', 0xad: 'Ư', 0xae: 'ʼ', 0xb0: 'ʻ', 0xb1: 'ł', 0xb2: 'ø', 0xb3: 'đ', 0xb4: 'þ', 0xb5: 'æ', 0xb6: 'œ', 0xb7: 'ʺ',
  0xb8: 'ı', 0xb9: '£', 0xba: 'ð', 0xbc: 'ơ', 0xbd: 'ư', 0xc0: '°', 0xc1: 'ℓ', 0xc2: '℗', 0xc3: '©', 0xc4: '♯', 0xc5: '¿',
  0xc6: '¡', 0xcf: 'ß',
};
const ANSEL_MARKS: Record<number, number> = {
  0xe0: 0x309, 0xe1: 0x300, 0xe2: 0x301, 0xe3: 0x302, 0xe4: 0x303, 0xe5: 0x304, 0xe6: 0x306, 0xe7: 0x307, 0xe8: 0x308,
  0xe9: 0x30c, 0xea: 0x30a, 0xeb: 0xfe20, 0xec: 0xfe21, 0xed: 0x315, 0xee: 0x30b, 0xef: 0x310, 0xf0: 0x327, 0xf1: 0x328,
  0xf2: 0x323, 0xf3: 0x324, 0xf4: 0x325, 0xf5: 0x333, 0xf6: 0x332, 0xf7: 0x326, 0xf8: 0x31c, 0xf9: 0x32e, 0xfa: 0xfe22,
  0xfb: 0xfe23, 0xfe: 0x313,
};

export function decodeAnsel(bytes: Uint8Array): string {
  let out = '';
  let marks = '';
  for (const b of bytes) {
    if (ANSEL_MARKS[b] !== undefined) {
      marks += String.fromCodePoint(ANSEL_MARKS[b]);
      continue;
    }
    out += (b < 0x80 ? String.fromCharCode(b) : (ANSEL_CHARS[b] ?? '�')) + marks;
    marks = '';
  }
  return (out + marks).normalize('NFC');
}

// Decodes a text file of unknown encoding: BOM, UTF-16 without a BOM, strict UTF-8, then Windows-1252.
export function decodeText(bytes: Uint8Array, fallback: (b: Uint8Array) => string = (b) => new TextDecoder('windows-1252').decode(b)): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes.length >= 4 && bytes[0] !== 0 && bytes[1] === 0 && bytes[2] !== 0 && bytes[3] === 0) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] !== 0 && bytes[2] === 0 && bytes[3] !== 0) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fallback(bytes);
  }
}

// Bytes that are not valid UTF-8 are read as the header says: ANSEL, or else Windows-1252
// (which covers the ANSI, ASCII and Latin-1 files older programs wrote).
export function decodeGedcom(bytes: Uint8Array): string {
  return decodeText(bytes, (b) => {
    const head = new TextDecoder('windows-1252').decode(b.subarray(0, 4096));
    return /^\s*1\s+CHAR\s+ANSEL\b/im.test(head) ? decodeAnsel(b) : new TextDecoder('windows-1252').decode(b);
  });
}

export function parseLines(text: string, warnings: string[] = []): GedLine[] {
  const roots: GedLine[] = [];
  const stack: GedLine[] = [];
  const rows = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
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
const pointers = (l: GedLine, tag: string) => all(l, tag).map((x) => x.value.trim()).filter((v) => v && v !== VOID);

// The first of `tags` that has a date, else the first that is present at all.
function event(l: GedLine, tags: string[], primary: string): GedEvent | undefined {
  const found = tags.flatMap((t) => all(l, t));
  const e = found.find((x) => child(x, 'DATE')?.value.trim()) ?? found[0];
  if (!e) return undefined;
  const out: GedEvent = { date: child(e, 'DATE')?.value.trim() || undefined, place: child(e, 'PLAC')?.value.trim() || undefined };
  if (e.tag !== primary) out.tag = e.tag;
  return out;
}

function splitName(raw: string): { given: string; surname: string; suffix: string } {
  const m = /^([^/]*)\/([^/]*)\/?\s*(.*)$/.exec(raw);
  if (!m) return { given: raw.trim(), surname: '', suffix: '' };
  return { given: m[1].trim(), surname: m[2].trim(), suffix: m[3].trim() };
}

export const fullName = (given: string, surname: string, suffix?: string) => [given, surname, suffix].filter(Boolean).join(' ') || 'Unknown';

export function parseGedcom(input: string | Uint8Array): GedcomData {
  const warnings: string[] = [];
  const text = typeof input === 'string' ? input : decodeGedcom(input);
  const records = parseLines(text, warnings);
  const people = new Map<string, Person>();
  const families = new Map<string, Family>();

  for (const r of records) {
    if (!r.xref) continue;
    if (r.tag === 'INDI') {
      if (people.has(r.xref)) warnings.push(`Person ${r.xref} appears more than once; the last record is used`);
      const n = child(r, 'NAME');
      const split = n ? splitName(n.value) : { given: '', surname: '', suffix: '' };
      const given = (n && child(n, 'GIVN')?.value.trim()) || split.given;
      const surname = (n && child(n, 'SURN')?.value.trim()) || split.surname;
      const suffix = (n && child(n, 'NSFX')?.value.trim()) || split.suffix;
      const sex = child(r, 'SEX')?.value.trim().toUpperCase();
      const p: Person = {
        id: r.xref,
        given,
        surname,
        name: fullName(given, surname, suffix),
        sex: sex === 'M' || sex === 'F' ? sex : 'U',
        birth: event(r, ['BIRT'], 'BIRT'),
        baptism: event(r, ['CHR', 'BAPM'], ''),
        death: event(r, ['DEAT'], 'DEAT'),
        burial: event(r, ['BURI', 'CREM'], ''),
        famc: pointers(r, 'FAMC'),
        fams: pointers(r, 'FAMS'),
      };
      if (suffix) p.suffix = suffix;
      people.set(r.xref, p);
    } else if (r.tag === 'FAM') {
      if (families.has(r.xref)) warnings.push(`Family ${r.xref} appears more than once; the last record is used`);
      const husbands = pointers(r, 'HUSB');
      const wives = pointers(r, 'WIFE');
      // Two HUSB or two WIFE lines (a same-sex couple in older files): keep both partners.
      const husband = husbands[0] ?? wives[1];
      const wife = wives[0] ?? husbands[1];
      families.set(r.xref, {
        id: r.xref,
        husband,
        wife,
        children: [...new Set(pointers(r, 'CHIL'))],
        marriage: event(r, ['MARR'], 'MARR'),
        divorced: !!child(r, 'DIV'),
      });
    }
  }

  // Some files only record a link on one side; make both sides agree.
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
  for (const p of people.values()) {
    for (const id of p.famc) {
      const f = families.get(id);
      if (!f) warnings.push(`${p.id} is a child of missing family ${id}`);
      else if (!f.children.includes(p.id)) f.children.push(p.id);
    }
    for (const id of p.fams) {
      const f = families.get(id);
      if (!f) warnings.push(`${p.id} is a spouse in missing family ${id}`);
      else if (f.husband !== p.id && f.wife !== p.id) {
        if (!f.husband && (p.sex !== 'F' || f.wife)) f.husband = p.id;
        else if (!f.wife) f.wife = p.id;
        else warnings.push(`${p.id} is a spouse in ${id}, which already has two partners`);
      }
    }
  }
  return { people, families, warnings, records };
}

export const eventYear = (e?: GedEvent) => {
  const m = /\d{3,4}/.exec(e?.date ?? '');
  return m ? Number(m[0]) : undefined;
};

export function lifeSpan(p: Person): string {
  const b = eventYear(p.birth) ?? eventYear(p.baptism);
  const d = eventYear(p.death) ?? eventYear(p.burial);
  if (!b && !d) return '';
  return `${b ?? '?'}–${d ?? (p.death || p.burial ? '?' : '')}`;
}
