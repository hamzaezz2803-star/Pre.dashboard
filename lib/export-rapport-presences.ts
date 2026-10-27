import { downloadBlob, loadLogoPng } from "./export-utils";

export interface RapportPresenceRow {
  emp_id: string;
  nom_employe: string;
  heure_pointage: string;
  horaire_affecte: string;
  date_service?: string;
  departement?: string;
}

const GREEN_OCP = "FF0F6B4F";
const BORDER_COLOR = "FFD5DDD9";
const ZEBRA_COLOR = "FFF8FAF9";

/**
 * Génère et télécharge le fichier Excel du Rapport des Présences aux couleurs officielles OCP.
 */
export async function exportRapportPresenceExcel(
  rows: RapportPresenceRow[],
  debut: string,
  fin: string
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OCP Phosboucraâ";

  const ws = wb.addWorksheet("Rapport des Présences", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: true }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Définition des colonnes comme dans l'exemple
  ws.columns = [
    { header: "ID", key: "emp_id", width: 14 },
    { header: "Nom Employé", key: "nom_employe", width: 32 },
    { header: "Heure de Pointage", key: "heure_pointage", width: 24 },
    { header: "Horaire Affecté", key: "horaire_affecte", width: 28 },
  ];

  // En-tête principal OCP Phosboucraâ
  ws.getRow(1).height = 30;
  ws.mergeCells(1, 1, 1, 4);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "OCP Phosboucraâ  ·  Rapport des Présences";
  titleCell.font = { name: "Arial", size: 15, bold: true, color: { argb: GREEN_OCP } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  // Sous-titre Période
  ws.getRow(2).height = 20;
  ws.mergeCells(2, 1, 2, 4);
  const periodCell = ws.getCell(2, 1);
  periodCell.value = `Période : Du ${debut || "Début"} Au ${fin || "Fin"}  ·  Total : ${rows.length} enregistrement(s)`;
  periodCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF475569" } };
  periodCell.alignment = { vertical: "middle", horizontal: "left" };

  // Ligne vide
  ws.getRow(3).height = 8;

  // Ligne d'en-tête du tableau (Ligne 4)
  const headerRow = ws.getRow(4);
  headerRow.height = 26;
  headerRow.values = ["ID", "Nom Employé", "Heure de Pointage", "Horaire Affecté"];

  headerRow.eachCell((cell, colNum) => {
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GREEN_OCP },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: colNum === 1 || colNum === 3 ? "center" : "left",
    };
    cell.border = {
      top: { style: "thin", color: { argb: BORDER_COLOR } },
      bottom: { style: "medium", color: { argb: "FF094A36" } },
      left: { style: "thin", color: { argb: BORDER_COLOR } },
      right: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  });

  // Ajout des lignes de données
  rows.forEach((r, idx) => {
    const row = ws.addRow([r.emp_id, r.nom_employe, r.heure_pointage || "--", r.horaire_affecte]);
    row.height = 22;

    const isEven = idx % 2 === 0;
    const bgArgb = isEven ? "FFFFFFFF" : ZEBRA_COLOR;

    row.eachCell((cell, colNum) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF0F172A" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bgArgb },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNum === 1 || colNum === 3 ? "center" : "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      if (colNum === 1) {
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: GREEN_OCP } };
      }
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const filename = `Rapport_Presences_${debut || "debut"}_${fin || "fin"}.xlsx`;
  downloadBlob(blob, filename);
}

/**
 * Génère et télécharge le fichier PDF du Rapport des Présences aux couleurs OCP.
 */
export async function exportRapportPresencePdf(
  rows: RapportPresenceRow[],
  debut: string,
  fin: string
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 36;
  const greenOcp: [number, number, number] = [15, 107, 79]; // #0f6b4f

  // Logo OCP si disponible
  const logo = await loadLogoPng();
  let textX = margin;
  if (logo) {
    const h = 38;
    const w = h * (logo.width / logo.height);
    doc.addImage(logo.dataUrl, "PNG", margin, 24, w, h);
    textX = margin + w + 14;
  }

  // En-tête : Titre vert OCP
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...greenOcp);
  doc.text("Rapport des Présences", textX, 42);

  // Sous-titre Période et Métadonnées
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Période : Du ${debut || "Début"} Au ${fin || "Fin"}  ·  Édité le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    textX,
    58
  );
  doc.text(`Total : ${rows.length} pointage(s) enregistré(s)`, textX, 70);

  // Ligne de séparation verte
  doc.setDrawColor(...greenOcp);
  doc.setLineWidth(1.2);
  doc.line(margin, 78, doc.internal.pageSize.getWidth() - margin, 78);

  // Données du tableau
  const tableData = rows.map((r) => [
    r.emp_id,
    r.nom_employe,
    r.heure_pointage || "--",
    r.horaire_affecte,
  ]);

  autoTable(doc, {
    startY: 88,
    margin: { left: margin, right: margin, bottom: 40 },
    head: [["ID", "Nom Employé", "Heure de Pointage", "Horaire Affecté"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: greenOcp,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      halign: "left",
      cellPadding: 6,
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 50, fontStyle: "bold" },
      1: { halign: "left", cellWidth: "auto" },
      2: { halign: "center", cellWidth: 120 },
      3: { halign: "left", cellWidth: 140 },
    },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 5,
      lineColor: [213, 221, 217],
      lineWidth: 0.5,
      valign: "middle",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 249],
    },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(
        `OCP Phosboucraâ  |  Page ${data.pageNumber}`,
        margin,
        doc.internal.pageSize.getHeight() - 20
      );
    },
  });

  const filename = `Rapport_Presences_${debut || "debut"}_${fin || "fin"}.pdf`;
  doc.save(filename);
}
