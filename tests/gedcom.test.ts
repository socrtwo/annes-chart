import { describe, expect, it } from 'vitest';
import { decodeGedcom, lifeSpan, parseGedcom } from '../src/gedcom';
import { ancestorTree, descendantTree } from '../src/layout';

const enc = (s: string) => new TextEncoder().encode(s);

describe('gedcom reader details', () => {
  it('accepts a tab between tag and value, and a trailing tab', () => {
    const g = parseGedcom('0 @I1@ INDI\n1 NAME\tJohn /Smith/\n1 BIRT\t\n2 DATE 1900\n');
    expect(g.warnings).toEqual([]);
    expect(g.people.get('@I1@')).toMatchObject({ name: 'John Smith', birth: { date: '1900' } });
  });

  it('treats GEDCOM 7 @VOID@ pointers as absent', () => {
    const g = parseGedcom('0 @I1@ INDI\n1 NAME A /B/\n1 FAMS @F1@\n0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @VOID@\n1 CHIL @VOID@\n');
    expect(g.warnings).toEqual([]);
    expect(g.families.get('@F1@')).toMatchObject({ husband: '@I1@', wife: undefined, children: [] });
  });

  it('repairs links recorded only on the person', () => {
    const g = parseGedcom('0 @P@ INDI\n1 NAME Pa /X/\n1 SEX M\n1 FAMS @F@\n0 @W@ INDI\n1 NAME Ma /X/\n1 SEX F\n1 FAMS @F@\n0 @K@ INDI\n1 NAME Kid /X/\n1 FAMC @F@\n0 @F@ FAM\n');
    expect(g.warnings).toEqual([]);
    expect(g.families.get('@F@')).toMatchObject({ husband: '@P@', wife: '@W@', children: ['@K@'] });
    expect(ancestorTree(g, '@K@').children.map((c) => c.label)).toEqual(['Pa X', 'Ma X']);
    expect(descendantTree(g, '@P@').children[0].children.map((c) => c.label)).toEqual(['Kid X']);
  });

  it('warns about links to families that do not exist', () => {
    expect(parseGedcom('0 @K@ INDI\n1 FAMC @NOPE@\n').warnings).toEqual(['@K@ is a child of missing family @NOPE@']);
  });

  it('keeps birth and baptism apart and uses the baptism year when the birth has none', () => {
    const p = parseGedcom('0 @I1@ INDI\n1 NAME A /B/\n1 BIRT\n2 PLAC Leeds\n1 CHR\n2 DATE 3 MAR 1801\n1 BURI\n2 DATE 1870\n').people.get('@I1@')!;
    expect(p.birth).toEqual({ date: undefined, place: 'Leeds' });
    expect(p.baptism).toEqual({ date: '3 MAR 1801', place: undefined, tag: 'CHR' });
    expect(p.death).toBeUndefined();
    expect(p.burial).toMatchObject({ date: '1870', tag: 'BURI' });
    expect(lifeSpan(p)).toBe('1801–1870');
  });

  it('keeps a name suffix after the surname', () => {
    expect(parseGedcom('0 @I1@ INDI\n1 NAME John /Smith/ Jr.\n').people.get('@I1@')).toMatchObject({ given: 'John', surname: 'Smith', suffix: 'Jr.', name: 'John Smith Jr.' });
  });

  it('keeps both partners of a family with two HUSB lines', () => {
    const f = parseGedcom('0 @A@ INDI\n0 @B@ INDI\n0 @F@ FAM\n1 HUSB @A@\n1 HUSB @B@\n').families.get('@F@')!;
    expect([f.husband, f.wife]).toEqual(['@A@', '@B@']);
  });
});

describe('gedcom decoding', () => {
  it('keeps valid UTF-8 that happens to contain U+FFFD', () => {
    expect(parseGedcom(enc('0 @I1@ INDI\n1 NAME José /Peña/\n1 NOTE bad � char\n')).people.get('@I1@')?.name).toBe('José Peña');
  });
  it('decodes ANSEL, where the accent comes before its letter', () => {
    const bytes = new Uint8Array([...enc('0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Jos'), 0xe2, 0x65, ...enc(' /Pe'), 0xe4, 0x6e, ...enc('a/ '), 0xb2, 0x0a]);
    expect(parseGedcom(bytes).people.get('@I1@')?.name).toBe('José Peña ø');
  });
  it('reads UTF-16 with or without a byte-order mark', () => {
    const text = '0 @I1@ INDI\n1 NAME Zoë /B/\n';
    const le = new Uint8Array(text.length * 2);
    [...text].forEach((c, i) => (le[i * 2] = c.charCodeAt(0)));
    expect(decodeGedcom(le)).toBe(text);
    expect(decodeGedcom(new Uint8Array([0xff, 0xfe, ...le]))).toBe(text);
  });
});
