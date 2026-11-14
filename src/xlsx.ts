// Minimal .xlsx reader: zip central directory, sharedStrings and the first worksheet.
const dec = new TextDecoder();
const MAX_ENTRY = 256 * 1024 * 1024; // refuse to inflate absurd entries (zip bombs)

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Reads the zip directory only; an entry is inflated when its function is called.
export function openZip(bytes: Uint8Array): Map<string, () => Promise<Uint8Array>> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx (zip) file');
  const files = new Map<string, () => Promise<Uint8Array>>();
  try {
    const count = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    for (let n = 0; n < count; n++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad directory entry');
      const method = v.getUint16(p + 10, true);
      const csize = v.getUint32(p + 20, true);
      const usize = v.getUint32(p + 24, true);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      if (start + csize > bytes.length) throw new Error('entry runs past the end of the file');
      const raw = bytes.subarray(start, start + csize);
      files.set(name, async () => {
        if (usize > MAX_ENTRY) throw new Error(`${name} is too large to read`);
        if (method === 0) return raw;
        if (method === 8) return inflateRaw(raw);
        throw new Error(`Unsupported zip compression (${method})`);
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
  } catch (err) {
    throw new Error(`Corrupt .xlsx (zip) file: ${err instanceof Error ? err.message : err}`);
  }
  return files;
}

export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const [name, read] of openZip(bytes)) out.set(name, await read());
  return out;
}

const unxml = (s: string) =>
  s.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e],
  );

// Excel writes characters XML cannot hold as _xHHHH_ (a line break in a cell is _x000D_ plus a newline).
const unescapeCell = (s: string) => unxml(s).replace(/_x([0-9a-fA-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

const colIndex = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

// Namespace prefixes (<x:row>) are dropped so one set of patterns reads every writer's files.
const plain = (xml: string) => xml.replace(/<(\/?)[A-Za-z][\w.-]*:/g, '<$1');

// Text of a string item: its <t> runs, without phonetic (furigana) runs or empty <t/> elements.
function textOf(xml: string): string {
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<t\b[^>]*\/>/g, '');
  return [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeCell(m[1])).join('');
}

const attr = (tag: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];

// Path of the first sheet in tab order, from xl/workbook.xml and its relationships.
function firstSheetPath(workbook: string, rels: string): string | undefined {
  const sheet = /<sheet\b([^>]*)>/.exec(plain(workbook).replace(/<sheet\b([^>]*?)\s(?:\w+:)?id="/g, '<sheet$1 id="'));
  const rid = sheet && attr(sheet[1], 'id');
  if (!rid) return undefined;
  for (const m of plain(rels).matchAll(/<Relationship\b([^>]*)>/g)) {
    if (attr(m[1], 'Id') !== rid) continue;
    const target = unxml(attr(m[1], 'Target') ?? '');
    return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  return undefined;
}

// Returns the first worksheet as rows of strings.
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const files = openZip(bytes);
  const text = async (n: string) => (files.has(n) ? dec.decode(await files.get(n)!()) : '');
  const shared = [...plain(await text('xl/sharedStrings.xml')).matchAll(/<si\s*\/>|<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? ''));
  const num = (k: string) => parseInt(k.match(/\d+/g)!.pop()!, 10);
  const byNumber = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => num(a) - num(b))[0];
  const first = firstSheetPath(await text('xl/workbook.xml'), await text('xl/_rels/workbook.xml.rels'));
  const sheet = first && files.has(first) ? first : byNumber;
  if (!sheet) throw new Error('No worksheet found in the .xlsx file');
  const rows: string[][] = [];
  for (const r of plain(await text(sheet)).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /^([A-Z]+)\d+$/.exec(attr(c[1], 'r') ?? '');
      const type = attr(c[1], 't');
      const body = c[2] ?? '';
      let val: string;
      if (type === 's') val = shared[Number(/<v>(\d+)<\/v>/.exec(body)?.[1])] ?? '';
      else if (type === 'inlineStr') val = textOf(body);
      else val = unescapeCell(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      row[ref ? colIndex(ref[1]) : row.length] = val;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows;
}

export function rowsToCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}
