// Application state and the commands that change it. No DOM here, so it can be unit-tested;
// main.ts connects it to the page.
import { CommandBus } from './commands';
import { fanChartSvg, MAX_FAN_GENERATIONS } from './fan';
import { decodeText, lifeSpan, parseGedcom, type GedcomData } from './gedcom';
import { writeGedcom, type GedcomExportMode } from './gedcom-export';
import { genealogyChart, MAX_BOXES, orgRowsFromTable, parseOrgCsv, type GenealogyKind, type OrgRow } from './layout';
import { orgChart, type OrgStyle } from './org';
import { redactLiving } from './privacy';
import { renderSvg } from './render';
import { readXlsx } from './xlsx';

export type ChartKind = GenealogyKind | 'fan';

export type Doc = { type: 'family'; name: string; ged: GedcomData } | { type: 'org'; name: string; rows: OrgRow[] };

export interface AppState {
  doc?: Doc;
  kind: ChartKind;
  person: string;
  generations: number;
  hideLiving: boolean;
  orgStyle: OrgStyle;
  rollup: boolean;
}

export type ViewSettings = Omit<AppState, 'doc'>;

export const MAX_GENERATIONS = 20;

// Whole number from 1 to MAX_GENERATIONS; anything unreadable becomes 5.
export function clampGenerations(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || n === '' || n === null) return 5;
  return Math.min(Math.max(v, 1), MAX_GENERATIONS);
}

export const initialState: AppState = { kind: 'descendants', person: '', generations: 5, hideLiving: false, orgStyle: 'standard', rollup: false };

export function createApp(): CommandBus<AppState> {
  const bus = new CommandBus<AppState>(initialState);
  bus.register<Doc>({
    id: 'doc.open',
    title: 'Open',
    run: (s, doc) => ({ ...s, doc, person: doc.type === 'family' ? (doc.ged.people.keys().next().value ?? '') : s.person }),
  });
  bus.register<Partial<ViewSettings>>({
    id: 'view.set',
    title: 'Change view',
    run: (s, patch) => {
      const next: AppState = { ...s, ...patch };
      next.generations = clampGenerations(next.generations);
      if (s.doc?.type === 'family' && !s.doc.ged.people.has(next.person)) next.person = s.person;
      const keys = Object.keys(next) as (keyof AppState)[];
      return keys.some((k) => next[k] !== s[k]) ? next : undefined;
    },
  });
  return bus;
}

// Reads a file by its extension. Throws, leaving the caller's state alone, when nothing usable is in it.
export async function openDocument(name: string, bytes: Uint8Array): Promise<Doc> {
  if (/\.(csv|tsv|xlsx)$/i.test(name)) {
    const rows = /\.xlsx$/i.test(name) ? orgRowsFromTable(await readXlsx(bytes)) : parseOrgCsv(decodeText(bytes));
    if (!rows.length) throw new Error(`${name} has a header row but no people`);
    return { type: 'org', name, rows };
  }
  const ged = parseGedcom(bytes);
  if (!ged.people.size) throw new Error(`No people found in ${name}. Is it a GEDCOM file?`);
  return { type: 'family', name, ged };
}

const redacted = new WeakMap<GedcomData, GedcomData>();

// The family data as it should be shown and exported: with living people hidden when asked.
export function familyView(state: AppState): GedcomData | undefined {
  if (state.doc?.type !== 'family') return undefined;
  const ged = state.doc.ged;
  if (!state.hideLiving) return ged;
  if (!redacted.has(ged)) redacted.set(ged, redactLiving(ged));
  return redacted.get(ged);
}

export interface Drawing {
  svg: string;
  note: string;
  warnings: string[];
}

export const PROMPT = 'Open a GEDCOM (.ged) file or an org chart CSV or XLSX (ID, Name, Title, Manager).';

export function draw(state: AppState): Drawing {
  const doc = state.doc;
  if (!doc) return { svg: '', note: PROMPT, warnings: [] };
  if (doc.type === 'org') {
    const chart = orgChart(doc.rows, state.orgStyle, {}, state.rollup);
    const vacant = doc.rows.filter((r) => !r.name).length;
    const named = doc.rows.length - vacant;
    const note = `${named} ${named === 1 ? 'person' : 'people'}${vacant ? ` and ${vacant} vacant position${vacant === 1 ? '' : 's'}` : ''} in the org chart`;
    return { svg: renderSvg(chart), note, warnings: chart.warnings ?? [] };
  }
  const data = familyView(state)!;
  const notes = [`${doc.ged.people.size} people, ${doc.ged.families.size} families`];
  let svg: string;
  if (state.kind === 'fan') {
    svg = fanChartSvg(data, state.person, state.generations);
    if (state.generations > MAX_FAN_GENERATIONS) notes.push(`fan charts show at most ${MAX_FAN_GENERATIONS} generations`);
  } else {
    const chart = genealogyChart(data, state.kind, state.person, state.generations);
    svg = renderSvg(chart);
    if (chart.truncated) notes.push(`chart stopped at ${MAX_BOXES} boxes; choose fewer generations`);
  }
  return { svg, note: notes.join('; '), warnings: doc.ged.warnings };
}

// People for the picker, sorted by surname then given name. Hidden people show only their record id.
export function personOptions(state: AppState): { id: string; label: string }[] {
  const data = familyView(state);
  if (!data) return [];
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return [...data.people.values()]
    .map((p) => {
      if (p.private) return { id: p.id, label: `Living (${p.id.replace(/@/g, '')})`, key: p.id, hidden: 1 };
      const name = p.surname ? `${p.surname}, ${[p.given, p.suffix].filter(Boolean).join(' ')}`.replace(/, $/, '') : p.name;
      const span = lifeSpan(p);
      return { id: p.id, label: span ? `${name} (${span})` : name, key: `${p.surname} ${p.given}`, hidden: 0 };
    })
    .sort((a, b) => a.hidden - b.hidden || collator.compare(a.key, b.key))
    .map(({ id, label }) => ({ id, label }));
}

export const GEDCOM_MODES: Record<GedcomExportMode, string> = {
  full: 'complete: every record of the original file is kept',
  basic: 'basic: names, sex, birth, baptism, death, burial, marriages and family links only',
};

// The GEDCOM text for the current view (living people stay hidden if they are hidden on screen).
// A basic or hidden-living export gets its own file name so it cannot be mistaken for the full file.
export function exportGedcom(state: AppState, mode: GedcomExportMode): { text: string; name: string; note: string } | undefined {
  const data = familyView(state);
  if (!data || state.doc?.type !== 'family') return undefined;
  const base = state.doc.name.replace(/\.[^.]*$/, '') || 'family';
  const name = `${base}${mode === 'basic' ? '-basic' : ''}${state.hideLiving ? '-living-hidden' : ''}.ged`;
  const what = state.hideLiving
    ? mode === 'full'
      ? 'complete, except that living people and their marriages are reduced to bare links'
      : `${GEDCOM_MODES.basic}; living people hidden`
    : GEDCOM_MODES[mode];
  return { text: writeGedcom(data, mode), name, note: `Saved ${name} (${what})` };
}
