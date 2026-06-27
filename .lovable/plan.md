## Goal

Create `07_Production Buildup Plan Jul 2026.xlsx` that mirrors the June workbook's structure, formulas, and styling, with July 1–31, 2026 data sourced from `update sewing plan.xlsx`.

## Sheets to produce (6)

1. **Summary**
2. **At a Glance**
3. **Sewing Line (1-4)**
4. **Sewing Line (5-8)**
5. **Sewing Line (9-12)**
6. **Style count - product mix**

Auxiliary sheets (Plan, Sheet1 (2), AFL) will be omitted per your decision.

## Method

Use openpyxl in Python:

1. **Copy the June workbook** as a starting skeleton so all formulas, formatting, column widths, merged cells, fonts, colors, and borders are preserved.
2. **Drop the 3 unused sheets** (Plan, Sheet1 (2), AFL).
3. **Re-date rows** in every sheet from June 1–30 to July 1–31 (add one extra row at the bottom of each daily block; the existing formulas already extend through row 36 / col AF for 31 days, so most sheets just need date overwrites).
4. **Update the workbook title** cell on Summary from "Buildup Plan for the Month of May-2026" to "Buildup Plan for the Month of July-2026".
5. **Clear June style + qty inputs** (columns D, E, H, I, L, M, P, Q on each Sewing Line sheet, rows 6–36) while leaving formulas (G, K, O, S, T, V, W, Y) intact.
6. **Populate July data** for each of the 12 lines by reading the matching daily rows from `update sewing plan.xlsx`:
   - Line 1–4 from sheet `Line 1-4` (rows 170–200, Jul 1–31).
   - Line 5–8 from sheet `Line 5-8` (Jul 1–31 block).
   - Line 9–12 from sheet `Line 9-12` (Jul 1–31 block).
   - For each day, write the daily TARGET into the qty column (E/I/M/Q) and the extracted **style number only** into the style column (D/H/L/P).
7. **Style code extraction rule** (regex-based):
   - Take the token after `STYLE#` / `S#` / `STYLE NO` if present.
   - If two codes separated by `/` (e.g. `D88377/1175550`), join them with `-` to match June's pattern (`D88377-1175550`).
   - Strip trailing punctuation, designer names in parentheses, season tags (`'HOLL'26`, `'Sum'26`), and division suffixes (`-ONG-`, `-GOB-`).
   - For `P.O:...` rows (continuation lines without `STYLE#`), leave style blank (these are PO detail rows under the previous style, mirroring June's pattern where many cells are empty).
   - For non-code styles like `STYLE# UDADV00073 (Sohag)` → `UDADV00073`; `fab in house-24-june` → leave blank; `VMI-...` → leave blank.
8. **SMVs**: keep the June per-line SMV values (Line1=24.62, Line2=21.32, Line3=21.32, Line4=19.94, and the equivalent values already in Sewing Line (5-8) and (9-12)) — formulas reference them via column letters, so we only ensure those cells stay populated.
9. **Manpower**: keep June values (Line1-3=73, Line4=72, etc.) and Y5=0.85 efficiency target.
10. **Style count - product mix**: keep the June sheet's layout and formulas; refresh any hard-coded month label cells to "July 2026" and clear hard-coded June counts so formulas recompute from the new style column data. If the sheet has manual counts that can't be derived, I'll leave them empty for you to fill in (will flag in the closing message).
11. **Recalculate formulas** using the bundled `recalculate_formulas.py` script so saved values match formulas, then verify zero `#REF!` / `#DIV/0!` / `#VALUE!` errors.
12. Save to `/mnt/documents/07_Production Buildup Plan Jul 2026.xlsx` and surface a download link.

## Open items I'll flag, not block on

- A few July rows in the update sewing plan have no style text and no target (Fridays = holiday — matches June Fridays being blank). Will leave blank.
- Some style descriptions don't have a clean numeric code (e.g. `New Classic`, `Anarchy-Blue`, `Rookies`) — will pass through as-is, matching how June used them.
- The "Style count - product mix" sheet — if a column relies on data outside this workbook, I'll keep its formulas and note which cells you may want to refresh manually.

## Deliverable

One file: `07_Production Buildup Plan Jul 2026.xlsx` with the 6 sheets above, July 1–31 dates, July styles/targets populated, all June formulas/formatting preserved, formulas recalculated, and any cells I couldn't confidently populate listed in the chat reply.
