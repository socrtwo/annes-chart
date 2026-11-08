import type { Connector, Doc, Shape, ShapeKind } from './document';
import { SHAPE_KINDS } from './document';
import type { Book } from './pages';
import { escXml, kid, kids, parseXml, type XNode } from './xml';
import { unzip } from './xlsx';
import { zipStore } from './zip';

const NS = 'http://schemas.microsoft.com/office/visio/2012/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.microsoft.com/visio/2010/relationships';
const PX = 96; // pixels per inch
const inch = (px: number) => +(px / PX).toFixed(5);

const cell = (n: string, v: number | string, f?: string) => `<Cell N="${n}" V="${escXml(String(v))}"${f ? ` F="${f}"` : ''}/>`;

function geometry(k: ShapeKind, w: number, h: number): string {
  const W = inch(w);
  const H = inch(h);
  const row = (t: string, ix: number, x: number, y: number) => `<Row T="${t}" IX="${ix}">${cell('X', x)}${cell('Y', y)}</Row>`;
  let rows: string;
  if (k === 'ellipse') {
    rows = `<Row T="Ellipse" IX="1">${cell('X', W / 2)}${cell('Y', H / 2)}${cell('A', W)}${cell('B', H / 2)}${cell('C', W / 2)}${cell('D', H)}</Row>`;
  } else if (k === 'diamond') {
    rows = row('MoveTo', 1, W / 2, 0) + row('LineTo', 2, W, H / 2) + row('LineTo', 3, W / 2, H) + row('LineTo', 4, 0, H / 2) + row('LineTo', 5, W / 2, 0);
  } else {
    rows = row('MoveTo', 1, 0, 0) + row('LineTo', 2, W, 0) + row('LineTo', 3, W, H) + row('LineTo', 4, 0, H) + row('LineTo', 5, 0, 0);
  }
  return `<Section N="Geometry" IX="0">${cell('NoFill', 0)}${cell('NoLine', 0)}${rows}</Section>`;
}

function pageXml(doc: Doc, pageH: number): string {
  // Visio's origin is bottom-left with y up, in inches.
  const ids = new Map<string, number>();
  doc.shapes.forEach((s, i) => ids.set(s.id, i + 1));
  const parts: string[] = [];
  for (const s of doc.shapes) {
    parts.push(
      `<Shape ID="${ids.get(s.id)}" NameU="${escXml(s.id)}" Type="Shape">${cell('PinX', inch(s.x + s.w / 2))}${cell('PinY', inch(pageH - (s.y + s.h / 2)))}` +
        `${cell('Width', inch(s.w))}${cell('Height', inch(s.h))}${cell('LocPinX', inch(s.w / 2), 'Width*0.5')}${cell('LocPinY', inch(s.h / 2), 'Height*0.5')}` +
        `<Section N="Prop"><Row N="AnnesKind">${cell('Value', s.kind)}</Row></Section>${geometry(s.kind, s.w, s.h)}` +
        `<Text>${escXml(s.text)}</Text></Shape>`,
    );
  }
  const connects: string[] = [];
  const byId = new Map(doc.shapes.map((s) => [s.id, s]));
  let next = doc.shapes.length + 1;
  for (const c of doc.connectors) {
    const a = byId.get(c.from);
    const b = byId.get(c.to);
    if (!a || !b) continue;
    const id = next++;
    const [x1, y1, x2, y2] = [a.x + a.w / 2, pageH - (a.y + a.h / 2), b.x + b.w / 2, pageH - (b.y + b.h / 2)].map(inch);
    const len = +Math.hypot(x2 - x1, y2 - y1).toFixed(5);
    // A connector is a line from its begin point: length along local x, rotated by its angle.
    parts.push(
      `<Shape ID="${id}" NameU="${escXml(c.id)}" Type="Shape">${cell('PinX', x1)}${cell('PinY', y1)}${cell('Width', len)}${cell('Height', 0)}${cell('LocPinX', 0)}${cell('LocPinY', 0)}` +
        `${cell('Angle', +Math.atan2(y2 - y1, x2 - x1).toFixed(6))}${cell('BeginX', x1)}${cell('BeginY', y1)}${cell('EndX', x2)}${cell('EndY', y2)}${cell('ObjType', 2)}` +
        `<Section N="Geometry" IX="0">${cell('NoFill', 1)}<Row T="MoveTo" IX="1">${cell('X', 0)}${cell('Y', 0)}</Row><Row T="LineTo" IX="2">${cell('X', len)}${cell('Y', 0)}</Row></Section></Shape>`,
    );
    connects.push(
      `<Connect FromSheet="${id}" FromCell="BeginX" FromPart="9" ToSheet="${ids.get(c.from)}" ToCell="PinX" ToPart="3"/>`,
      `<Connect FromSheet="${id}" FromCell="EndX" FromPart="12" ToSheet="${ids.get(c.to)}" ToCell="PinX" ToPart="3"/>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<PageContents xmlns="${NS}" xmlns:r="${R}" xml:space="preserve"><Shapes>${parts.join('')}</Shapes>${connects.length ? `<Connects>${connects.join('')}</Connects>` : ''}</PageContents>`;
}

const extent = (doc: Doc) => ({
  w: Math.max(800, ...doc.shapes.map((s) => s.x + s.w + 48)),
  h: Math.max(600, ...doc.shapes.map((s) => s.y + s.h + 48)),
});

/** Writes a Visio drawing (.vsdx) with one page per page of the book. */
export function writeVsdx(book: Book): Uint8Array {
  const n = book.pages.length;
  const files: Record<string, string> = {};
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  files['[Content_Types].xml'] =
    head +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/><Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>' +
    book.pages.map((_, i) => `<Override PartName="/visio/pages/page${i + 1}.xml" ContentType="application/vnd.ms-visio.page+xml"/>`).join('') +
    '</Types>';
  files['_rels/.rels'] = `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/document" Target="visio/document.xml"/></Relationships>`;
  files['visio/document.xml'] =
    `${head}<VisioDocument xmlns="${NS}" xmlns:r="${R}" xml:space="preserve"><DocumentSettings/><Colors/><FaceNames/><StyleSheets><StyleSheet ID="0" Name="No Style" LineStyle="0" FillStyle="0" TextStyle="0"/></StyleSheets></VisioDocument>`;
  files['visio/_rels/document.xml.rels'] = `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/pages" Target="pages/pages.xml"/></Relationships>`;
  files['visio/pages/pages.xml'] =
    `${head}<Pages xmlns="${NS}" xmlns:r="${R}" xml:space="preserve">` +
    book.pages
      .map((p, i) => {
        const e = extent(p.doc);
        return `<Page ID="${i}" Name="${escXml(p.name)}" NameU="${escXml(p.name)}"><PageSheet>${cell('PageWidth', inch(e.w))}${cell('PageHeight', inch(e.h))}</PageSheet><Rel r:id="rId${i + 1}"/></Page>`;
      })
      .join('') +
    '</Pages>';
  files['visio/pages/_rels/pages.xml.rels'] =
    `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    Array.from({ length: n }, (_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/page" Target="page${i + 1}.xml"/>`).join('') +
    '</Relationships>';
  book.pages.forEach((p, i) => (files[`visio/pages/page${i + 1}.xml`] = pageXml(p.doc, extent(p.doc).h)));
  return zipStore(files);
}

const val = (shape: XNode, name: string): number | undefined => {
  const c = kids(shape, 'Cell').find((x) => x.attrs.N === name);
  const v = c ? Number(c.attrs.V) : NaN;
  return Number.isFinite(v) ? v : undefined;
};

function textOf(n: XNode): string {
  const t = kid(n, 'Text');
  if (!t) return '';
  const walk = (x: XNode): string => x.text + x.children.filter((c) => !['cp', 'pp', 'tp', 'fld'].includes(c.name) || c.text).map(walk).join('');
  return walk(t).replace(/\s+/g, ' ').trim();
}

function readPage(xml: string, pageH: number): Doc {
  const root = parseXml(xml);
  const shapes: Shape[] = [];
  const ends: { id: string; from?: string; to?: string }[] = [];
  const idToShape = new Map<string, string>();
  let n = 0;
  let c = 0;
  for (const sh of kids(kid(root, 'Shapes') ?? root, 'Shape')) {
    const sid = sh.attrs.ID;
    if (val(sh, 'BeginX') !== undefined && val(sh, 'EndX') !== undefined) {
      ends.push({ id: sid });
      continue;
    }
    const w = val(sh, 'Width');
    const h = val(sh, 'Height');
    const px = val(sh, 'PinX');
    const py = val(sh, 'PinY');
    if (w === undefined || h === undefined || px === undefined || py === undefined) continue;
    const prop = kid(kids(sh, 'Section').find((s) => s.attrs.N === 'Prop') ?? sh, 'Row');
    const kindRaw = prop ? kids(prop, 'Cell').find((x) => x.attrs.N === 'Value')?.attrs.V : undefined;
    const geomHasEllipse = kids(kids(sh, 'Section').find((s) => s.attrs.N === 'Geometry') ?? sh, 'Row').some((r) => r.attrs.T === 'Ellipse');
    const kind = (SHAPE_KINDS as readonly string[]).includes(kindRaw ?? '') ? (kindRaw as ShapeKind) : geomHasEllipse ? 'ellipse' : 'rounded';
    const id = `s${++n}`;
    idToShape.set(sid, id);
    shapes.push({ id, x: Math.round((px - w / 2) * PX), y: Math.round((pageH - py - h / 2) * PX), w: Math.round(w * PX), h: Math.round(h * PX), text: textOf(sh), kind });
  }
  for (const k of kids(kid(root, 'Connects') ?? root, 'Connect')) {
    let e = ends.find((x) => x.id === k.attrs.FromSheet);
    if (!e) continue;
    const target = idToShape.get(k.attrs.ToSheet);
    if (k.attrs.FromCell === 'BeginX') e.from = target;
    else if (k.attrs.FromCell === 'EndX') e.to = target;
  }
  const connectors: Connector[] = [];
  for (const e of ends) {
    if (e.from && e.to && e.from !== e.to && !connectors.some((x) => x.from === e.from && x.to === e.to)) connectors.push({ id: `c${++c}`, from: e.from, to: e.to });
  }
  return { version: 1, shapes, connectors };
}

/** Reads shapes, text and connections from a .vsdx file. Masters, styles and nested groups are not imported. */
export async function readVsdx(bytes: Uint8Array): Promise<Book> {
  const files = await unzip(bytes);
  const text = (name: string) => {
    const f = files.get(name);
    if (!f) throw new Error(`Not a Visio file: missing ${name}`);
    return new TextDecoder().decode(f);
  };
  const pagesXml = parseXml(text('visio/pages/pages.xml'));
  const rels = new Map<string, string>();
  if (files.has('visio/pages/_rels/pages.xml.rels')) {
    for (const r of kids(parseXml(text('visio/pages/_rels/pages.xml.rels')), 'Relationship')) rels.set(r.attrs.Id, r.attrs.Target);
  }
  const pages = kids(pagesXml, 'Page').map((p, i) => {
    const target = rels.get(kid(p, 'Rel')?.attrs.id ?? '') ?? `page${i + 1}.xml`;
    const sheet = kid(p, 'PageSheet');
    const pageH = (sheet ? val(sheet, 'PageHeight') : undefined) ?? 6;
    const path = target.startsWith('/') ? target.slice(1) : `visio/pages/${target}`;
    return { name: p.attrs.Name || `Page-${i + 1}`, doc: readPage(text(path), pageH) };
  });
  if (!pages.length) throw new Error('The Visio file has no pages');
  return { version: 2, pages, current: 0 };
}
