## Goal

A web app where you upload the rough sewing plan file, set your parameters, and download a finished, standard **Production Buildup Plan** Excel workbook — the same format you get today, generated automatically.

## How it works for you

1. **Upload** — drop in the "update sewing plan" file (Line 1-4 / 5-8 / 9-12 sheets). The app reads every line, every day, pulls the style number, merchant, division and daily target.
2. **Review screen** — a table shows what was read, per line and per day, with anything it could not read clearly highlighted so you can fix it on screen.
3. **Settings panel** — before generating, you control:
   - **Working hours per line** (each line set separately, default 8 hrs; this drives the available-minutes figure that used to be 600 or 480)
   - **Manpower per line**
   - **Target efficiency per line** and an overall target efficiency
   - **Ramp-up curve** — start efficiency, end efficiency, and how many days a new style takes to reach full rate; the app builds the daily buildup from this
   - **Monthly target quantity** — enter e.g. 340,000 and the app scales daily targets (rounded to the nearest 50 pcs) to land exactly on it
   - **Working days / holidays** — a month calendar where you tick off Fridays (pre-ticked), plus any extra holiday or a working Friday; holidays get no target
4. **SMV upload** — a separate bulk upload (Excel or CSV: Style No, SMV, and optionally Merchant and Division). Styles matched automatically; unmatched ones listed so you can type the SMV in directly. You can also re-upload SMVs after a report is made and regenerate.
5. **Generate & download** — produces the standard workbook with all the usual sheets:
   Summary, At a Glance, Sewing Line (1-4), (5-8), (9-12), Style count – product mix, Chart, Reconciliation.
   Live formulas, formatting, the buyer/merchant lookup and validation, and the reconciliation checks all carry over, exactly like the September file.

## Pages

- **/** — upload + recent reports
- **/plan/:id** — the working screen: parsed data table, settings panel, SMV panel, holiday calendar, live preview of totals and efficiency per line, Generate button

## Technical notes

- TanStack Start app, deploys to Cloudflare as it is today.
- Excel reading and writing happen **in the browser** (SheetJS to read, ExcelJS to write) so large workbooks never need uploading to a server, and Cloudflare Worker limits are never hit.
- The September workbook (`09_Production_Buildup_Plan_Sept_2026.xlsx`) is bundled as the golden template: the generator clones its sheet layout, styles, number formats and formula patterns, then rewrites dates, styles, quantities, SMVs, manpower and the minutes constant (hours × 60) from your settings.
- Style parsing reuses the regex rules already proven across Jul/Aug/Sept: `STYLE#`/`S#` token, slash-joined codes → `D88377-1175550`, merchant from parentheses, division from `-ONG-`/`-GOB-` style suffixes.
- Ramp-up: per style, day-1 efficiency → full efficiency over N days, daily target = (manpower × hours × 60 × efficiency) / SMV, rounded to 50.
- Settings and generated reports saved in Lovable Cloud so you can reopen and regenerate a month later; file downloads are generated on demand.
- Reconciliation sheet formulas are carried forward so totals across At a Glance / Summary / Chart / line sheets are checked automatically on every export.

## Build order

1. Cloud enabled + tables for plans, line settings, styles/SMVs, holidays
2. Upload + parser + review table
3. Settings, holiday calendar, SMV bulk upload
4. Generator + Excel export from the bundled template
5. Preview totals, reconciliation verification, polish
