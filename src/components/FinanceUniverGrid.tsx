import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createUniver, HorizontalAlign, LocaleType, mergeLocales } from "@univerjs/presets";
import type { ICellData, IWorkbookData, IWorksheetData } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import coreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import sortEnUS from "@univerjs/preset-sheets-sort/locales/en-US";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import filterEnUS from "@univerjs/preset-sheets-filter/locales/en-US";
import { Maximize2, Minimize2 } from "lucide-react";
import type { FinanceSheetCustomColumn } from "../lib/database";
import type { FinanceGridColumn, FinanceGridOptions, FinanceGridRow, FinanceGridSave } from "./FinanceSpreadsheet";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "../App.css";

type Props = {
  rows: FinanceGridRow[];
  columns: FinanceGridColumn[];
  customColumns: FinanceSheetCustomColumn[];
  options: FinanceGridOptions;
  canEdit: boolean;
  onOptionsChange: (options: FinanceGridOptions) => void;
  onColumnsChange: (columns: FinanceSheetCustomColumn[]) => void;
  onSaveBatch: (changes: FinanceGridSave[]) => Promise<void>;
  onAdd: () => Promise<void>;
  onDeleteBatch: (rows: FinanceGridRow[]) => Promise<void>;
  onRowsReorder: (orderedIds: string[]) => Promise<void>;
  onError: (error: unknown) => void;
  onBack: () => void;
};

function cellDataFor(value: unknown, rowId?: string, columnKey?: string, column?: FinanceGridColumn): ICellData {
  const rawValue = value === null || value === undefined ? "" : value;
  const formula = typeof rawValue === "string" && rawValue.startsWith("=") ? rawValue : undefined;
  const numeric = Number(rawValue);
  const keepCurrencyAsText = column?.numberFormat === "currency"
    && rawValue !== ""
    && Number.isFinite(numeric)
    && !Number.isSafeInteger(numeric * 100);
  const numericValue = column?.type === "number" && rawValue !== "" && Number.isFinite(numeric) && !keepCurrencyAsText
    ? numeric
    : rawValue;
  const result: ICellData = {
    v: formula ? 0 : typeof numericValue === "boolean" || typeof numericValue === "number" ? numericValue : String(numericValue),
  };
  if (formula) result.f = formula;
  if (column && (column.type === "number" || column.bold || column.color || column.background)) {
    const numberPattern = column.numberFormat === "currency"
      ? '₱#,##0.00;[Red](₱#,##0.00)'
      : column.numberFormat === "percent"
        ? '0.00%;[Red](0.00%)'
        : '#,##0.##;[Red](#,##0.##)';
    result.s = {
      ...(column.type === "number" ? { ht: HorizontalAlign.RIGHT, n: { pattern: numberPattern } } : {}),
      ...(column.bold ? { bl: 1 as const } : {}),
      ...(column.color ? { cl: { rgb: column.color } } : {}),
      ...(column.background ? { bg: { rgb: column.background } } : {}),
    };
  }
  if (rowId || columnKey) result.custom = {
    ...(rowId ? { financeRowId: rowId } : {}),
    ...(columnKey ? { financeColumnKey: columnKey } : {}),
  };
  return result;
}

function createWorkbookData(
  rows: FinanceGridRow[],
  columns: FinanceGridColumn[],
  options: FinanceGridOptions,
): IWorkbookData {
  const columnsByKey = new Map(columns.map((column) => [column.key, column]));
  const requestedColumnOrder = new Set(options.columnOrder ?? []);
  const requestedRowOrder = new Set(options.rowOrder ?? []);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const orderedColumns = [
    ...(options.columnOrder ?? []).map((key) => columnsByKey.get(key)).filter((column): column is FinanceGridColumn => Boolean(column)),
    ...columns.filter((column) => !requestedColumnOrder.has(column.key)),
  ];
  const orderedRows = [
    ...(options.rowOrder ?? []).map((id) => rowsById.get(id)).filter((row): row is FinanceGridRow => Boolean(row)),
    ...rows.filter((row) => !requestedRowOrder.has(row.id)),
  ];
  const sheetId = crypto.randomUUID();
  const cellData: IWorksheetData["cellData"] = {
    0: Object.fromEntries(orderedColumns.map((column, index) => [
      index,
      { ...cellDataFor(column.label, undefined, column.key), s: { bg: { rgb: "#e7ece8" }, cl: { rgb: "#31463a" }, bl: 1 } },
    ])),
  };
  orderedRows.forEach((row, rowIndex) => {
    const cells: Record<number, ICellData> = {};
    orderedColumns.forEach((column, columnIndex) => {
      const savedFormula = row.customValues[`__formula__${column.key}`];
      const value = savedFormula ?? (column.custom ? row.customValues[column.key] : row.values[column.key]);
      cells[columnIndex] = cellDataFor(value, row.id, undefined, column);
    });
    cellData[rowIndex + 1] = cells;
  });
  const sheet: IWorksheetData = {
    id: sheetId,
    name: "Financial worksheet",
    tabColor: "#4c8060",
    hidden: 0,
    freeze: { startRow: 1, startColumn: 1, xSplit: 1, ySplit: 1 },
    rowCount: Math.max(100, orderedRows.length + 1),
    columnCount: Math.max(26, orderedColumns.length),
    zoomRatio: 1,
    scrollTop: 0,
    scrollLeft: 0,
    defaultColumnWidth: 160,
    defaultRowHeight: 24,
    mergeData: [],
    cellData,
    rowData: Object.fromEntries(orderedRows.flatMap((row, index) => {
      const height = options.rowHeights?.[row.id];
      return typeof height === "number" ? [[index + 1, { h: height }]] : [];
    })),
    columnData: Object.fromEntries(orderedColumns.map((column, index) => [
      index,
      { w: options.columnWidths?.[column.key] ?? 160 },
    ])),
    rowHeader: { width: 46 },
    columnHeader: { height: 24 },
    showGridlines: 1,
    rightToLeft: 0,
  };
  return {
    id: crypto.randomUUID(),
    name: "Financial worksheet",
    appVersion: "1.0.3",
    locale: LocaleType.EN_US,
    styles: {},
    sheetOrder: [sheetId],
    sheets: { [sheetId]: sheet },
  };
}

function getRowId(cells: Record<number, ICellData> | undefined) {
  for (const cell of Object.values(cells ?? {})) {
    const rowId = cell?.custom?.financeRowId;
    if (typeof rowId === "string") return rowId;
  }
  return null;
}

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("The CSV file contains an unclosed quoted field.");
  row.push(field);
  if (row.some((item) => item.length > 0)) rows.push(row);
  return rows;
}

function importedCellValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    const cell = value as { formula?: unknown; text?: unknown; richText?: Array<{ text?: unknown }> };
    if (typeof cell.formula === "string") return `=${cell.formula}`;
    if (typeof cell.text === "string") return cell.text;
    if (Array.isArray(cell.richText)) return cell.richText.map((part) => typeof part.text === "string" ? part.text : "").join("");
  }
  return String(value);
}

function downloadFile(name: string, contents: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function FinanceUniverGrid({
  rows,
  columns,
  customColumns,
  options,
  canEdit,
  onOptionsChange,
  onColumnsChange,
  onSaveBatch,
  onAdd,
  onDeleteBatch,
  onRowsReorder,
  onError,
  onBack,
}: Props) {
  const hostId = `finance-univer-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const latestProps = useRef({ rows, columns, customColumns, options, canEdit, onOptionsChange, onColumnsChange, onSaveBatch, onAdd, onDeleteBatch, onRowsReorder, onError });
  const workbookRef = useRef<{ save: () => IWorkbookData } | null>(null);
  const univerApiRef = useRef<ReturnType<typeof createUniver>["univerAPI"] | null>(null);
  const applyingPermissionsRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMessage, setFileMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knownRowIdsRef = useRef(new Set(rows.map((row) => row.id)));
  const knownColumnKeysRef = useRef(new Set(columns.map((column) => column.key)));
  useEffect(() => {
    latestProps.current = { rows, columns, customColumns, options, canEdit, onOptionsChange, onColumnsChange, onSaveBatch, onAdd, onDeleteBatch, onRowsReorder, onError };
  }, [canEdit, columns, customColumns, onAdd, onColumnsChange, onDeleteBatch, onError, onOptionsChange, onRowsReorder, onSaveBatch, options, rows]);

  useEffect(() => {
    if (!hostRef.current) return;
    const initial = latestProps.current;
    let workbookId: string | null = null;
    let univer: ReturnType<typeof createUniver>["univer"] | null = null;
    let changeSubscription: { dispose: () => void } | null = null;

    try {
      const instance = createUniver({
        locale: LocaleType.EN_US,
        darkMode: document.documentElement.dataset.theme === "dark",
        locales: {
          [LocaleType.EN_US]: mergeLocales(coreEnUS, sortEnUS, filterEnUS),
        },
        presets: [
          UniverSheetsCorePreset({ container: hostId, toolbar: true, formulaBar: true, footer: { sheetBar: true, statisticBar: true, menus: true, zoomSlider: true } }),
          UniverSheetsSortPreset(),
          UniverSheetsFilterPreset(),
        ],
      });
      univer = instance.univer;
      univerApiRef.current = instance.univerAPI;
      const workbook = instance.univerAPI.createWorkbook(createWorkbookData(initial.rows, initial.columns, initial.options));
      workbookId = workbook.getId();
      workbookRef.current = workbook;
      changeSubscription = workbook.onCommandExecuted(() => {
        if (applyingPermissionsRef.current) return;
        setSaveFailed(false);
        setDirty(true);
      });
    } catch (error) {
      latestProps.current.onError(error);
    }

    return () => {
      changeSubscription?.dispose();
      if (workbookId) univerApiRef.current?.disposeUnit(workbookId);
      univer?.dispose();
      workbookRef.current = null;
      univerApiRef.current = null;
    };
  }, [hostId]);

  useEffect(() => {
    const syncTheme = () => {
      univerApiRef.current?.toggleDarkMode(document.documentElement.dataset.theme === "dark");
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sheet = univerApiRef.current?.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) return;
    void (async () => {
      try {
        const permission = sheet.getWorksheetPermission();
        applyingPermissionsRef.current = true;
        if (!permission.isProtected()) await permission.protect();
        await permission.setMode(latestProps.current.canEdit ? "editable" : "readOnly");
      } catch (error) {
        latestProps.current.onError(error);
      } finally {
        applyingPermissionsRef.current = false;
      }
    })();
  }, [canEdit]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === hostRef.current?.parentElement);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = hostRef.current?.parentElement;
    if (!container) return;
    try {
      if (document.fullscreenElement === container) await document.exitFullscreen();
      else await container.requestFullscreen();
    } catch (error) {
      latestProps.current.onError(error);
    }
  }, []);

  useEffect(() => {
    const newRows = rows.filter((row) => !knownRowIdsRef.current.has(row.id));
    if (!newRows.length) return;
    const workbook = workbookRef.current;
    const api = univerApiRef.current;
    const sheet = api?.getActiveWorkbook()?.getActiveSheet();
    if (!workbook || !sheet) return;
    try {
      for (const row of newRows) {
        const snapshot = workbook.save();
        const worksheet = snapshot.sheets[snapshot.sheetOrder[0]];
        const cells = worksheet?.cellData ?? {};
        const existingRowIndices = Object.keys(cells).map(Number).filter((index) => index > 0 && getRowId(cells[index]));
        const targetRowIndex = Math.max(0, ...existingRowIndices) + 1;
        Object.entries(cells[0] ?? {}).forEach(([columnIndexText, headerCell]) => {
          const key = headerCell?.custom?.financeColumnKey;
          if (typeof key !== "string") return;
          const column = latestProps.current.columns.find((item) => item.key === key);
          if (!column) return;
          const savedFormula = row.customValues[`__formula__${key}`];
          const value = savedFormula ?? (column.custom ? row.customValues[key] : row.values[key]);
          sheet.getRange(targetRowIndex, Number(columnIndexText)).setValueForCell(cellDataFor(value, row.id));
        });
        knownRowIdsRef.current.add(row.id);
      }
    } catch (error) {
      latestProps.current.onError(error);
    }
  }, [rows]);

  useEffect(() => {
    const newColumns = columns.filter((column) => !knownColumnKeysRef.current.has(column.key));
    if (!newColumns.length) return;
    const workbook = workbookRef.current;
    const api = univerApiRef.current;
    const sheet = api?.getActiveWorkbook()?.getActiveSheet();
    if (!workbook || !sheet) return;
    try {
      for (const column of newColumns) {
        const snapshot = workbook.save();
        const worksheet = snapshot.sheets[snapshot.sheetOrder[0]];
        const cells = worksheet?.cellData ?? {};
        const targetColumnIndex = Math.max(-1, ...Object.keys(cells[0] ?? {}).map(Number)) + 1;
        sheet.getRange(0, targetColumnIndex).setValueForCell(cellDataFor(column.label, undefined, column.key));
        Object.entries(cells).forEach(([rowIndexText, rowCells]) => {
          const rowIndex = Number(rowIndexText);
          if (rowIndex < 1) return;
          const rowId = getRowId(rowCells);
          const row = latestProps.current.rows.find((item) => item.id === rowId);
          if (!row) return;
          const value = column.custom ? row.customValues[column.key] : row.values[column.key];
          sheet.getRange(rowIndex, targetColumnIndex).setValueForCell(cellDataFor(value, row.id));
        });
        knownColumnKeysRef.current.add(column.key);
      }
    } catch (error) {
      latestProps.current.onError(error);
    }
  }, [columns]);

  const saveWorkbook = useCallback(async () => {
    const workbook = workbookRef.current;
    if (!workbook) {
      latestProps.current.onError(new Error("The financial worksheet is not ready. Reload the page and try again."));
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    try {
      const snapshot = workbook.save();
      const worksheet = snapshot.sheets[snapshot.sheetOrder[0]];
      const cells = worksheet?.cellData ?? {};
      const currentRows = latestProps.current.rows;
      const currentColumns = latestProps.current.columns;
      const originalById = new Map(currentRows.map((row) => [row.id, row]));
      const columnKeys = currentColumns.map((_column, index) => {
        const key = cells[0]?.[index]?.custom?.financeColumnKey;
        return typeof key === "string" ? key : undefined;
      });
      const orderedRowIds = Object.entries(cells)
        .map(([rowIndex, rowCells]) => ({ rowIndex: Number(rowIndex), rowId: getRowId(rowCells) }))
        .filter((entry): entry is { rowIndex: number; rowId: string } => entry.rowIndex > 0 && entry.rowId !== null)
        .sort((left, right) => left.rowIndex - right.rowIndex)
        .map((entry) => entry.rowId);
      const savedRowIdSet = new Set(orderedRowIds);
      const missingRows = currentRows.filter((row) => !savedRowIdSet.has(row.id));
      const deletedRowIds = new Set<string>();
      if (missingRows.length > 0 && latestProps.current.canEdit) {
        const confirmed = window.confirm(`Delete ${missingRows.length} saved row${missingRows.length === 1 ? "" : "s"} from this financial sheet? This cannot be undone.`);
        if (confirmed) {
          await latestProps.current.onDeleteBatch(missingRows);
          missingRows.forEach((row) => deletedRowIds.add(row.id));
        } else {
          const sheet = univerApiRef.current?.getActiveWorkbook()?.getActiveSheet();
          if (!sheet) throw new Error("The financial worksheet could not be restored after canceling row deletion.");
          const existingRowIndices = Object.keys(cells).map(Number).filter((index) => index > 0 && getRowId(cells[index]));
          let targetRowIndex = Math.max(0, ...existingRowIndices) + 1;
          for (const row of missingRows) {
            columnKeys.forEach((key, columnIndex) => {
              if (!key) return;
              const column = currentColumns.find((item) => item.key === key);
              if (!column) return;
              const savedFormula = row.customValues[`__formula__${key}`];
              const value = savedFormula ?? (column.custom ? row.customValues[key] : row.values[key]);
              sheet.getRange(targetRowIndex, columnIndex).setValueForCell(cellDataFor(value, row.id));
            });
            targetRowIndex++;
          }
          setFileMessage("Row deletion canceled; the removed rows were restored. Review the sheet and save again.");
          setSaveFailed(true);
          setDirty(true);
          return;
        }
      }
      const pendingChanges: FinanceGridSave[] = [];
      for (const [rowIndexText, rowCells] of Object.entries(cells)) {
        const rowIndex = Number(rowIndexText);
        if (rowIndex < 1 || !rowCells) continue;
        const rowId = getRowId(rowCells);
        if (!rowId) continue;
        const original = originalById.get(rowId);
        if (!original) continue;
        const values: Record<string, unknown> = {};
        const customValues = { ...original.customValues };
        columnKeys.forEach((key, columnIndex) => {
          if (!key) return;
          const cell = rowCells[columnIndex];
          const column = currentColumns.find((item) => item.key === key);
          if (!column || column.editable === false) return;
          const formula = typeof cell?.f === "string" && cell.f.startsWith("=") ? cell.f : null;
          const value = formula ?? (cell?.v === null || cell?.v === undefined ? "" : String(cell.v));
          if (column.type === "number" && !formula && value !== "" && !Number.isFinite(Number(value))) {
            throw new Error(`${column.label} only accepts numeric values.`);
          }
          const formulaKey = `__formula__${key}`;
          if (column.custom) {
            const priorValue = original.customValues[key];
            const priorFormula = original.customValues[formulaKey];
            const computedValue = String(cell?.v ?? "");
            if (formula) {
              if (String(priorValue ?? "") !== computedValue) customValues[key] = computedValue;
              if (priorFormula !== formula) customValues[formulaKey] = formula;
            } else {
              if (String(priorValue ?? "") !== value) customValues[key] = value;
              if (priorFormula !== undefined) delete customValues[formulaKey];
            }
          } else {
            const priorValue = original.values[key];
            const priorFormula = original.customValues[formulaKey];
            if (formula) {
              const computedValue = String(cell?.v ?? "");
              if (String(priorValue ?? "") !== computedValue) values[key] = computedValue;
              if (priorFormula !== formula) customValues[formulaKey] = formula;
            } else {
              if (String(priorValue ?? "") !== value) values[key] = value;
              if (priorFormula !== undefined) delete customValues[formulaKey];
            }
          }
        });
        if (Object.keys(values).length > 0 || JSON.stringify(customValues) !== JSON.stringify(original.customValues)) {
          pendingChanges.push({ row: original, values, customValues });
        }
      }
      if (pendingChanges.length > 0) await latestProps.current.onSaveBatch(pendingChanges);
      const columnWidths = { ...latestProps.current.options.columnWidths };
      columnKeys.forEach((key, index) => {
        const width = worksheet?.columnData?.[index]?.w;
        if (key && typeof width === "number") columnWidths[key] = width;
      });
      const rowHeights = { ...latestProps.current.options.rowHeights };
      Object.entries(worksheet?.rowData ?? {}).forEach(([rowIndexText, rowData]) => {
        const rowId = getRowId(cells[Number(rowIndexText)]);
        if (rowId && typeof rowData?.h === "number") rowHeights[rowId] = rowData.h;
      });
      const completeRowOrder = [
        ...orderedRowIds,
        ...currentRows.map((row) => row.id).filter((id) => !savedRowIdSet.has(id) && !deletedRowIds.has(id)),
      ];
      latestProps.current.onOptionsChange({
        ...latestProps.current.options,
        columnOrder: columnKeys.filter((key): key is string => Boolean(key)),
        rowOrder: completeRowOrder,
        columnWidths,
        rowHeights,
      });
      if (latestProps.current.canEdit && completeRowOrder.length > 0) {
        await latestProps.current.onRowsReorder(completeRowOrder);
      }
      setDirty(false);
      setFileMessage("Changes saved to the database.");
    } catch (error) {
      setSaveFailed(true);
      latestProps.current.onError(error);
    } finally {
      setSaving(false);
    }
  }, []);
  useEffect(() => {
    if (!dirty || saving || !canEdit || saveFailed) return;
    const timeout = window.setTimeout(() => {
      void saveWorkbook();
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [canEdit, dirty, saveFailed, saving, saveWorkbook]);

  const addRow = async () => {
    if (!latestProps.current.canEdit) return;
    setSaving(true);
    try {
      await latestProps.current.onAdd();
    } catch (error) {
      latestProps.current.onError(error);
    } finally {
      setSaving(false);
    }
  };

  const addColumn = () => {
    if (!latestProps.current.canEdit) return;
    const label = window.prompt("Column name");
    if (!label?.trim()) return;
    const id = `custom_${crypto.randomUUID().replace(/-/g, "")}`;
    latestProps.current.onColumnsChange([...latestProps.current.customColumns, { id, label: label.trim(), type: "text" }]);
  };

  const exportWorkbook = async (format: "csv" | "xlsx") => {
    const workbook = workbookRef.current;
    if (!workbook) {
      latestProps.current.onError(new Error("The financial worksheet is not ready. Reload the page and try again."));
      return;
    }
    setFileBusy(true);
    setFileMessage("");
    try {
      const snapshot = workbook.save();
      const worksheetData = snapshot.sheets[snapshot.sheetOrder[0]];
      const cells = worksheetData?.cellData ?? {};
      const rowIndices = Object.keys(cells).map(Number).filter((index) => index >= 0);
      const lastRow = Math.max(0, ...rowIndices);
      const lastColumn = Math.max(0, ...Object.values(cells).flatMap((row) => Object.keys(row ?? {}).map(Number)));
      const values = Array.from({ length: lastRow + 1 }, (_, rowIndex) =>
        Array.from({ length: lastColumn + 1 }, (_, columnIndex) => {
          const cell = cells[rowIndex]?.[columnIndex];
          return rowIndex > 0 && typeof cell?.f === "string" ? `=${cell.f.replace(/^=/, "")}` : String(cell?.v ?? "");
        }));
      if (format === "csv") {
        downloadFile("financial-worksheet.csv", values.map((row) => row.map(csvEscape).join(",")).join("\r\n"), "text/csv;charset=utf-8");
      } else {
        const ExcelJS = await import("exceljs");
        const fileWorkbook = new ExcelJS.Workbook();
        const fileSheet = fileWorkbook.addWorksheet("Financial worksheet");
        values.forEach((row, rowIndex) => {
          const excelRow = fileSheet.addRow(row);
          if (rowIndex === 0) excelRow.font = { bold: true };
          row.forEach((_value, columnIndex) => {
            const cell = cells[rowIndex]?.[columnIndex];
            if (typeof cell?.f === "string") {
              excelRow.getCell(columnIndex + 1).value = { formula: cell.f.replace(/^=/, ""), result: cell.v ?? undefined };
            }
          });
        });
        const buffer = await fileWorkbook.xlsx.writeBuffer();
        downloadFile("financial-worksheet.xlsx", buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      }
    } catch (error) {
      latestProps.current.onError(error);
    } finally {
      setFileBusy(false);
    }
  };

  const importWorkbook = async (file: File) => {
    setFileBusy(true);
    setFileMessage("");
    try {
      let importedRows: (string | number | boolean | null)[][];
      if (file.name.toLowerCase().endsWith(".csv")) {
        importedRows = parseCsv(await file.text());
      } else {
        const ExcelJS = await import("exceljs");
        const importedWorkbook = new ExcelJS.Workbook();
        await importedWorkbook.xlsx.load(await file.arrayBuffer());
        const importedSheet = importedWorkbook.worksheets[0];
        if (!importedSheet) throw new Error("The selected workbook has no worksheet to import.");
        importedRows = [];
        importedSheet.eachRow({ includeEmpty: false }, (row) => {
          const values: (string | number | boolean | null)[] = [];
          row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
            values[columnNumber - 1] = importedCellValue(cell.value);
          });
          importedRows[row.number - 1] = values;
        });
      }
      const header = importedRows[0] ?? [];
      const columnsByLabel = new Map(latestProps.current.columns.map((column) => [column.label.trim().toLowerCase(), column.key]));
      const columnKeys = header.map((value) => columnsByLabel.get(String(value ?? "").trim().toLowerCase()));
      if (!columnKeys.some(Boolean)) throw new Error("No worksheet headers matched the financial columns.");
      const workbook = workbookRef.current;
      const api = univerApiRef.current;
      if (!workbook || !api) throw new Error("The financial worksheet is not ready. Reload the page and try again.");
      const snapshot = workbook.save();
      const sheetData = snapshot.sheets[snapshot.sheetOrder[0]];
      const cells = sheetData?.cellData ?? {};
      const dataRowIndices = Object.keys(cells).map(Number)
        .filter((index) => index > 0 && getRowId(cells[index]))
        .sort((left, right) => left - right);
      const dataRows = importedRows.slice(1).filter((row) => row?.some((value) => value !== null && value !== ""));
      if (dataRows.length > dataRowIndices.length) {
        throw new Error(`The file has ${dataRows.length} data rows, but this sheet has only ${dataRowIndices.length} saved rows. Add rows before importing.`);
      }
      const sheet = api.getActiveWorkbook()?.getActiveSheet();
      if (!sheet) throw new Error("The active financial worksheet could not be found.");
      dataRows.forEach((row, dataIndex) => {
        columnKeys.forEach((key, columnIndex) => {
          if (!key || row[columnIndex] === undefined) return;
          const targetColumn = Object.entries(cells[0] ?? {}).find(([, cell]) => cell?.custom?.financeColumnKey === key);
          if (!targetColumn) return;
          const target = sheet.getRange(dataRowIndices[dataIndex], Number(targetColumn[0]));
          const value = row[columnIndex];
          if (typeof value === "string" && value.startsWith("=")) target.setFormula(value);
          else target.setValueForCell(value ?? "");
        });
      });
      setDirty(true);
      setFileMessage(`Imported ${dataRows.length} rows. Review the sheet, then save changes.`);
    } catch (error) {
      latestProps.current.onError(error);
    } finally {
      setFileBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return <section className="finance-univer-sheet">
    <div className="finance-univer-toolbar">
      <div>
        <strong>Financial worksheet</strong>
        <span role="status">{rows.length} rows and {columns.length} columns · {saving ? "Saving changes…" : dirty ? "Changes to save" : "All changes saved"}</span>
      </div>
      <div className="finance-univer-actions">
        <button
          type="button"
          className="button primary finance-fullscreen-toggle"
          aria-pressed={isFullscreen}
          onClick={() => void toggleFullscreen()}
        >
          {isFullscreen ? <Minimize2 size={17} aria-hidden="true" /> : <Maximize2 size={17} aria-hidden="true" />}
          {isFullscreen ? "Exit full screen" : "Full screen"}
        </button>
        <button type="button" className="button secondary" onClick={onBack}>Use standard table</button>
        <button type="button" className="button secondary" disabled={fileBusy} onClick={() => void exportWorkbook("csv")}>Export CSV</button>
        <button type="button" className="button secondary" disabled={fileBusy} onClick={() => void exportWorkbook("xlsx")}>{fileBusy ? "Working…" : "Export Excel"}</button>
        {canEdit && <>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx" aria-label="Import CSV or XLSX" className="finance-univer-file-input" disabled={fileBusy} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importWorkbook(file);
          }} />
          <button type="button" className="button secondary" disabled={fileBusy} onClick={() => fileInputRef.current?.click()}>Import spreadsheet</button>
        </>}
        {canEdit && <>
          <button type="button" className="button secondary" disabled={saving} onClick={() => void addRow()}>Add a row</button>
          <button type="button" className="button secondary" onClick={addColumn}>Add a column</button>
          <button type="button" className="button primary" disabled={saving || !dirty} onClick={() => void saveWorkbook()}>{saving ? "Saving…" : "Save changes"}</button>
        </>}
      </div>
    </div>
    {fileMessage && <p className="finance-univer-file-message" role="status">{fileMessage}</p>}
    <div id={hostId} ref={hostRef} className="finance-univer-host" role="region" aria-label="Financial worksheet grid" />
  </section>;
}
