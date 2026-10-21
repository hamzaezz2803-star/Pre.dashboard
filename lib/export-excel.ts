import type { AttendanceRow } from "./types";
import { formatDateFr, formatDateTimeFr, formatDuration } from "./dates";
import { downloadBlob, loadLogoPng } from "./export-utils";

const GREEN = "FF0F6B4F";
const GREEN_SOFT = "FFE8F3EE";
const ZEBRA = "FFF5F8F6";
const BORDER = "FFD5DDD9";
const WARN_BG = "FFFFF4E0";
const WARN_FG = "FF8A5A00";

/** Génère et télécharge le fichier Excel mis en forme (côté navigateur). */
export async function exportAttendanceToExcel(
  rows: AttendanceRow[],
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
    { header: "ID", width: 9 },
    { header: "Nom", width: 16 },
    { header: "Prénom", width: 16 },
    { header: "Prestation", width: 28 },
    { header: "Pointage min", width: 19 },
    { header: "Pointage max", width: 19 },
    { header: "Nb pointages", width: 13 },
    { header: "Zones", width: 38 },
    { header: "Horaire de pointage", width: 20 },
    { header: "Temps de présence", width: 18 },
    { header: "Absences", width: 11 },
    { header: "Dates d'absence", width: 42 },
  ];
  ws.columns = columns.map((c) => ({ width: c.width }));
  const lastCol = columns.length;

  // Bandeau de titre
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

  // En-têtes
  const headerRow = ws.getRow(5);
  headerRow.height = 24;
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.alignment = { vertical: "middle", horizontal: [6, 8, 9, 10].includes(i) ? "center" : "left", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: GREEN } } };
  });

  // Données
  const thin = { style: "thin" as const, color: { argb: BORDER } };
  rows.forEach((r, idx) => {
    const row = ws.getRow(6 + idx);
    const values: (string | number)[] = [
      r.id,
      r.nom,
      r.prenom,
      r.prestation,
      r.firstPunch ? formatDateTimeFr(r.firstPunch) : "Aucun",
      r.lastPunch ? formatDateTimeFr(r.lastPunch) : "Aucun",
      r.punchCount,
      r.zones.join(", ") || "Aucune",
      r.eventTime || "-",
      formatDuration(r.presenceMinutes),
      r.absenceCount,
      r.absenceDates.map(formatDateFr).join(", "),
    ];
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF14201B" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: [4, 5, 6, 8, 9, 10].includes(i) ? "center" : "left",
        wrapText: i === 7 || i === 11,
      };
      cell.border = { bottom: thin, left: thin, right: thin };
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
    row.height = r.zones.length > 3 || r.absenceCount > 4 ? 32 : 20;
    if (r.punchCount === 0) {
      [5, 6].forEach((c) => (row.getCell(c).font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF8A948F" } }));
    }
    if (r.absenceCount > 0) {
      const c = row.getCell(11);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WARN_BG } };
      c.font = { name: "Calibri", size: 11, bold: true, color: { argb: WARN_FG } };
    }
  });

  // Ligne de totaux
  const totalRow = ws.getRow(6 + rows.length);
  totalRow.height = 22;
  const totalPresence = rows.reduce((s, r) => s + r.presenceMinutes, 0);
  const totals: Record<number, string | number> = {
    1: "Total",
    7: rows.reduce((s, r) => s + r.punchCount, 0),
    10: formatDuration(totalPresence),
    11: rows.reduce((s, r) => s + r.absenceCount, 0),
  };
  for (let c = 1; c <= lastCol; c++) {
    const cell = totalRow.getCell(c);
    if (totals[c] !== undefined) cell.value = totals[c];
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: GREEN } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_SOFT } };
    cell.alignment = { vertical: "middle", horizontal: [7, 9, 10, 11].includes(c) ? "center" : "left" };
    cell.border = { top: { style: "medium", color: { argb: GREEN } } };
  }

  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + rows.length, column: lastCol } };

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `pointages_${from}_${to}.xlsx`,
  );
}
