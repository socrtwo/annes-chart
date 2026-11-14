import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom';
import { writeGedcom } from '../src/gedcom-export';
import { redactLiving } from '../src/privacy';

describe('gedcom export', () => {
  const g = parseGedcom(readFileSync('samples/family.ged', 'utf8'));

  it('loads the sample file', () => {
    expect(g.people.size).toBe(6);
    expect(g.families.size).toBe(2);
    expect(g.warnings).toEqual([]);
  });

  for (const mode of ['full', 'basic'] as const) {
    it(`round-trips people, families and events (${mode})`, () => {
      const back = parseGedcom(writeGedcom(g, mode));
      expect(back.warnings).toEqual([]);
      expect([...back.people.values()]).toEqual([...g.people.values()]);
      expect([...back.families.values()]).toEqual([...g.families.values()]);
    });
  }
});

const RICH = `0 HEAD
1 SOUR OtherApp
1 GEDC
2 VERS 5.5.1
1 CHAR ANSEL
0 @I1@ INDI
1 NAME Ann /Lee/ Sr.
2 NICK Annie
1 SEX F
1 CHR
2 DATE 3 MAR 1801
1 BURI
2 DATE 1870
2 PLAC Leeds
1 OCCU Miller
1 _CUSTOM kept
1 NOTE First line
2 CONT second line
1 SOUR @S1@
2 PAGE p. 4
1 FAMS @F1@
0 @I2@ INDI
1 NAME Bob /Lee/
1 DEAT Y
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 MARR
2 DATE 1820
1 EVEN
2 TYPE Census
0 @S1@ SOUR
1 TITL Parish register
0 @N1@ NOTE A shared note
0 TRLR`;

describe('complete export', () => {
  const g = parseGedcom(RICH);
  const out = writeGedcom(g, 'full');

  it('keeps every record and tag of the source file', () => {
    for (const line of RICH.split('\n')) if (!line.includes('CHAR')) expect(out.split('\n'), line).toContain(line);
    expect(parseGedcom(out).warnings).toEqual([]);
  });
  it('is stable when exported again', () => {
    expect(writeGedcom(parseGedcom(out), 'full')).toBe(out);
  });
  it('declares UTF-8, which is what it writes', () => {
    expect(out).toContain('1 CHAR UTF-8');
    expect(out).not.toContain('ANSEL');
  });
  it('is the default, and falls back to basic when the source records are not available', () => {
    expect(writeGedcom(g)).toBe(out);
    expect(writeGedcom({ ...g, records: undefined })).toBe(writeGedcom(g, 'basic'));
  });
  it('adds a header and trailer to a file that had none', () => {
    const bare = writeGedcom(parseGedcom('0 @I1@ INDI\n1 NAME A /B/\n1 OCCU Smith\n'), 'full');
    expect(bare.startsWith('0 HEAD\n')).toBe(true);
    expect(bare).toContain('1 OCCU Smith');
    expect(bare.endsWith('0 TRLR\n')).toBe(true);
  });
});

describe('basic export', () => {
  const out = writeGedcom(parseGedcom(RICH), 'basic');

  it('writes the core facts without changing what kind of event they are', () => {
    expect(out).toContain('1 NAME Ann /Lee/ Sr.');
    expect(out).toContain('1 CHR\n2 DATE 3 MAR 1801');
    expect(out).toContain('1 BURI\n2 DATE 1870\n2 PLAC Leeds');
    expect(out).toContain('1 DEAT Y');
    expect(out).toContain('1 MARR\n2 DATE 1820');
    expect(out).not.toMatch(/1 BIRT|1 DEAT\n/);
  });
  it('leaves out everything else', () => {
    expect(out).not.toMatch(/OCCU|NOTE|_CUSTOM|NICK|Parish|EVEN/);
  });
  it('has the header a GEDCOM 5.5.1 reader requires', () => {
    expect(out).toMatch(/^0 HEAD\n1 SOUR Annes-Chart\n[\s\S]*1 SUBM @SUBM@\n1 GEDC\n2 VERS 5\.5\.1\n2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n0 @SUBM@ SUBM\n/);
  });
});

describe('long and multi-line values', () => {
  const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
  const src = `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME A /B/\n1 BIRT\n2 PLAC Leeds\n3 CONT Yorkshire\n1 NOTE ${long}\n2 CONT \n2 CONT last\n0 TRLR\n`;

  it('writes line breaks as CONT and long lines as CONC', () => {
    const out = writeGedcom(parseGedcom(src), 'full');
    expect(out).toContain('2 PLAC Leeds\n3 CONT Yorkshire');
    expect(out).toContain('2 CONC ');
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(255);
    const back = parseGedcom(out);
    expect(back.warnings).toEqual([]);
    expect(back.records!.slice(1)).toEqual(parseGedcom(src).records!.slice(1)); // all but the header, which gained CHAR
  });
  it('flattens a multi-line place in a basic export instead of writing a broken line', () => {
    const out = writeGedcom(parseGedcom(src), 'basic');
    expect(out).toContain('2 PLAC Leeds Yorkshire');
    expect(parseGedcom(out).warnings).toEqual([]);
  });
  it('does not use CONC or add CHAR in GEDCOM 7', () => {
    const out = writeGedcom(parseGedcom(src.replace('5.5.1', '7.0')), 'full');
    expect(out).not.toMatch(/CONC|CHAR/);
    expect(out).toContain(`1 NOTE ${long}\n2 CONT\n2 CONT last`);
  });
});

describe('complete export with living people hidden', () => {
  const src = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @OLD@ INDI
1 NAME Old /Timer/
1 DEAT
2 DATE 1900
1 SOUR @S1@
1 FAMS @F1@
0 @NEW@ INDI
1 NAME Secret /Person/
1 BIRT
2 DATE 1990
1 NOTE private note text
1 SOUR @S2@
1 OBJE @M1@
1 FAMC @F1@
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @OLD@
1 CHIL @NEW@
1 MARR
2 DATE 1880
0 @F2@ FAM
1 HUSB @NEW@
1 MARR
2 DATE 5 MAY 2015
2 PLAC Hidden Town
0 @S1@ SOUR
1 TITL Old register
0 @S2@ SOUR
1 TITL Modern certificate
1 REPO @R1@
0 @R1@ REPO
1 NAME Records office
0 @M1@ OBJE
1 FILE secret.jpg
0 TRLR`;
  const out = writeGedcom(redactLiving(parseGedcom(src), 2026), 'full');

  it('reduces living people and their marriages to bare links', () => {
    expect(out).toContain('0 @NEW@ INDI\n1 NAME Living //\n1 FAMC @F1@\n1 FAMS @F2@');
    expect(out).toContain('0 @F2@ FAM\n1 HUSB @NEW@\n0 ');
    expect(out).not.toMatch(/Secret|1990|private note|2015|Hidden Town/);
  });
  it('drops records that only living people point to, and keeps the rest', () => {
    expect(out).not.toMatch(/Modern certificate|Records office|secret\.jpg/);
    expect(out).toContain('1 TITL Old register');
    expect(out).toContain('1 NAME Old /Timer/');
    expect(out).toContain('2 DATE 1880');
    expect(parseGedcom(out).warnings).toEqual([]);
  });
});
