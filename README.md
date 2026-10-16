# IO Signal Sudoku

Give every signal in a customer IO list one exact home: cabinet, CIOC, baseplate and CHARM slot, under rules the engineer sets. Anything that cannot be placed becomes a TQ that says why. Revisions keep unchanged signals where they are.

Excel in. Rules applied. Excel out.

## Run it

No install and no network needed.

```bash
python -m http.server 5173
```

Open http://localhost:5173. Opening `index.html` directly also works.

## The five steps

1. **Upload.** Drop the customer's IO list and the allocation template. The sheet and header row are found, columns are matched, and anything unsure waits for a click. Data checks raise TQs before anything is placed.
2. **Set rules.** Capacity, grouping, A/B separation, CIOC sharing, spare room, the CHARM and terminal block table, and the naming patterns. Save and load rule sets.
3. **Allocate.** One button. The cabinet map shows every slot, coloured by IO type, with spare pairs, free slots, empty baseplates and the A/B divider.
4. **Report + TQs.** Rule check, TQ register with options, per-cabinet summary, what-if controls, and the filled Excel workbook.
5. **Revise.** Drop Rev B. See what was added, deleted, moved, swapped or renamed, which cabinets and drawings are hit, and how many moves were avoided.

Press `/` to search for a tag or cable. The buttons at the right of the step bar change with the step: Save rules, Run allocation (Ctrl+Enter), Export Excel, Download impact report.

## Layout

```
index.html            page shell
assets/css/app.css    design tokens and components
assets/js/            util, store (bundle reader), map (SVG cabinet map), export (Excel), views (5 screens), app (state and runs)
assets/vendor/        SheetJS for the Excel download
assets/fonts/         IBM Plex, bundled for offline use
sample/project.js     the project bundle the screens read
docs/                 data contract and declarations
```

See `docs/DATA_CONTRACT.md` for the shape of the bundle and `docs/declarations.md` for libraries and tools.
