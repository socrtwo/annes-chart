import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { parseOrgCsv } from '../src/layout';
import { readXlsx, rowsToCsv } from '../src/xlsx';

function zip(entries: Record<string, string>, deflate: boolean): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const [name, body] of Object.entries(entries)) {
    const nm = enc.encode(name);
    const raw = enc.encode(body);
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(8, deflate ? 8 : 0, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, raw.length, true);
    lh.setUint16(26, nm.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(10, deflate ? 8 : 0, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, raw.length, true);
    ch.setUint16(28, nm.length, true);
    ch.setUint32(42, off, true);
    chunks.push(new Uint8Array(lh.buffer), nm, data);
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cdLen = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, Object.keys(entries).length, true);
  end.setUint32(12, cdLen, true);
  end.setUint32(16, off, true);
  return new Uint8Array(Buffer.concat([...chunks, ...central, new Uint8Array(end.buffer)]));
}

const files = {
  'xl/sharedStrings.xml':
    '<sst><si><t>ID</t></si><si><t>Name</t></si><si><t>Manager</t></si><si><t>Jane &amp; Co, CEO</t></si><si><r><t>Bo</t></r><r><t>b</t></r></si></sst>',
  'xl/worksheets/sheet1.xml':
    '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
    '<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>3</v></c></row>' +
    '<row r="3"><c r="A3"><v>2</v></c><c r="B3" t="s"><v>4</v></c><c r="C3"><v>1</v></c></row></sheetData></worksheet>',
};

describe('xlsx', () => {
  for (const deflate of [false, true]) {
    it(`reads rows (${deflate ? 'deflated' : 'stored'}) and feeds the org CSV parser`, async () => {
      const rows = await readXlsx(zip(files, deflate));
      expect(rows).toEqual([['ID', 'Name', 'Manager'], ['1', 'Jane & Co, CEO'], ['2', 'Bob', '1']]);
      const org = parseOrgCsv(rowsToCsv(rows));
      expect(org.map((r) => [r.id, r.name, r.manager])).toEqual([
        ['1', 'Jane & Co, CEO', undefined],
        ['2', 'Bob', '1'],
      ]);
    });
  }
  it('rejects non-zip input', async () => {
    await expect(readXlsx(new Uint8Array(40))).rejects.toThrow(/zip/);
  });
});
