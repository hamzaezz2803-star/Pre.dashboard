import { formatDateFr, formatDurationLong } from "./dates";
import { downloadBlob, loadLogoPng } from "./export-utils";

const GREEN_OCP = "FF0F6B4F";
const GREEN_BG = "FFE8F3EE";
const ZEBRA_ROW = "FFF8FAF9";
const BORDER_COLOR = "FFD5DDD9";

export interface SuiviExportRow {
  empCode: string | number;
  nomComplet: string;
  deptName: string;
  dateService: string;
  horaire?: { code?: string; libelle?: string; heureDebut?: string; heureFin?: string; estNuit?: boolean };
  dateEntree?: string;
  heureEntree?: string | null;
  dateSortie?: string;
  heureSortie?: string | null;
  dureeMinutes: number;
  statut: string;
  isNightShift?: boolean;
}

export interface SuiviStats {
  total: number;
  presents: number;
  retards: number;
  nuits: number;
  incomplets: number;
}

export interface AnomalieExportItem {
  id: string;
  empCode: string | number;
  nomComplet: string;
  deptName: string;
  dateService: string;
  horaire: string;
  heureEntree: string | null;
  heureSortie: string | null;
  typeAnomalie: "retard" | "sortie_manquante" | "absence" | "horaire_non_reconnu";
  libelleAnomalie: string;
  gravite: "haute" | "moyenne" | "faible";
  explication: string;
  actionRecommandee: string;
}

export interface AnomaliesStats {
  total: number;
  retards: number;
  sortiesManquantes: number;
  absences: number;
  horairesNonReconnus: number;
}

/**
 * 📊 EXPORT EXCEL : Suivi des présences avec affectation horaire
 */
export async function exportHorairesSuiviToExcel(
  rows: SuiviExportRow[],
  stats: SuiviStats,
  from: string,
  to: string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OCP Phosboucraâ - Portail Pointage";

  const ws = wb.addWorksheet("Suivi Présences Horaires", {
    views: [{ state: "frozen", ySplit: 8, showGridLines: true }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Définition des largeurs de colonnes
  const columnsDef = [
    { header: "Matricule", width: 14, align: "center" as const },
    { header: "Personnel (Nom & Prénom)", width: 28, align: "left" as const },
    { header: "Département / Service", width: 26, align: "left" as const },
    { header: "Date de service", width: 16, align: "center" as const },
    { header: "Horaire affecté", width: 20, align: "center" as const },
    { header: "Entrée réelle", width: 15, align: "center" as const },
    { header: "Sortie réelle", width: 16, align: "center" as const },
    { header: "Durée présence", width: 16, align: "center" as const },
    { header: "Statut d'affectation", width: 20, align: "center" as const },
  ];
  ws.columns = columnsDef.map((c) => ({ width: c.width }));
  const lastCol = columnsDef.length;

  // 1. Logo OCP
  const logo = await loadLogoPng();
  if (logo) {
    const id = wb.addImage({ base64: logo.dataUrl, extension: "png" });
    const h = 54;
    ws.addImage(id, {
      tl: { col: 0.15, row: 0.1 },
      ext: { width: h * (logo.width / logo.height), height: h },
    });
  }

  // 2. Bloc En-tête (Lignes 1 à 3)
  for (let r = 1; r <= 3; r++) ws.getRow(r).height = r === 1 ? 24 : 17;
  ws.mergeCells(1, 3, 1, lastCol);
  ws.mergeCells(2, 3, 2, lastCol);
  ws.mergeCells(3, 3, 3, lastCol);

  const title = ws.getCell(1, 3);
  title.value = "OCP PHOSBOUCRAÂ — SUIVI DES PRÉSENCES ET AFFECTATION HORAIRE";
  title.font = { name: "Calibri", size: 15, bold: true, color: { argb: GREEN_OCP } };
  title.alignment = { vertical: "middle" };

  const period = ws.getCell(2, 3);
  period.value = `Période d'analyse : du ${formatDateFr(from)} au ${formatDateFr(to)} · Extraction certifiée ZKBio CVAccess`;
  period.font = { name: "Calibri", size: 10.5, color: { argb: "FF2D3748" } };

  const meta = ws.getCell(3, 3);
  meta.value = `Document généré le ${new Date().toLocaleString("fr-FR")} · Total : ${rows.length} enregistrements`;
  meta.font = { name: "Calibri", size: 9.5, italic: true, color: { argb: "FF718096" } };

  // 3. Bloc Indicateurs Clés (KPIs) - Lignes 5 et 6
  ws.getRow(4).height = 10; // Espacement
  const kpiRow1 = ws.getRow(5);
  const kpiRow2 = ws.getRow(6);
  kpiRow1.height = 16;
  kpiRow2.height = 20;

  const kpis = [
    { label: "Total Services", val: stats.total, color: "FF0F6B4F", bg: "FFE8F3EE" },
    { label: "Présents", val: stats.presents, color: "FF166534", bg: "FFDCFCE7" },
    { label: "Retards", val: stats.retards, color: "FFB45309", bg: "FFFEF3C7" },
    { label: "Postes de Nuit (J+1)", val: stats.nuits, color: "FF4338CA", bg: "FFE0E7FF" },
    { label: "Pointages Incomplets", val: stats.incomplets, color: "FFC2410C", bg: "FFFFEDD5" },
  ];

  kpis.forEach((kpi, idx) => {
    const colIdx = idx * 2 === 8 ? 9 : idx * 2 + 1; // Distribue sur les colonnes
    const cellTop = kpiRow1.getCell(colIdx);
    const cellVal = kpiRow2.getCell(colIdx);

    cellTop.value = kpi.label.toUpperCase();
    cellTop.font = { name: "Calibri", size: 8.5, bold: true, color: { argb: kpi.color } };
    cellTop.alignment = { horizontal: "center", vertical: "middle" };
    cellTop.fill = { type: "pattern", pattern: "solid", fgColor: { argb: kpi.bg } };

    cellVal.value = kpi.val;
    cellVal.font = { name: "Calibri", size: 13, bold: true, color: { argb: kpi.color } };
    cellVal.alignment = { horizontal: "center", vertical: "middle" };
    cellVal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: kpi.bg } };
  });

  // 4. Ligne d'en-tête du tableau (Ligne 8)
  ws.getRow(7).height = 10; // Espacement
  const headerRow = ws.getRow(8);
  headerRow.height = 26;

  columnsDef.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_OCP } };
    cell.alignment = { vertical: "middle", horizontal: col.align, wrapText: true };
    cell.border = {
      top: { style: "medium", color: { argb: GREEN_OCP } },
      bottom: { style: "medium", color: { argb: GREEN_OCP } },
      left: { style: "thin", color: { argb: "33FFFFFF" } },
      right: { style: "thin", color: { argb: "33FFFFFF" } },
    };
  });

  // 5. Lignes de données
  const thinBorder = {
    top: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    bottom: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    left: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    right: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  };

  rows.forEach((r, idx) => {
    const row = ws.getRow(9 + idx);
    row.height = 21;
    const isEven = idx % 2 === 1;

    const values = [
      r.empCode,
      r.nomComplet,
      r.deptName,
      formatDateFr(r.dateService),
      r.horaire?.libelle || "Non défini",
      r.heureEntree || "-",
      r.heureSortie ? `${r.heureSortie}${r.isNightShift ? " (+1j)" : ""}` : "-",
      formatDurationLong(r.dureeMinutes),
      r.statut,
    ];

    values.forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val;
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF1A202C" } };
      cell.alignment = { vertical: "middle", horizontal: columnsDef[i].align };
      cell.border = thinBorder;

      if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_ROW } };
      }

      // Stylisation badge sur le statut
      if (i === 8) {
        const s = String(val).toLowerCase();
        let sColor = "FF166534";
        let sBg = "FFDCFCE7";
        if (s.includes("retard")) {
          sColor = "FF92400E";
          sBg = "FFFEF3C7";
        } else if (s.includes("incomplet")) {
          sColor = "FF9A3412";
          sBg = "FFFFEDD5";
        } else if (s.includes("absent")) {
          sColor = "FF991B1B";
          sBg = "FFFEE2E2";
        } else if (s.includes("non défini")) {
          sColor = "FF475569";
          sBg = "FFF1F5F9";
        }
        cell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: sColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sBg } };
      }

      // Mise en valeur de l'horaire de nuit
      if (i === 4 && r.isNightShift) {
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF4338CA" } };
      }
    });
  });

  // 6. Ligne de synthèse finale
  const totalRowIndex = 9 + rows.length;
  const totalRow = ws.getRow(totalRowIndex);
  totalRow.height = 24;

  totalRow.getCell(1).value = "TOTAL";
  totalRow.getCell(1).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  totalRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  totalRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_OCP } };

  ws.mergeCells(totalRowIndex, 2, totalRowIndex, 7);
  const totalLabel = totalRow.getCell(2);
  totalLabel.value = `Effectif exporté : ${rows.length} lignes (${stats.presents} présents, ${stats.retards} retards, ${stats.nuits} postes de nuit)`;
  totalLabel.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  totalLabel.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  totalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_OCP } };

  const totalMinutes = rows.reduce((acc, r) => acc + (r.dureeMinutes || 0), 0);
  const totalDureeCell = totalRow.getCell(8);
  totalDureeCell.value = formatDurationLong(totalMinutes);
  totalDureeCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  totalDureeCell.alignment = { horizontal: "center", vertical: "middle" };
  totalDureeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_OCP } };

  const totalStatusCell = totalRow.getCell(9);
  totalStatusCell.value = "100%";
  totalStatusCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  totalStatusCell.alignment = { horizontal: "center", vertical: "middle" };
  totalStatusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_OCP } };

  // Téléchargement
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `suivi_presences_horaires_${from}_${to}.xlsx`
  );
}

/**
 * 📄 EXPORT PDF : Suivi des présences avec affectation horaire
 */
export async function exportHorairesSuiviToPdf(
  rows: SuiviExportRow[],
  stats: SuiviStats,
  from: string,
  to: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const green: [number, number, number] = [15, 107, 79];

  // 1. Logo OCP
  const logo = await loadLogoPng();
  let textX = margin;
  if (logo) {
    const h = 42;
    const w = h * (logo.width / logo.height);
    doc.addImage(logo.dataUrl, "PNG", margin, 20, w, h);
    textX = margin + w + 14;
  }

  // 2. Titre et Métadonnées
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...green);
  doc.text("OCP PHOSBOUCRAÂ — SUIVI DES PRÉSENCES & HORAIRES", textX, 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(60, 70, 66);
  doc.text(`Période du ${formatDateFr(from)} au ${formatDateFr(to)}  ·  Extraction certifiée ZKBio CVAccess`, textX, 50);
  doc.text(
    `Document officiel généré le ${new Date().toLocaleString("fr-FR")}  ·  ${rows.length} enregistrements analysés`,
    textX,
    62
  );

  // 3. Encadré KPI Synthétique
  doc.setFillColor(245, 248, 246);
  doc.setDrawColor(213, 221, 217);
  doc.roundedRect(margin, 70, pageW - margin * 2, 36, 4, 4, "FD");

  const kpiItems = [
    { label: "Total Services", val: `${stats.total}` },
    { label: "Présents", val: `${stats.presents}` },
    { label: "Retards", val: `${stats.retards}` },
    { label: "Services de Nuit (J+1)", val: `${stats.nuits}` },
    { label: "Pointages Incomplets", val: `${stats.incomplets}` },
  ];

  const colW = (pageW - margin * 2) / kpiItems.length;
  kpiItems.forEach((kpi, idx) => {
    const x = margin + idx * colW + colW / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...green);
    doc.text(kpi.val, x, 85, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(80, 90, 85);
    doc.text(kpi.label, x, 98, { align: "center" });
  });

  // 4. Données du tableau
  const body = rows.map((r) => [
    String(r.empCode),
    r.nomComplet,
    r.deptName,
    formatDateFr(r.dateService),
    r.horaire?.libelle || "Non défini",
    r.heureEntree || "-",
    r.heureSortie ? `${r.heureSortie}${r.isNightShift ? " (+1j)" : ""}` : "-",
    formatDurationLong(r.dureeMinutes),
    r.statut,
  ]);

  autoTable(doc, {
    startY: 114,
    margin: { left: margin, right: margin, bottom: 32 },
    head: [["ID", "Personnel", "Département", "Date Service", "Horaire Affecté", "Entrée", "Sortie", "Durée", "Statut"]],
    body,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      lineColor: [220, 226, 223],
      lineWidth: 0.4,
      valign: "middle",
    },
    headStyles: {
      fillColor: green,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 249],
    },
    columnStyles: {
      0: { cellWidth: 38, halign: "center" },
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "center" },
      7: { halign: "center" },
      8: { halign: "center" },
    },
    didDrawPage: () => {
      const pageNum = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 125);
      doc.text("OCP Phosboucraâ — Système de gestion des présences et affectations horaires", margin, pageH - 14);
      doc.text(`Page ${pageNum}`, pageW - margin, pageH - 14, { align: "right" });
    },
  });

  downloadBlob(doc.output("blob"), `suivi_presences_horaires_${from}_${to}.pdf`);
}

/**
 * ⚠️ EXPORT EXCEL : Diagnostic des anomalies de pointage
 */
export async function exportHorairesAnomaliesToExcel(
  anomalies: AnomalieExportItem[],
  stats: AnomaliesStats,
  from: string,
  to: string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OCP Phosboucraâ - Portail Pointage";

  const ws = wb.addWorksheet("Anomalies de Pointage", {
    views: [{ state: "frozen", ySplit: 8, showGridLines: true }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const columnsDef = [
    { header: "Matricule", width: 14, align: "center" as const },
    { header: "Personnel (Nom & Prénom)", width: 28, align: "left" as const },
    { header: "Département", width: 26, align: "left" as const },
    { header: "Date de service", width: 16, align: "center" as const },
    { header: "Type d'anomalie", width: 24, align: "left" as const },
    { header: "Gravité", width: 14, align: "center" as const },
    { header: "Diagnostic / Explication", width: 42, align: "left" as const },
    { header: "Action recommandée", width: 36, align: "left" as const },
  ];
  ws.columns = columnsDef.map((c) => ({ width: c.width }));
  const lastCol = columnsDef.length;

  const logo = await loadLogoPng();
  if (logo) {
    const id = wb.addImage({ base64: logo.dataUrl, extension: "png" });
    const h = 54;
    ws.addImage(id, {
      tl: { col: 0.15, row: 0.1 },
      ext: { width: h * (logo.width / logo.height), height: h },
    });
  }

  for (let r = 1; r <= 3; r++) ws.getRow(r).height = r === 1 ? 24 : 17;
  ws.mergeCells(1, 3, 1, lastCol);
  ws.mergeCells(2, 3, 2, lastCol);
  ws.mergeCells(3, 3, 3, lastCol);

  const title = ws.getCell(1, 3);
  title.value = "OCP PHOSBOUCRAÂ — RAPPORT D'ANOMALIES DE POINTAGE";
  title.font = { name: "Calibri", size: 15, bold: true, color: { argb: "FFB42318" } };
  title.alignment = { vertical: "middle" };

  const period = ws.getCell(2, 3);
  period.value = `Période du ${formatDateFr(from)} au ${formatDateFr(to)} · Contrôle d'assiduité et conformité horaire`;
  period.font = { name: "Calibri", size: 10.5, color: { argb: "FF2D3748" } };

  const meta = ws.getCell(3, 3);
  meta.value = `Document généré le ${new Date().toLocaleString("fr-FR")} · Total : ${anomalies.length} anomalies identifiées`;
  meta.font = { name: "Calibri", size: 9.5, italic: true, color: { argb: "FF718096" } };

  // KPI Block
  ws.getRow(4).height = 10;
  const kpiRow1 = ws.getRow(5);
  const kpiRow2 = ws.getRow(6);
  kpiRow1.height = 16;
  kpiRow2.height = 20;

  const kpis = [
    { label: "Total Anomalies", val: stats.total, color: "FFB42318", bg: "FFFEE2E2" },
    { label: "Retards", val: stats.retards, color: "FFB45309", bg: "FFFEF3C7" },
    { label: "Sorties Manquantes", val: stats.sortiesManquantes, color: "FFC2410C", bg: "FFFFEDD5" },
    { label: "Absences", val: stats.absences, color: "FF991B1B", bg: "FFFEE2E2" },
    { label: "Horaires Non Reconnus", val: stats.horairesNonReconnus, color: "FF475569", bg: "FFF1F5F9" },
  ];

  kpis.forEach((kpi, idx) => {
    const colIdx = idx < 4 ? idx * 2 + 1 : 8;
    const cellTop = kpiRow1.getCell(colIdx);
    const cellVal = kpiRow2.getCell(colIdx);

    cellTop.value = kpi.label.toUpperCase();
    cellTop.font = { name: "Calibri", size: 8.5, bold: true, color: { argb: kpi.color } };
    cellTop.alignment = { horizontal: "center", vertical: "middle" };
    cellTop.fill = { type: "pattern", pattern: "solid", fgColor: { argb: kpi.bg } };

    cellVal.value = kpi.val;
    cellVal.font = { name: "Calibri", size: 13, bold: true, color: { argb: kpi.color } };
    cellVal.alignment = { horizontal: "center", vertical: "middle" };
    cellVal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: kpi.bg } };
  });

  // Header row
  ws.getRow(7).height = 10;
  const headerRow = ws.getRow(8);
  headerRow.height = 26;

  columnsDef.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB42318" } };
    cell.alignment = { vertical: "middle", horizontal: col.align, wrapText: true };
    cell.border = {
      top: { style: "medium", color: { argb: "FFB42318" } },
      bottom: { style: "medium", color: { argb: "FFB42318" } },
    };
  });

  const thinBorder = {
    top: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    bottom: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    left: { style: "thin" as const, color: { argb: BORDER_COLOR } },
    right: { style: "thin" as const, color: { argb: BORDER_COLOR } },
  };

  anomalies.forEach((a, idx) => {
    const row = ws.getRow(9 + idx);
    row.height = 22;
    const isEven = idx % 2 === 1;

    const values = [
      a.empCode,
      a.nomComplet,
      a.deptName,
      formatDateFr(a.dateService),
      a.libelleAnomalie,
      a.gravite === "haute" ? "CRITIQUE" : a.gravite === "moyenne" ? "MOYENNE" : "À VÉRIFIER",
      a.explication,
      a.actionRecommandee,
    ];

    values.forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val;
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF1A202C" } };
      cell.alignment = { vertical: "middle", horizontal: columnsDef[i].align };
      cell.border = thinBorder;

      if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_ROW } };
      }

      // Gravité badge
      if (i === 5) {
        let gColor = "FF991B1B";
        let gBg = "FFFEE2E2";
        if (a.gravite === "moyenne") {
          gColor = "FF92400E";
          gBg = "FFFEF3C7";
        } else if (a.gravite === "faible") {
          gColor = "FF475569";
          gBg = "FFF1F5F9";
        }
        cell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: gColor } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gBg } };
      }
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `anomalies_pointage_${from}_${to}.xlsx`
  );
}

/**
 * 📄 EXPORT PDF : Diagnostic des anomalies de pointage
 */
export async function exportHorairesAnomaliesToPdf(
  anomalies: AnomalieExportItem[],
  stats: AnomaliesStats,
  from: string,
  to: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const redTitle: [number, number, number] = [180, 35, 24];

  const logo = await loadLogoPng();
  let textX = margin;
  if (logo) {
    const h = 42;
    const w = h * (logo.width / logo.height);
    doc.addImage(logo.dataUrl, "PNG", margin, 20, w, h);
    textX = margin + w + 14;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...redTitle);
  doc.text("OCP PHOSBOUCRAÂ — DIAGNOSTIC DES ANOMALIES DE POINTAGE", textX, 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(60, 70, 66);
  doc.text(`Période du ${formatDateFr(from)} au ${formatDateFr(to)}  ·  Contrôle de conformité et régularisations RH`, textX, 50);
  doc.text(
    `Document confidentiel généré le ${new Date().toLocaleString("fr-FR")}  ·  ${anomalies.length} anomalies identifiées`,
    textX,
    62
  );

  // KPI Block
  doc.setFillColor(254, 243, 242);
  doc.setDrawColor(245, 200, 195);
  doc.roundedRect(margin, 70, pageW - margin * 2, 36, 4, 4, "FD");

  const kpis = [
    { label: "Total Anomalies", val: `${stats.total}` },
    { label: "Retards", val: `${stats.retards}` },
    { label: "Sorties Manquantes", val: `${stats.sortiesManquantes}` },
    { label: "Absences", val: `${stats.absences}` },
    { label: "Horaires Non Reconnus", val: `${stats.horairesNonReconnus}` },
  ];

  const colW = (pageW - margin * 2) / kpis.length;
  kpis.forEach((kpi, idx) => {
    const x = margin + idx * colW + colW / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...redTitle);
    doc.text(kpi.val, x, 85, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 80, 80);
    doc.text(kpi.label, x, 98, { align: "center" });
  });

  const body = anomalies.map((a) => [
    String(a.empCode),
    a.nomComplet,
    a.deptName,
    formatDateFr(a.dateService),
    a.libelleAnomalie,
    a.gravite === "haute" ? "Critique" : a.gravite === "moyenne" ? "Moyenne" : "À vérifier",
    a.explication,
    a.actionRecommandee,
  ]);

  autoTable(doc, {
    startY: 114,
    margin: { left: margin, right: margin, bottom: 32 },
    head: [["ID", "Personnel", "Département", "Date", "Anomalie", "Gravité", "Diagnostic / Explication", "Action Recommandée"]],
    body,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      lineColor: [230, 220, 220],
      lineWidth: 0.4,
      valign: "middle",
    },
    headStyles: {
      fillColor: redTitle,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: [254, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 38, halign: "center" },
      3: { halign: "center" },
      5: { halign: "center" },
    },
    didDrawPage: () => {
      const pageNum = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 125);
      doc.text("OCP Phosboucraâ — Registre de conformité et anomalies de pointage", margin, pageH - 14);
      doc.text(`Page ${pageNum}`, pageW - margin, pageH - 14, { align: "right" });
    },
  });

  downloadBlob(doc.output("blob"), `anomalies_pointage_${from}_${to}.pdf`);
}
