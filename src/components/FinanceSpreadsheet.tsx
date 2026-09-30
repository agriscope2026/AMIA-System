import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Settings2, Trash2 } from "lucide-react";
import type { FinanceSheetCustomColumn } from "../lib/database";
import { evaluateFinanceFormula } from "../lib/finance-formulas";
import "../App.css";
import type { ClipboardEvent, KeyboardEvent } from "react";

export type FinanceGridColumn = {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  editable?: boolean;
  custom?: boolean;
  bold?: boolean;
  color?: string;
  background?: string;
  numberFormat?: "default" | "currency" | "percent";
};

export type FinanceGridRow = {
  id: string;
  values: Record<string, unknown>;
  customValues: Record<string, unknown>;
};

export type FinanceGridOptions = {
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  filter?: string;
  columnFilterKey?: string;
  columnFilterText?: string;
  columnWidths?: Record<string, number>;
  wrapText?: boolean;
  columnStyles?: Record<string, Pick<FinanceGridColumn, "bold" | "color" | "background" | "numberFormat">>;
};

type Props = {
  rows: FinanceGridRow[];
  columns: FinanceGridColumn[];
  customColumns: FinanceSheetCustomColumn[];
  options: FinanceGridOptions;
  canEdit: boolean;
  onOptionsChange: (options: FinanceGridOptions) => void;
  onColumnsChange: (columns: FinanceSheetCustomColumn[]) => void;
  onSave: (row: FinanceGridRow, values: Record<string, unknown>, customValues: Record<string, unknown>) => Promise<void>;
  onAdd: () => Promise<void>;
  onDelete: (row: FinanceGridRow) => Promise<void>;
  onError: (error: unknown) => void;
};

function columnName(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function displayValue(value: unknown, column: FinanceGridColumn) {
  if (value === null || value === undefined || value === "") return "";
  if (column.type === "number" && Number.isFinite(Number(value))) {
    const numeric = Number(value);
    if (column.numberFormat === "currency") return `₱${numeric.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (column.numberFormat === "percent") return `${(numeric * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    return numeric.toLocaleString();
  }
  return String(value);
}

export function FinanceSpreadsheet({
  rows,
  columns: baseColumns,
  customColumns,
  options,
  canEdit,
  onOptionsChange,
  onColumnsChange,
  onSave,
  onAdd,
  onDelete,
  onError,
}: Props) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<FinanceSheetCustomColumn["type"]>("text");
  const [selectedColumnKey, setSelectedColumnKey] = useState("");
  const [propertiesColumnKey, setPropertiesColumnKey] = useState<string | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ startRow: number; startColumn: number; endRow: number; endColumn: number } | null>(null);
  const [columnResize, setColumnResize] = useState<{ key: string; width: number } | null>(null);
  const skipNextFocusSelection = useRef(false);
  const selectingCells = useRef(false);
  const fillDrag = useRef<{
    source: { startRow: number; startColumn: number; endRow: number; endColumn: number };
    target: { row: number; column: number };
  } | null>(null);
  const selectedRangeRef = useRef(selectedRange);
  useEffect(() => {
    selectedRangeRef.current = selectedRange;
  }, [selectedRange]);
  const columns = useMemo<FinanceGridColumn[]>(() => [
    ...baseColumns,
    ...customColumns.map((column): FinanceGridColumn => ({
      key: column.id,
      label: column.label,
      type: column.type,
      custom: true,
      bold: column.bold,
      color: column.color,
      background: column.background,
      numberFormat: column.numberFormat,
    })),
  ].map((column) => ({ ...column, ...options.columnStyles?.[column.key] })), [baseColumns, customColumns, options.columnStyles]);

  const rawCellValue = useCallback((row: FinanceGridRow, column: FinanceGridColumn) => {
    const rowDraft = drafts[row.id]?.[column.key];
    return rowDraft !== undefined ? rowDraft : row.customValues[`__formula__${column.key}`] ?? (column.custom ? row.customValues[column.key] : row.values[column.key]);
  }, [drafts]);
  const computedValues = useMemo(() => {
    const cache = new Map<string, unknown>();
    const calculating = new Set<string>();
    const getCell = (rowIndex: number, columnIndex: number): unknown => {
      const row = rows[rowIndex];
      const column = columns[columnIndex];
      if (!row || !column) return 0;
      const key = `${row.id}:${column.key}`;
      if (cache.has(key)) return cache.get(key);
      const raw = drafts[row.id]?.[column.key] ?? row.customValues[`__formula__${column.key}`] ?? (column.custom ? row.customValues[column.key] : row.values[column.key]);
      if (typeof raw !== "string" || !raw.startsWith("=")) return raw;
      if (calculating.has(key)) return "#CYCLE";
      calculating.add(key);
      const result = evaluateFinanceFormula(raw, (referenceRow, referenceColumn) => getCell(referenceRow, referenceColumn));
      calculating.delete(key);
      cache.set(key, result);
      return result;
    };
    return rows.map((_, rowIndex) => Object.fromEntries(columns.map((column, columnIndex) => [
      column.key,
      getCell(rowIndex, columnIndex),
    ])));
  }, [columns, drafts, rows]);

  const visibleRows = useMemo(() => {
    const filterText = (options.filter ?? "").trim().toLowerCase();
    const filtered = rows.map((row, index) => ({ row, index })).filter(({ index }) => {
      const value = options.columnFilterKey
        ? String(computedValues[index]?.[options.columnFilterKey] ?? "")
        : columns.map((column) => String(computedValues[index]?.[column.key] ?? "")).join(" ");
      return (!filterText || value.toLowerCase().includes(filterText))
        && (!options.columnFilterText || String(computedValues[index]?.[options.columnFilterKey ?? ""] ?? "").toLowerCase().includes(options.columnFilterText.toLowerCase()));
    });
    if (!options.sortKey) return filtered;
    const sortColumn = columns.find((column) => column.key === options.sortKey);
    if (!sortColumn) return filtered;
    return filtered.sort((left, right) => {
      const a = computedValues[left.index]?.[sortColumn.key];
      const b = computedValues[right.index]?.[sortColumn.key];
      const aNumber = Number(a);
      const bNumber = Number(b);
      const compared = sortColumn.type === "number" && Number.isFinite(aNumber) && Number.isFinite(bNumber)
        ? aNumber - bNumber
        : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return options.sortDirection === "desc" ? -compared : compared;
    });
  }, [columns, computedValues, options.columnFilterKey, options.columnFilterText, options.filter, options.sortDirection, options.sortKey, rows]);

  const updateCell = (rowId: string, column: FinanceGridColumn, value: string) => {
    setDrafts((current) => ({ ...current, [rowId]: { ...(current[rowId] ?? {}), [column.key]: value } }));
  };
  const activeSelection = selectedRange
    ? { row: selectedRange.endRow, column: selectedRange.endColumn }
    : null;
  const activeRow = activeSelection ? visibleRows[activeSelection.row]?.row : undefined;
  const activeColumn = activeSelection ? columns[activeSelection.column] : undefined;
  const activeRowIndex = activeRow ? rows.findIndex((row) => row.id === activeRow.id) : -1;
  const activeValue = activeRow && activeColumn ? rawCellValue(activeRow, activeColumn) : "";
  const dirtyRowCount = Object.values(drafts).filter((draft) => Object.keys(draft).length > 0).length;
  const rowNumberWidth = Math.min(48, Math.max(22, String(visibleRows.length || 1).length * 8 + 8));
  useEffect(() => {
    const finishPointerInteraction = () => {
      selectingCells.current = false;
      const drag = fillDrag.current;
      fillDrag.current = null;
      if (!drag || !canEdit) return;
      const firstRow = Math.min(drag.source.startRow, drag.source.endRow);
      const lastRow = Math.max(drag.source.startRow, drag.source.endRow);
      const firstColumn = Math.min(drag.source.startColumn, drag.source.endColumn);
      const lastColumn = Math.max(drag.source.startColumn, drag.source.endColumn);
      const targetFirstRow = Math.min(firstRow, drag.target.row);
      const targetLastRow = Math.max(lastRow, drag.target.row);
      const targetFirstColumn = Math.min(firstColumn, drag.target.column);
      const targetLastColumn = Math.max(lastColumn, drag.target.column);
      if (targetFirstRow === firstRow && targetLastRow === lastRow && targetFirstColumn === firstColumn && targetLastColumn === lastColumn) return;
      setDrafts((current) => {
        const next = { ...current };
        for (let rowIndex = targetFirstRow; rowIndex <= targetLastRow; rowIndex++) {
          const destination = visibleRows[rowIndex]?.row;
          if (!destination) continue;
          const destinationDraft = { ...(next[destination.id] ?? {}) };
          for (let columnIndex = targetFirstColumn; columnIndex <= targetLastColumn; columnIndex++) {
            if (rowIndex >= firstRow && rowIndex <= lastRow && columnIndex >= firstColumn && columnIndex <= lastColumn) continue;
            const sourceRowIndex = firstRow + ((rowIndex - firstRow) % (lastRow - firstRow + 1));
            const sourceColumnIndex = firstColumn + ((columnIndex - firstColumn) % (lastColumn - firstColumn + 1));
            const sourceRow = visibleRows[sourceRowIndex]?.row;
            const sourceColumn = columns[sourceColumnIndex];
            const destinationColumn = columns[columnIndex];
            if (!sourceRow || !sourceColumn || !destinationColumn || destinationColumn.editable === false) continue;
            let value = String(rawCellValue(sourceRow, sourceColumn) ?? "");
            if (value.startsWith("=")) {
              const rowOffset = rowIndex - sourceRowIndex;
              const columnOffset = columnIndex - sourceColumnIndex;
              value = value.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/gi, (_reference, absoluteColumn: string, letters: string, absoluteRow: string, rowNumber: string) => {
                let sourceColumnNumber = 0;
                for (const letter of letters.toUpperCase()) sourceColumnNumber = sourceColumnNumber * 26 + letter.charCodeAt(0) - 64;
                const movedColumn = absoluteColumn ? sourceColumnNumber : sourceColumnNumber + columnOffset;
                const movedRow = absoluteRow ? Number(rowNumber) : Number(rowNumber) + rowOffset;
                if (movedColumn < 1 || movedRow < 1) return "#REF!";
                return `${absoluteColumn}${columnName(movedColumn - 1)}${absoluteRow}${movedRow}`;
              });
            }
            destinationDraft[destinationColumn.key] = value;
          }
          next[destination.id] = destinationDraft;
        }
        return next;
      });
    };
    window.addEventListener("pointerup", finishPointerInteraction);
    window.addEventListener("pointercancel", finishPointerInteraction);
    return () => {
      window.removeEventListener("pointerup", finishPointerInteraction);
      window.removeEventListener("pointercancel", finishPointerInteraction);
    };
  }, [canEdit, columns, rawCellValue, visibleRows]);
  const saveRow = async (row: FinanceGridRow) => {
    const changes = drafts[row.id];
    if (!changes) return;
    setSavingId(row.id);
    try {
      const values = { ...row.values };
      const customValues = { ...row.customValues };
      for (const [key, value] of Object.entries(changes)) {
        const column = columns.find((item) => item.key === key);
        if (column?.custom) customValues[key] = value;
        else if (column) {
          if (value.startsWith("=")) {
            if (column.type !== "number") throw new Error(`Formulas in ${column.label} must be stored in a number column.`);
            const result = computedValues[rows.findIndex((item) => item.id === row.id)]?.[key];
            if (typeof result !== "number" || !Number.isFinite(result)) throw new Error(`Formula in ${column.label} must return a valid number.`);
            customValues[`__formula__${key}`] = value;
            values[key] = String(result);
          } else {
            delete customValues[`__formula__${key}`];
            values[key] = value;
          }
        }
      }
      await onSave(row, values, customValues);
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    } catch (error) {
      onError(error);
    } finally {
      setSavingId(null);
    }
  };
  const pasteGrid = (event: ClipboardEvent<HTMLTableElement>, startRow: number, startColumn: number) => {
    if (!canEdit) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, "").split("\n").filter((line, index, all) => line || index < all.length - 1).map((line) => line.split("\t"));
    setDrafts((current) => {
      const next = { ...current };
      matrix.forEach((cells, rowOffset) => {
        const visibleRow = visibleRows[startRow + rowOffset]?.row;
        if (!visibleRow) return;
        const rowDraft = { ...(next[visibleRow.id] ?? {}) };
        cells.forEach((value, columnOffset) => {
          const column = columns[startColumn + columnOffset];
          if (column?.editable !== false) rowDraft[column.key] = value;
        });
        next[visibleRow.id] = rowDraft;
      });
      return next;
    });
  };
  const handleGridKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, rowIndex: number, columnIndex: number) => {
    if (event.key !== "Enter" && event.key !== "Tab" && !event.key.startsWith("Arrow")) return;
    if (!event.shiftKey && event.key.startsWith("Arrow") && event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) return;
    event.preventDefault();
    const rowDelta = event.key === "Enter" || event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    const columnDelta = event.key === "Tab" || event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const nextRow = Math.max(0, Math.min(visibleRows.length - 1, rowIndex + rowDelta));
    const nextColumn = Math.max(0, Math.min(columns.length - 1, columnIndex + columnDelta));
    if (nextRow === rowIndex && nextColumn === columnIndex) return;
    if (event.shiftKey) {
      setSelectedRange((current) => ({
        startRow: current?.startRow ?? rowIndex,
        startColumn: current?.startColumn ?? columnIndex,
        endRow: nextRow,
        endColumn: nextColumn,
      }));
      skipNextFocusSelection.current = true;
    }
    document.querySelector<HTMLTextAreaElement>(`[data-finance-cell="${nextRow}:${nextColumn}"]`)?.focus();
  };
  const copyGrid = (event: ClipboardEvent<HTMLTableElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const match = /^(\d+):(\d+)$/.exec(target.dataset.financeCell ?? "");
    if (!match) return;
    const activeRow = Number(match[1]);
    const activeColumn = Number(match[2]);
    const range = selectedRange ?? { startRow: activeRow, startColumn: activeColumn, endRow: activeRow, endColumn: activeColumn };
    const firstRow = Math.min(range.startRow, range.endRow);
    const lastRow = Math.max(range.startRow, range.endRow);
    const firstColumn = Math.min(range.startColumn, range.endColumn);
    const lastColumn = Math.max(range.startColumn, range.endColumn);
    const text = Array.from({ length: lastRow - firstRow + 1 }, (_, rowOffset) => {
      const visibleRow = visibleRows[firstRow + rowOffset];
      return Array.from({ length: lastColumn - firstColumn + 1 }, (_, columnOffset) => {
        const column = columns[firstColumn + columnOffset];
        if (!visibleRow || !column) return "";
        return String(computedValues[visibleRow.index]?.[column.key] ?? "").replace(/[\t\r\n]+/g, " ");
      }).join("\t");
    }).join("\n");
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
  };
  const addColumn = () => {
    const label = newColumnName.trim();
    if (!label) return;
    const id = `custom_${crypto.randomUUID().replace(/-/g, "")}`;
    onColumnsChange([...customColumns, { id, label, type: newColumnType }]);
    setNewColumnName("");
    setNewColumnType("text");
  };
  const updateColumnStyle = (columnKey: string, patch: NonNullable<FinanceGridOptions["columnStyles"]>[string]) => {
    onOptionsChange({
      ...options,
      columnStyles: { ...options.columnStyles, [columnKey]: { ...options.columnStyles?.[columnKey], ...patch } },
    });
  };
  const updateCustomColumn = (columnKey: string, patch: Partial<FinanceSheetCustomColumn>) => {
    onColumnsChange(customColumns.map((column) => column.id === columnKey ? { ...column, ...patch } : column));
  };
  const resizeColumn = (event: React.PointerEvent<HTMLButtonElement>, key: string) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = options.columnWidths?.[key] ?? 180;
    const onMove = (moveEvent: PointerEvent) => {
      const width = Math.max(72, Math.min(700, startWidth + moveEvent.clientX - startX));
      setColumnResize({ key, width });
    };
    const onUp = (upEvent: PointerEvent) => {
      const width = Math.max(72, Math.min(700, startWidth + upEvent.clientX - startX));
      onOptionsChange({ ...options, columnWidths: { ...options.columnWidths, [key]: width } });
      setColumnResize(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const autoFitColumn = (key: string) => {
    const column = columns.find((item) => item.key === key);
    if (!column) return;
    const longestValue = visibleRows.reduce((max, { row }) => {
      const value = String(computedValues[rows.findIndex((item) => item.id === row.id)]?.[key] ?? "");
      return Math.max(max, ...value.split(/\r?\n/).map((line) => line.length));
    }, column.label.length);
    const width = Math.max(90, Math.min(700, longestValue * 7.5 + 42));
    onOptionsChange({ ...options, columnWidths: { ...options.columnWidths, [key]: width } });
  };

  return <section className="finance-spreadsheet">
    <div className="finance-spreadsheet-toolbar">
      <label className="spreadsheet-filter">Filter rows<input value={options.filter ?? ""} onChange={(event) => onOptionsChange({ ...options, filter: event.target.value })} placeholder="Search this sheet…" /></label>
      <label className="spreadsheet-filter">Filter column<select value={options.columnFilterKey ?? ""} onChange={(event) => onOptionsChange({ ...options, columnFilterKey: event.target.value })}><option value="">Any column</option>{columns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
      <label className="spreadsheet-filter">Contains<input value={options.columnFilterText ?? ""} onChange={(event) => onOptionsChange({ ...options, columnFilterText: event.target.value })} placeholder="Filter value" /></label>
      {canEdit && <>
        <div className="spreadsheet-new-column"><input value={newColumnName} onChange={(event) => setNewColumnName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addColumn(); }} placeholder="New column name" aria-label="New column name" /><select aria-label="New column type" value={newColumnType} onChange={(event) => setNewColumnType(event.target.value as FinanceSheetCustomColumn["type"])}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option></select><button type="button" className="button secondary" onClick={addColumn}><Plus size={14} /> Add column</button></div>
        <button type="button" className="button secondary" disabled={addingRow} onClick={() => { setAddingRow(true); void onAdd().catch(onError).finally(() => setAddingRow(false)); }}><Plus size={14} /> Add row</button>
      </>}
      {canEdit && <button type="button" className="button primary spreadsheet-save-all" disabled={!dirtyRowCount || savingId !== null} onClick={() => {
        void (async () => {
          for (const row of rows) {
            if (drafts[row.id] && Object.keys(drafts[row.id]).length > 0) await saveRow(row);
          }
        })();
      }}>Save all{dirtyRowCount ? ` (${dirtyRowCount})` : ""}</button>}
      <label className="spreadsheet-wrap-toggle"><input type="checkbox" checked={Boolean(options.wrapText)} onChange={(event) => onOptionsChange({ ...options, wrapText: event.target.checked })} /> Wrap text</label>
    </div>
    <div className="spreadsheet-formula-bar">
      <label className="spreadsheet-name-box" aria-label="Selected cell address">
        <span>Cell</span>
        <input readOnly value={activeRow && activeColumn ? `${columnName(activeSelection!.column)}${activeRowIndex + 1}` : ""} />
      </label>
      <span className="spreadsheet-formula-symbol">fx</span>
      <input
        className="spreadsheet-formula-input"
        aria-label="Cell value or formula"
        value={String(activeValue ?? "")}
        disabled={!canEdit || !activeRow || !activeColumn || activeColumn.editable === false || savingId === activeRow?.id}
        onChange={(event) => {
          if (activeRow && activeColumn) updateCell(activeRow.id, activeColumn, event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && activeRow) {
            event.preventDefault();
            void saveRow(activeRow);
          }
        }}
        placeholder="Select a cell to view or edit its value or formula"
      />
      {activeRow && activeColumn && canEdit && <button type="button" className="button secondary spreadsheet-save-cell" disabled={!drafts[activeRow.id] || savingId === activeRow.id} onClick={() => void saveRow(activeRow)}><Save size={13} /> Save row</button>}
    </div>
    <div className="spreadsheet-hint-bar"><span>Formula support: + − × ÷, cell references, SUM, AVERAGE, MIN, MAX, COUNT, COUNTA</span><span>Drag the green cell handle to fill · Drag the ↔ header grip to resize · Double-click to auto-fit</span></div>
    <div className="finance-spreadsheet-wrap">
      <table className="finance-spreadsheet-grid" onPaste={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
        const match = /^(\d+):(\d+)$/.exec(target.dataset.financeCell ?? "");
        if (match) pasteGrid(event, Number(match[1]), Number(match[2]));
      }} onCopy={copyGrid}>
        <colgroup><col className="spreadsheet-row-number-column" style={{ width: rowNumberWidth, minWidth: rowNumberWidth, maxWidth: rowNumberWidth }} />{columns.map((column) => <col key={column.key} style={{ width: columnResize?.key === column.key ? columnResize.width : options.columnWidths?.[column.key] ?? 180 }} />)}{canEdit && <col style={{ width: 88 }} />}</colgroup>
        <thead>
        <tr className="spreadsheet-column-letters"><th className="spreadsheet-row-number spreadsheet-select-all" style={{ width: rowNumberWidth, minWidth: rowNumberWidth, maxWidth: rowNumberWidth }} aria-label="Select all cells" title="Select all cells" onClick={() => {
          if (visibleRows.length && columns.length) setSelectedRange({ startRow: 0, startColumn: 0, endRow: visibleRows.length - 1, endColumn: columns.length - 1 });
        }}><span /></th>{columns.map((column, columnIndex) => <th key={column.key}>{columnName(columnIndex)}</th>)}{canEdit && <th>...</th>}</tr>
        <tr className="spreadsheet-column-labels"><th className="spreadsheet-row-number" style={{ width: rowNumberWidth, minWidth: rowNumberWidth, maxWidth: rowNumberWidth }}>#</th>{columns.map((column, columnIndex) => <th key={column.key} className={[
          selectedColumnKey === column.key ? "spreadsheet-column-active" : "",
          propertiesColumnKey === column.key ? "spreadsheet-column-menu-open" : "",
        ].filter(Boolean).join(" ") || undefined} style={{ width: options.columnWidths?.[column.key] }} onClick={() => {
          setSelectedColumnKey(column.key);
          const direction = options.sortKey === column.key && options.sortDirection === "asc" ? "desc" : "asc";
          onOptionsChange({ ...options, sortKey: column.key, sortDirection: direction });
        }} title="Click to sort">
          <span className="spreadsheet-header-title">{column.label}</span>
          {options.sortKey === column.key && (options.sortDirection === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
          {canEdit && <button type="button" className="spreadsheet-column-properties-button" aria-label={`Edit ${column.label} column properties`} title={`Edit ${column.label} column properties`} onClick={(event) => {
            event.stopPropagation();
            setSelectedColumnKey(column.key);
            setPropertiesColumnKey((current) => current === column.key ? null : column.key);
          }}><Settings2 size={13} /></button>}
          {column.custom && canEdit && <button type="button" aria-label={`Remove ${column.label} column`} onClick={(event) => { event.stopPropagation(); onColumnsChange(customColumns.filter((item) => item.id !== column.key)); }}><Trash2 size={12} /></button>}
          {canEdit && <button type="button" className="spreadsheet-column-resize" title="Drag ↔ to resize; double-click to fit contents" aria-label={`Resize ${column.label} column`} onPointerDown={(event) => resizeColumn(event, column.key)} onDoubleClick={(event) => { event.stopPropagation(); autoFitColumn(column.key); }}><GripVertical size={15} /></button>}
          {canEdit && propertiesColumnKey === column.key && <div className="spreadsheet-column-properties" onClick={(event) => event.stopPropagation()}>
            <strong>{columnName(columnIndex)} · Column properties</strong>
            {column.custom && <label>Column name<input value={column.label} onChange={(event) => updateCustomColumn(column.key, { label: event.target.value })} /></label>}
            {column.custom && <label>Data type<select value={column.type} onChange={(event) => updateCustomColumn(column.key, { type: event.target.value as FinanceSheetCustomColumn["type"] })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option></select></label>}
            <label className="spreadsheet-property-check"><input type="checkbox" checked={Boolean(column.bold)} onChange={(event) => updateColumnStyle(column.key, { bold: event.target.checked })} /> Bold text</label>
            <label>Text color<input type="color" value={column.color ?? "#304c40"} onChange={(event) => updateColumnStyle(column.key, { color: event.target.value })} /></label>
            <label>Cell color<input type="color" value={column.background ?? "#ffffff"} onChange={(event) => updateColumnStyle(column.key, { background: event.target.value })} /></label>
            {column.type === "number" && <label>Number format<select value={column.numberFormat ?? "default"} onChange={(event) => updateColumnStyle(column.key, { numberFormat: event.target.value as FinanceSheetCustomColumn["numberFormat"] })}><option value="default">Number</option><option value="currency">Currency</option><option value="percent">Percent</option></select></label>}
            <label>Width<input type="number" min="72" max="700" value={options.columnWidths?.[column.key] ?? 180} onChange={(event) => {
              const width = Number(event.target.value);
              if (Number.isFinite(width)) onOptionsChange({ ...options, columnWidths: { ...options.columnWidths, [column.key]: Math.max(72, Math.min(700, width)) } });
            }} /></label>
            <button type="button" className="button secondary" onClick={() => setPropertiesColumnKey(null)}>Done</button>
          </div>}
        </th>)}{canEdit && <th>Actions</th>}</tr></thead>
        <tbody>{visibleRows.map(({ row, index: sourceRowIndex }, rowIndex) => {
          const dirty = Boolean(drafts[row.id]);
          return <tr key={row.id}><th scope="row" className="spreadsheet-row-number" style={{ width: rowNumberWidth, minWidth: rowNumberWidth, maxWidth: rowNumberWidth }}>{rowIndex + 1}</th>{columns.map((column, columnIndex) => {
            const raw = rawCellValue(row, column);
            const computed = computedValues[sourceRowIndex]?.[column.key];
            const formulaResult = typeof raw === "string" && raw.startsWith("=") ? computed : null;
            const style = {
              fontWeight: column.bold ? 700 : undefined,
              color: column.color,
              backgroundColor: column.background,
              "--spreadsheet-custom-background": column.background,
            } as React.CSSProperties;
            const isSelected = selectedRange !== null
              && rowIndex >= Math.min(selectedRange.startRow, selectedRange.endRow)
              && rowIndex <= Math.max(selectedRange.startRow, selectedRange.endRow)
              && columnIndex >= Math.min(selectedRange.startColumn, selectedRange.endColumn)
              && columnIndex <= Math.max(selectedRange.startColumn, selectedRange.endColumn);
            const selectedEndRow = selectedRange ? Math.max(selectedRange.startRow, selectedRange.endRow) : -1;
            const selectedEndColumn = selectedRange ? Math.max(selectedRange.startColumn, selectedRange.endColumn) : -1;
            const isFillHandleCell = canEdit && selectedRange !== null && rowIndex === selectedEndRow && columnIndex === selectedEndColumn;
            return <td key={column.key} className={[isSelected ? "spreadsheet-cell-selected" : "", !column.background && rowIndex % 2 === 1 ? "spreadsheet-cell-banded" : ""].filter(Boolean).join(" ") || undefined} style={style}>
              <textarea
                data-finance-cell={`${rowIndex}:${columnIndex}`}
                rows={options.wrapText ? 2 : 1}
                wrap={options.wrapText ? "soft" : "off"}
                value={String(raw ?? "")}
                disabled={!canEdit || column.editable === false || savingId === row.id}
                style={{ height: options.wrapText ? undefined : 34 }}
                ref={(element) => {
                  if (!element || !options.wrapText) return;
                  element.style.height = "auto";
                  element.style.height = `${Math.max(44, element.scrollHeight)}px`;
                }}
                title={formulaResult === null ? undefined : `Calculated result: ${String(formulaResult)}`}
                onFocus={() => {
                  setSelectedColumnKey(column.key);
                  if (skipNextFocusSelection.current) {
                    skipNextFocusSelection.current = false;
                    return;
                  }
                  setSelectedRange({ startRow: rowIndex, startColumn: columnIndex, endRow: rowIndex, endColumn: columnIndex });
                }}
                onMouseDown={(event) => {
                  const current = selectedRangeRef.current;
                  const anchor = event.shiftKey && current
                    ? { row: current.startRow, column: current.startColumn }
                    : { row: rowIndex, column: columnIndex };
                  selectingCells.current = true;
                  setSelectedRange({ startRow: anchor.row, startColumn: anchor.column, endRow: rowIndex, endColumn: columnIndex });
                  if (document.activeElement !== event.currentTarget) skipNextFocusSelection.current = true;
                }}
                onMouseEnter={() => {
                  const fill = fillDrag.current;
                  if (fill) {
                    fill.target = { row: rowIndex, column: columnIndex };
                    setSelectedRange({ startRow: fill.source.startRow, startColumn: fill.source.startColumn, endRow: rowIndex, endColumn: columnIndex });
                  } else if (selectingCells.current) {
                    const current = selectedRangeRef.current;
                    if (current) setSelectedRange({ ...current, endRow: rowIndex, endColumn: columnIndex });
                  }
                }}
                onChange={(event) => updateCell(row.id, column, event.target.value)}
                onInput={(event) => {
                  if (!options.wrapText) return;
                  event.currentTarget.style.height = "auto";
                  event.currentTarget.style.height = `${Math.max(44, event.currentTarget.scrollHeight)}px`;
                }}
                onKeyDown={(event) => handleGridKeyDown(event, rowIndex, columnIndex)}
              />
              {formulaResult !== null && <small className={`spreadsheet-formula-result ${String(formulaResult).startsWith("#") ? "error" : ""}`}>{displayValue(formulaResult, column)}</small>}
              {isFillHandleCell && <button type="button" className="spreadsheet-fill-handle" aria-label="Drag to fill selected cells" title="Drag to fill cells" onMouseDown={(event) => event.preventDefault()} onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const source = selectedRangeRef.current ?? { startRow: rowIndex, startColumn: columnIndex, endRow: rowIndex, endColumn: columnIndex };
                fillDrag.current = { source: { ...source }, target: { row: rowIndex, column: columnIndex } };
              }} />}
            </td>;
          })}{canEdit && <td><div className="finance-row-actions"><button type="button" className="button primary spreadsheet-save" disabled={!dirty || savingId === row.id} onClick={() => void saveRow(row)}><Save size={13} /> {savingId === row.id ? "Saving…" : "Save"}</button><button type="button" className="button secondary spreadsheet-save" disabled={busyDeleteId === row.id} onClick={() => { setBusyDeleteId(row.id); void onDelete(row).catch(onError).finally(() => setBusyDeleteId(null)); }}><Trash2 size={13} /> Delete</button></div></td>}</tr>;
        })}{!visibleRows.length && <tr><td colSpan={columns.length + (canEdit ? 2 : 1)} className="spreadsheet-empty">No records match this sheet or filter.</td></tr>}</tbody>
      </table>
    </div>
    <div className="finance-spreadsheet-status">
      <span>{visibleRows.length} row{visibleRows.length === 1 ? "" : "s"} · {columns.length} column{columns.length === 1 ? "" : "s"}</span>
      <span>{activeRow && activeColumn ? `${columnName(activeSelection!.column)}${activeRowIndex + 1} · ${activeColumn.label}` : "Select a cell"}</span>
      <span>{dirtyRowCount ? `${dirtyRowCount} unsaved row${dirtyRowCount === 1 ? "" : "s"}` : "All changes saved"}</span>
    </div>
  </section>;
}
