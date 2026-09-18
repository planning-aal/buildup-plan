import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { StatusBadge, dateText, pct, qty, smvText } from "@/components/planning/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CellType, CellValue, ReportColumn, ReportTable } from "@/reports/types";

const PAGE_SIZE = 100;

export function formatCell(value: CellValue, type: CellType): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (type) {
    case "qty":
    case "int":
    case "minutes":
      return qty(Number(value));
    case "pct":
      return pct(Number(value));
    case "smv":
      return smvText(Number(value));
    case "hours":
      return Number(value).toFixed(1);
    case "date":
      return dateText(String(value));
    default:
      return String(value);
  }
}

const NUMERIC: CellType[] = ["qty", "int", "minutes", "pct", "smv", "hours"];

export function ReportTableView({ table, searchable = true }: { table: ReportTable; searchable?: boolean }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = q
      ? table.rows.filter((r) => table.columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)))
      : table.rows;
    if (sort) {
      const col = table.columns.find((c) => c.key === sort.key);
      const numeric = col ? NUMERIC.includes(col.type) : false;
      out = [...out].sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const cmp = numeric
          ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [table, search, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-2">
      {table.keyValues?.length ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {table.keyValues.map((kv) => (
            <div key={kv.label} className="rounded border border-border px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{kv.label}</dt>
              <dd className="truncate font-medium" title={kv.value}>
                {kv.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {searchable && table.rows.length > 12 ? (
        <div className="flex items-center justify-between gap-2">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Filter rows"
            className="h-8 w-64"
          />
          <p className="text-xs text-muted-foreground">
            {rows.length.toLocaleString()} {rows.length === 1 ? "row" : "rows"}
          </p>
        </div>
      ) : null}

      {table.rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No rows in this report.
        </p>
      ) : (
        <div className="max-h-[620px] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                {table.columns.map((col, i) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "cursor-pointer select-none whitespace-nowrap",
                      NUMERIC.includes(col.type) && "text-right",
                      (table.freezeColumns ?? 0) > i && "sticky left-0 z-20 bg-muted",
                    )}
                    style={(table.freezeColumns ?? 0) > i ? { left: i * 120 } : undefined}
                    onClick={() =>
                      setSort((s) =>
                        s?.key === col.key
                          ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" }
                          : { key: col.key, dir: "asc" },
                      )
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-30" />
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row, rIdx) => (
                <TableRow key={rIdx}>
                  {table.columns.map((col, i) => (
                    <Cell
                      key={col.key}
                      column={col}
                      row={row}
                      frozen={(table.freezeColumns ?? 0) > i}
                      offset={i * 120}
                    />
                  ))}
                </TableRow>
              ))}
              {table.totals ? (
                <TableRow className="bg-muted/60 font-semibold">
                  {table.columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn("tabular-nums", NUMERIC.includes(col.type) && "text-right")}
                    >
                      {table.totals![col.key] === undefined || table.totals![col.key] === null
                        ? ""
                        : formatCell(table.totals![col.key]!, col.type)}
                    </TableCell>
                  ))}
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {current + 1} of {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Cell({
  column,
  row,
  frozen,
  offset,
}: {
  column: ReportColumn;
  row: Record<string, CellValue>;
  frozen: boolean;
  offset: number;
}) {
  const type =
    column.key === "value" && typeof row["__type"] === "string" ? (row["__type"] as CellType) : column.type;
  const value = row[column.key];

  return (
    <TableCell
      className={cn(
        "whitespace-nowrap",
        NUMERIC.includes(type) && "text-right tabular-nums",
        column.wrap && "max-w-[320px] whitespace-normal",
        frozen && "sticky left-0 z-10 bg-background",
      )}
      style={frozen ? { left: offset } : undefined}
    >
      {type === "status" && value ? <StatusBadge status={String(value)} /> : formatCell(value ?? null, type)}
    </TableCell>
  );
}
