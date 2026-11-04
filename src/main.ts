import { parseGedcom, type GedcomData } from './gedcom';
import { genealogyChart, layoutTree, orgToTree, parseOrgCsv, type GenealogyKind } from './layout';
import { renderSvg } from './render';
import { fanChartSvg } from './fan';
import { writeGedcom } from './gedcom-export';
import sampleGed from '../samples/family.ged?raw';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let ged: GedcomData | undefined;
let svg = '';

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
    if (/\.csv$/i.test(file.name)) {
      ged = undefined;
      const rows = parseOrgCsv(await file.text());
      show(renderSvg(layoutTree(orgToTree(rows))), `${rows.length} people in the org chart`);
      return;
    }
    loadGedcom(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    $('msg').textContent = String(err instanceof Error ? err.message : err);
  }
});

for (const id of ['kind', 'person', 'gens']) $(id).addEventListener('change', drawGenealogy);

$('save').addEventListener('click', () => {
  if (svg) download(svg, 'image/svg+xml', 'chart.svg');
});
