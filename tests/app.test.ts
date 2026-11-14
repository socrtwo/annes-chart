import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clampGenerations, createApp, draw, exportGedcom, openDocument, personOptions, PROMPT } from '../src/app';

const enc = (s: string) => new TextEncoder().encode(s);
const sample = new Uint8Array(readFileSync('samples/family.ged'));

async function opened() {
  const bus = createApp();
  bus.execute('doc.open', await openDocument('family.ged', sample));
  return bus;
}

describe('opening files', () => {
  it('starts with a prompt and nothing drawn', () => {
    expect(draw(createApp().state)).toEqual({ svg: '', note: PROMPT, warnings: [] });
  });
  it('opens a GEDCOM and selects the first person in the file', async () => {
    const bus = await opened();
    expect(bus.state.person).toBe('@I1@');
    const out = draw(bus.state);
    expect(out.note).toBe('6 people, 2 families');
    expect(out.svg).toContain('George Hartwell');
  });
  it('rejects a file with no people instead of silently keeping the old chart', async () => {
    await expect(openDocument('notes.ged', enc('this is not a gedcom file\njust text\n'))).rejects.toThrow(/No people found in notes\.ged/);
  });
  it('rejects an org file with no Name column or no rows', async () => {
    await expect(openDocument('bad.csv', enc('foo,bar\n1,2\n'))).rejects.toThrow(/No Name column/);
    await expect(openDocument('empty.csv', enc('ID,Name\n'))).rejects.toThrow(/no people/);
  });
  it('reads a Windows-1252 CSV as saved by older spreadsheet programs', async () => {
    const doc = await openDocument('latin1.csv', new Uint8Array([...enc('ID,Name\n1,Jos'), 0xe9, ...enc(' Pe'), 0xf1, ...enc('a\n')]));
    expect(doc).toMatchObject({ type: 'org', rows: [{ name: 'José Peña' }] });
  });
  it('reports org warnings and counts vacancies separately', async () => {
    const bus = createApp();
    bus.execute('doc.open', await openDocument('org.csv', enc('ID,Name,Title,Manager\n1,Jane,CEO,\n2,,Open role,1\n3,Bob,Dev,77\n')));
    const out = draw(bus.state);
    expect(out.note).toBe('2 people and 1 vacant position in the org chart');
    expect(out.warnings).toHaveLength(1);
  });
});

describe('view commands', () => {
  it('keeps generations a whole number from 1 to 20', () => {
    expect([2.7, 0, -3, 99, '', 'abc', '7'].map(clampGenerations)).toEqual([2, 1, 1, 20, 5, 5, 7]);
  });
  it('changes the view, ignores no-ops and unknown people, and undoes', async () => {
    const bus = await opened();
    expect(bus.execute('view.set', { kind: 'fan', generations: 3.9 })).toBe(true);
    expect(bus.state).toMatchObject({ kind: 'fan', generations: 3 });
    expect(bus.execute('view.set', { kind: 'fan' })).toBe(false);
    expect(bus.execute('view.set', { person: '@nobody@' })).toBe(false);
    expect(bus.execute('view.set', { person: '@I6@' })).toBe(true);
    bus.undo();
    expect(bus.state.person).toBe('@I1@');
    bus.undo();
    expect(bus.state.kind).toBe('descendants');
    bus.undo();
    expect(bus.state.doc).toBeUndefined();
    bus.redo();
    expect(bus.state.doc?.name).toBe('family.ged');
  });
  it('draws every chart kind and notes the fan chart limit', async () => {
    const bus = await opened();
    bus.execute('view.set', { person: '@I6@' });
    for (const kind of ['descendants', 'ancestors', 'hourglass', 'bowtie', 'fan'] as const) {
      bus.execute('view.set', { kind });
      expect(draw(bus.state).svg, kind).toContain('<svg');
    }
    bus.execute('view.set', { generations: 12 });
    expect(draw(bus.state).note).toMatch(/at most 9 generations/);
  });
});

describe('person list', () => {
  it('is sorted by surname then given name, with dates', async () => {
    const bus = await opened();
    expect(personOptions(bus.state).map((o) => o.label)).toEqual([
      'Hartwell, George (1902–1968)',
      'Hartwell, Paul (1957–)',
      'Hartwell, Ruth (1933–)',
      'Hartwell, Walter (1930–)',
      'Marsh, Edith (1905–)',
      'Quinn, Nora (1932–)',
    ]);
  });
  it('tells hidden living people apart by record id', async () => {
    const bus = await opened();
    bus.execute('view.set', { hideLiving: true });
    const labels = personOptions(bus.state).map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.filter((l) => l.startsWith('Living ('))).not.toHaveLength(0);
    expect(labels.join()).not.toMatch(/Walter|Paul|Ruth|Nora/);
  });
});

describe('gedcom export from the app', () => {
  it('offers a complete and a basic export', async () => {
    const bus = createApp();
    bus.execute('doc.open', await openDocument('My Tree.ged', enc('0 HEAD\n0 @I1@ INDI\n1 NAME A /B/\n1 DEAT Y\n1 OCCU Miller\n0 TRLR\n')));
    expect(exportGedcom(bus.state, 'full')).toMatchObject({ name: 'My Tree.ged', text: expect.stringContaining('1 OCCU Miller') });
    const basic = exportGedcom(bus.state, 'basic')!;
    expect(basic.text).not.toContain('OCCU');
    expect(basic.name).toBe('My Tree-basic.ged');
    expect(basic.note).toMatch(/^Saved My Tree-basic\.ged \(basic: /);
  });
  it('exports what is on screen when living people are hidden', async () => {
    const bus = await opened();
    bus.execute('view.set', { hideLiving: true });
    const out = exportGedcom(bus.state, 'full')!;
    expect(out.name).toBe('family-living-hidden.ged');
    expect(out.note).toMatch(/living people and their marriages are reduced/);
    expect(out.text).not.toMatch(/Walter|Paul|1957/);
    expect(out.text).toContain('George /Hartwell/');
  });
  it('has nothing to export for an org chart', async () => {
    const bus = createApp();
    bus.execute('doc.open', await openDocument('org.csv', enc('ID,Name\n1,Jane\n')));
    expect(exportGedcom(bus.state, 'full')).toBeUndefined();
  });
});
