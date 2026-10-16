# Project bundle: what the screens read

Every screen draws from one object, `window.IOS_DATA`, defined in `sample/project.js`. The screens never compute an allocation themselves. They read this bundle, so a service that returns the same shape can replace the file without touching the screens.

| Key | Shape | Used by |
|---|---|---|
| `meta` | project name, area, unit, file names, sheet list, header names | Upload |
| `preview` | first rows of the IO sheet | Upload |
| `mapping` | one row per source column: header, sample values, proposed field, confidence, who suggested it | Upload (column confirm) |
| `tmplCols` | template headers and the field each one is filled from | Upload, Excel export |
| `hw`, `hwOrder` | CHARM and terminal block per IO type | Rules, map colours, export |
| `signals` | one array per signal, fields listed in `sigFields` | Map, search, export |
| `cables` | placed cables: id, size, group, side, signal count, pair gaps | Map, tables |
| `blockedCables` | cables left out with their TQ code | Data checks |
| `dataTqs` | TQs raised before allocation | TQ register |
| `scenarios[key]` | one allocation result per rule combination: `place[i]` = `[cabinet, CIOC, baseplate, slot]` of pair 1 of cable `i` (or 0), `cabs` per-cabinet figures, `check` rule-check rows, `tqs` capacity TQs, `compare` cabinets per CIOC sharing preset | Allocate, Report |
| `revision` | Rev B signals with status and address, cable starts, impact lists, moves a fresh re-run would have made, rule-check rows | Revise |

`key` is `spare%-ciocsPerCabinet-sharingPreset-cabinetLimit-abOn-groupingOn-addedRules`, for example `10-4-class-0-1-1-0`. `addedRules` is `0`, `i` (one IO class per CIOC), `j` (one JB Ref per CIOC) or `ji`.

An address is always `[cabinet, CIOC, baseplate, slot]`, each counted from 1. A signal's slot is its cable's start plus its pair number minus one, counted across the baseplates of the CIOC.

Container names are never stored. The screens build them from the naming patterns in the rule set, so changing a pattern renames everything at once.
