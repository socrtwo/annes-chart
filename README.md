# Anne's Chart

*Part of the Anne's Office suite: [Anne's Pen](https://github.com/socrtwo/annes-pen) (documents), [Anne's Grid](https://github.com/socrtwo/annes-grid) (spreadsheets), [Anne's Post](https://github.com/socrtwo/annes-post) (email), [Anne's Stage](https://github.com/socrtwo/annes-stage) (presentations), [Anne's Loom](https://github.com/socrtwo/annes-loom) (web sites), [Anne's Press](https://github.com/socrtwo/annes-press) (desktop publishing), [Anne's Folio](https://github.com/socrtwo/annes-folio) (PDF), [Anne's Lens](https://github.com/socrtwo/Annes-lens) (pictures) and **Anne's Chart** (diagrams, org charts and family trees).*

An original, open-source diagramming app in the tradition of Microsoft Visio, with the features and commands of every org chart program, current and historical, and **GEDCOM import** so the same tool draws family trees. Clean-room: no code or assets from any of those programs. Goal shared with the rest of the suite: **no missing commands**.

> **Status: 0.1.0, foundation.** What works today:
>
> - **GEDCOM import** (5.5, 5.5.1, 7.0; UTF-8, UTF-16, ANSEL, Windows-1252): people, names and suffixes, sex, birth, baptism, death, burial, families, marriages and divorces. Bad lines become warnings you can read in the app; links recorded on only one side are repaired in both directions.
> - **GEDCOM export**, two ways: **complete** writes back every record and tag of the file you opened (notes, sources, media, other events, custom tags); **basic** writes only the core facts the charts use, as plain GEDCOM 5.5.1.
> - **Genealogy charts:** descendants (with marriages), ancestors (pedigree), hourglass, bowtie and fan, from any person, with a generation limit. An ancestor reached by two lines is drawn on both.
> - **Privacy filter:** living people appear as "Living" with no dates or places, their marriages are hidden too, and the filter also applies to GEDCOM export. People without dates are dated from their relatives.
> - **Org charts from CSV or XLSX** (ID, Name, Title, Manager, Dotted line, Type): standard, hanging and horizontal styles, assistants, vacancies, dotted-line managers and roll-up counts. Managers may be given by ID or by name; comma, semicolon and tab delimiters are read; duplicate IDs, unknown managers and reporting loops are drawn and reported as warnings.
> - **Output:** SVG, PNG and print / PDF (the whole chart scaled to the page width; multi-page posters are still to come).
> - **Undo and redo** of everything you change, through the command registry.
>
> Everything else is the plan: see [docs/COMMANDS-PLAN.md](docs/COMMANDS-PLAN.md) and [docs/ROADMAP.md](docs/ROADMAP.md). Issues and discussion are welcome.

## The plan in brief

- **A Visio-class diagram editor:** pages and layers, stencils and shapes with connection points, smart connectors, containers, swimlanes, data-linked shapes, themes, rulers, grids, guides, snapping, shape sheets, and import/export of VSDX, VSD (read), SVG, PDF and PNG.
- **Every org chart program's commands,** gathered from Visio's Org Chart Wizard, OrgPlus/Pingboard, Lucidchart, SmartDraw, Org Charting, ChartSmith, Organimi, Microsoft Org Chart 2.0 (the old Office applet), PowerPoint SmartArt, Google Drawings and the open-source tools: hanging, side-by-side, staff and matrix layouts, assistants, dotted-line relationships, vacant positions, headcount roll-ups, photo boxes, data-driven charts from CSV, XLSX and LDAP, scenario comparison and chart history.
- **Family history:** GEDCOM import and export, descendant, ancestor, hourglass, fan, bowtie, relationship and kinship charts, multiple marriages, adoptive and step relationships, living-person privacy filters, source citations, and links to pictures in Anne's Lens.
- **Suite shell:** command registry, ribbon, Quick Access Bar, customizable tabs and keyboard, command search, macros, optional AI assistance, and platforms matching the sister apps.

## Develop

```
npm install
npm run dev        # web app
npm test           # unit tests
npm run typecheck
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
