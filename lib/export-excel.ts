import type { PresenceRow } from "./types";
import { formatDateFr, formatDurationLong } from "./dates";
import { downloadBlob, loadLogoPng } from "./export-utils";
import { formatStatut } from "./status";

const GREEN = "FF0F6B4F";
const GREEN_SOFT = "FFE8F3EE";
const ZEBRA = "FFF5F8F6";
const BORDER = "FFD5DDD9";

/** Génère et télécharge le fichier Excel (mêmes colonnes que le tableau, lignes filtrées). */
export async function exportAttendanceToExcel(
  rows: PresenceRow[],
  from: string,
  to: string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Suivi des pointages";
  const ws = wb.addWorksheet("Pointages", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const columns = [
    { header: "ID", width: 10 },
    { header: "Nom", width: 18 },
    { header: "Prénom", width: 18 },
    { header: "Prestation", width: 24 },
    { header: "Date", width: 13 },
    { header: "1er pointage", width: 14 },
    { header: "Dernier pointage", width: 17 },
    { header: "Nombre de pointages", width: 20 },
    { header: "Temps de présence", width: 19 },
    { header: "Statut", width: 16 },
  ];
  const centered = [4, 5, 6, 7, 8];
  ws.columns = columns.map((c) => ({ width: c.width }));
  const lastCol = columns.length;

  for (let r = 1; r <= 3; r++) ws.getRow(r).height = r === 1 ? 26 : 18;
  ws.mergeCells(1, 3, 1, lastCol);
  ws.mergeCells(2, 3, 2, lastCol);
  ws.mergeCells(3, 3, 3, lastCol);
  const title = ws.getCell(1, 3);
  title.value = "Pointages du personnel";
  title.font = { name: "Calibri", size: 18, bold: true, color: { argb: GREEN } };
  title.alignment = { vertical: "middle" };
  const period = ws.getCell(2, 3);
  period.value = `Période : du ${formatDateFr(from)} au ${formatDateFr(to)}`;
  period.font = { name: "Calibri", size: 11, color: { argb: "FF14201B" } };
  const generated = ws.getCell(3, 3);
  generated.value = `Généré le ${new Date().toLocaleString("fr-FR")} · ${rows.length} ligne${rows.length > 1 ? "s" : ""}`;
  generated.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF55645D" } };

  const logo = await loadLogoPng();
  if (logo) {
    const id = wb.addImage({ base64: logo.dataUrl, extension: "png" });
    const h = 62;
    ws.addImage(id, { tl: { col: 0.15, row: 0.1 }, ext: { width: h * (logo.width / logo.height), height: h } });
  }

  const headerRow = ws.getRow(5);
  headerRow.height = 24;
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.alignment = { vertical: "middle", horizontal: centered.includes(i) ? "center" : "left", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: GREEN } } };
  });

  const thin = { style: "thin" as const, color: { argb: BORDER } };
  rows.forEach((r, idx) => {
    const row = ws.getRow(6 + idx);
    const values: (string | number)[] = [
      r.empCode,
      r.lastName,
      r.firstName,
      r.deptName,
      formatDateFr(r.jour),
      r.premierPointage || "-",
      r.dernierPointage || "-",
      r.nbPointages,
      formatDurationLong(r.tempsPresenceMin),
      formatStatut(r.statutPresence, r.nbPointages),
    ];
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF14201B" } };
      cell.alignment = { vertical: "middle", horizontal: centered.includes(i) ? "center" : "left" };
      cell.border = { bottom: thin, left: thin, right: thin };
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
    row.height = 20;
  });

  // Ligne de totaux calculée depuis les lignes exportées
  const totalRow = ws.getRow(6 + rows.length);
  totalRow.height = 22;
  const totals: Record<number, string | number> = {
    1: "Total",
    8: rows.reduce((s, r) => s + r.nbPointages, 0),
    9: formatDurationLong(rows.reduce((s, r) => s + (r.tempsPresenceMin || 0), 0), "0h 00min"),
  };
  for (let c = 1; c <= lastCol; c++) {
    const cell = totalRow.getCell(c);
    if (totals[c] !== undefined) cell.value = totals[c];
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: GREEN } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_SOFT } };
    cell.alignment = { vertical: "middle", horizontal: [8, 9].includes(c) ? "center" : "left" };
    cell.border = { top: { style: "medium", color: { argb: GREEN } } };
  }

  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + rows.length, column: lastCol } };

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `pointages_${from}_${to}.xlsx`,
  );
}
