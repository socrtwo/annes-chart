import { parseGedcom, type GedcomData } from './gedcom';
import { genealogyChart, parseOrgCsv, type GenealogyKind } from './layout';
import { renderSvg } from './render';
import { readXlsx, rowsToCsv } from './xlsx';
import { svgToPng } from './raster';
import { orgChart, type OrgStyle } from './org';
import { fanChartSvg } from './fan';
import { writeGedcom } from './gedcom-export';
import sampleGed from '../samples/family.ged?raw';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let ged: GedcomData | undefined;
let svg = '';
let orgRows: ReturnType<typeof parseOrgCsv> | undefined;

function drawOrg() {
  if (!orgRows) return;
  svg = renderSvg(orgChart(orgRows, $<HTMLSelectElement>('orgstyle').value as OrgStyle, {}, $<HTMLInputElement>('rollup').checked));
  $('stage').innerHTML = svg;
}

function show(markup: string, note: string) {
  svg = markup;
  $('stage').innerHTML = markup;
  $('msg').textContent = note;
}

function drawGenealogy() {
  if (!ged || !$<HTMLSelectElement>('person').value) return;
  const kind = $<HTMLSelectElement>('kind').value;
  const person = $<HTMLSelectElement>('person').value;
  const gens = Number($<HTMLInputElement>('gens').value) || 5;
  const markup = kind === 'fan' ? fanChartSvg(ged, person, gens) : renderSvg(genealogyChart(ged, kind as GenealogyKind, person, gens));
  show(markup, `${ged.people.size} people, ${ged.families.size} families${ged.warnings.length ? `, ${ged.warnings.length} warnings` : ''}`);
}

function loadGedcom(bytes: Uint8Array) {
  orgRows = undefined;
  ged = parseGedcom(bytes);
  const sel = $<HTMLSelectElement>('person');
  sel.replaceChildren(
    ...[...ged.people.values()].map((p) => Object.assign(document.createElement('option'), { value: p.id, textContent: p.name })),
  );
  drawGenealogy();
}

function download(text: string, type: string, name: string) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

$('sample').addEventListener('click', () => loadGedcom(new TextEncoder().encode(sampleGed)));

$('saveged').addEventListener('click', () => {
  if (ged) download(writeGedcom(ged), 'text/plain', 'family.ged');
});

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    if (/\.(csv|xlsx)$/i.test(file.name)) {
      ged = undefined;
      const text = /\.xlsx$/i.test(file.name) ? rowsToCsv(await readXlsx(new Uint8Array(await file.arrayBuffer()))) : await file.text();
      const rows = parseOrgCsv(text);
      orgRows = rows;
      drawOrg();
      show(svg, `${rows.length} people in the org chart`);
      return;
    }
    loadGedcom(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    $('msg').textContent = String(err instanceof Error ? err.message : err);
  }
});

for (const id of ['orgstyle', 'rollup']) $(id).addEventListener('change', drawOrg);
for (const id of ['kind', 'person', 'gens']) $(id).addEventListener('change', drawGenealogy);

$('save').addEventListener('click', () => {
  if (svg) download(svg, 'image/svg+xml', 'chart.svg');
});

$('savepng').addEventListener('click', async () => {
  if (!svg) return;
  try {
    const blob = await svgToPng(svg);
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'chart.png' });
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    $('msg').textContent = String(err instanceof Error ? err.message : err);
  }
});

$('print').addEventListener('click', () => {
  if (svg) window.print();
});
