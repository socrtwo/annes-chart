import { parseGedcom, type GedcomData } from './gedcom';
import { genealogyChart, layoutTree, orgToTree, parseOrgCsv, type GenealogyKind } from './layout';
import { renderSvg } from './render';
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
  const chart = genealogyChart(ged, $<HTMLSelectElement>('kind').value as GenealogyKind, $<HTMLSelectElement>('person').value, Number($<HTMLInputElement>('gens').value) || 5);
  show(renderSvg(chart), `${ged.people.size} people, ${ged.families.size} families${ged.warnings.length ? `, ${ged.warnings.length} warnings` : ''}`);
}

function loadGedcom(data: GedcomData) {
  ged = data;
  $<HTMLSelectElement>('person').replaceChildren(
    ...[...data.people.values()].map((p) => Object.assign(document.createElement('option'), { value: p.id, textContent: p.name })),
  );
  drawGenealogy();
}

function download(name: string, text: string, type: string) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

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
    loadGedcom(parseGedcom(new Uint8Array(await file.arrayBuffer())));
  } catch (err) {
    $('msg').textContent = String(err instanceof Error ? err.message : err);
  }
});

for (const id of ['kind', 'person', 'gens']) $(id).addEventListener('change', drawGenealogy);

$('save').addEventListener('click', () => svg && download('chart.svg', svg, 'image/svg+xml'));
$('saveged').addEventListener('click', () => ged && download('family.ged', writeGedcom(ged), 'text/plain'));
$('sample').addEventListener('click', () => loadGedcom(parseGedcom(sampleGed)));
