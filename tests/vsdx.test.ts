import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bookOf } from '../src/pages';
import { readVsdx, writeVsdx } from '../src/vsdx';
import { parseXml } from '../src/xml';
import { crc32, zipStore } from '../src/zip';
import { unzip } from '../src/xlsx';
import type { Doc } from '../src/document';

const doc: Doc = {
  version: 1,
  shapes: [
    { id: 's1', x: 40, y: 40, w: 120, h: 60, text: 'CEO & "Boss" <1>', kind: 'rounded' },
    { id: 's2', x: 200, y: 160, w: 100, h: 80, text: 'Round', kind: 'ellipse' },
    { id: 's3', x: 20, y: 300, w: 100, h: 80, text: '', kind: 'diamond' },
  ],
  connectors: [
    { id: 'c1', from: 's1', to: 's2' },
    { id: 'c2', from: 's2', to: 's3' },
  ],
};

describe('zip writer', () => {
  it('computes CRC-32 and produces a readable archive', async () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const files = await unzip(zipStore({ 'a.txt': 'hello', 'dir/b.txt': 'héllo' }));
    expect(new TextDecoder().decode(files.get('dir/b.txt'))).toBe('héllo');
  });
  it('is accepted by the system unzip tool', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    try {
      writeFileSync(join(dir, 'x.zip'), zipStore({ 'a.txt': 'hello', 'b/c.txt': 'world' }));
      const out = execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(sorted(z.namelist()))', join(dir, 'x.zip')]).toString();
      expect(out).toContain("'a.txt'");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('vsdx', () => {
  it('writes a package with the parts Visio expects, as well-formed XML', async () => {
    const files = await unzip(writeVsdx({ ...bookOf(doc), pages: [{ name: 'One', doc }, { name: 'Two', doc: { version: 1, shapes: [], connectors: [] } }] }));
    expect([...files.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'visio/_rels/document.xml.rels',
      'visio/document.xml',
      'visio/pages/_rels/pages.xml.rels',
      'visio/pages/page1.xml',
      'visio/pages/page2.xml',
      'visio/pages/pages.xml',
    ]);
    for (const [name, bytes] of files) {
      const root = parseXml(new TextDecoder().decode(bytes));
      expect(root.name, name).not.toBe('#root');
    }
  });
  it('round-trips shapes, text, kinds, connectors and pages', async () => {
    const book = await readVsdx(writeVsdx({ version: 2, current: 0, pages: [{ name: 'One', doc }, { name: 'Two', doc: { ...doc, shapes: doc.shapes.slice(0, 1), connectors: [] } }] }));
    expect(book.pages.map((p) => p.name)).toEqual(['One', 'Two']);
    const back = book.pages[0].doc;
    expect(back.shapes.map((s) => [s.x, s.y, s.w, s.h, s.text, s.kind])).toEqual(doc.shapes.map((s) => [s.x, s.y, s.w, s.h, s.text, s.kind]));
    expect(back.connectors.map((c) => [c.from, c.to])).toEqual([['s1', 's2'], ['s2', 's3']]);
    expect(book.pages[1].doc.shapes).toHaveLength(1);
  });
  it('reads a hand-written file with rich text and an ellipse, ignoring shapes without geometry', async () => {
    const ns = 'xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const bytes = zipStore({
      'visio/pages/pages.xml': `<Pages ${ns}><Page ID="0" Name="Plan"><PageSheet><Cell N="PageHeight" V="4"/></PageSheet><Rel r:id="rId7"/></Page></Pages>`,
      'visio/pages/_rels/pages.xml.rels': '<Relationships><Relationship Id="rId7" Target="page9.xml"/></Relationships>',
      'visio/pages/page9.xml': `<PageContents ${ns}><Shapes>
        <Shape ID="1"><Cell N="PinX" V="2"/><Cell N="PinY" V="3"/><Cell N="Width" V="1"/><Cell N="Height" V="1"/><Section N="Geometry"><Row T="Ellipse"/></Section><Text><cp IX="0"/>Hello <cp IX="1"/>World</Text></Shape>
        <Shape ID="2"><Text>no geometry</Text></Shape>
      </Shapes></PageContents>`,
    });
    const b = await readVsdx(bytes);
    expect(b.pages[0].name).toBe('Plan');
    expect(b.pages[0].doc.shapes).toEqual([{ id: 's1', x: 144, y: 48, w: 96, h: 96, text: 'Hello World', kind: 'ellipse' }]);
  });
  it('rejects files that are not Visio drawings', async () => {
    await expect(readVsdx(zipStore({ 'a.txt': 'x' }))).rejects.toThrow(/Visio/);
  });
});
