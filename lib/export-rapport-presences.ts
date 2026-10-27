import { downloadBlob } from "./export-utils";

export interface RapportPresenceRow {
  emp_id: string;
  nom_employe: string;
  heure_pointage: string;
  horaire_affecte: string;
  date_service?: string;
  departement?: string;
}

/**
 * Génère et télécharge le fichier Excel du Rapport des Présences.
 */
export async function exportRapportPresenceExcel(
  rows: RapportPresenceRow[],
  debut: string,
  fin: string
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OCP Phosboucraâ - Pointage System";

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

  // En-tête principal stylisé
  ws.getRow(1).height = 30;
  ws.mergeCells(1, 1, 1, 4);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "PS  ·  Rapport des Présences";
  titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FF003566" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  // Sous-titre Période
  ws.getRow(2).height = 20;
  ws.mergeCells(2, 1, 2, 4);
  const periodCell = ws.getCell(2, 1);
  periodCell.value = `Période : Du ${debut || "Début"} Au ${fin || "Fin"}  ·  Total : ${rows.length} pointage(s)`;
  periodCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF475569" } };
  periodCell.alignment = { vertical: "middle", horizontal: "left" };

  // Ligne vide
  ws.getRow(3).height = 10;

  // Ligne d'en-tête du tableau (Ligne 4)
  const headerRow = ws.getRow(4);
  headerRow.height = 26;
  headerRow.values = ["ID", "Nom Employé", "Heure de Pointage", "Horaire Affecté"];

  headerRow.eachCell((cell, colNum) => {
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF004E92" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: colNum === 1 || colNum === 3 ? "center" : "left",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF002855" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });

  // Ajout des lignes de données
  rows.forEach((r, idx) => {
    const row = ws.addRow([r.emp_id, r.nom_employe, r.heure_pointage || "--", r.horaire_affecte]);
    row.height = 22;

    const isEven = idx % 2 === 0;
    const bgArgb = isEven ? "FFFFFFFF" : "FFF1F5F9";

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
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF004E92" } };
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
 * Génère et télécharge le fichier PDF du Rapport des Présences.
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

  // En-tête : Titre stylisé bleu
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(0, 53, 102); // #003566
  doc.text("PS  ·  Rapport des Présences", margin, 45);

  // Sous-titre Période et Métadonnées
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Période : Du ${debut || "Début"} Au ${fin || "Fin"}  ·  Édité le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    margin,
    62
  );
  doc.text(`Total : ${rows.length} enregistrement(s) trouvé(s)`, margin, 75);

  // Ligne de séparation élégante
  doc.setDrawColor(0, 78, 146);
  doc.setLineWidth(1.5);
  doc.line(margin, 82, doc.internal.pageSize.getWidth() - margin, 82);

  // Données du tableau
  const tableData = rows.map((r) => [
    r.emp_id,
    r.nom_employe,
    r.heure_pointage || "--",
    r.horaire_affecte,
  ]);

  autoTable(doc, {
    startY: 92,
    margin: { left: margin, right: margin, bottom: 40 },
    head: [["ID", "Nom Employé", "Heure de Pointage", "Horaire Affecté"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [0, 78, 146], // #004e92
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
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      valign: "middle",
    },
    alternateRowStyles: {
      fillColor: [241, 245, 249],
    },
    didDrawPage: (data) => {
      // Pied de page numéroté
      const pageNumber = doc.internal.pages.length - 1;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(
        `OCP Pointage - Phosboucraâ  |  Page ${data.pageNumber}`,
        margin,
        doc.internal.pageSize.getHeight() - 20
      );
    },
  });

  const filename = `Rapport_Presences_${debut || "debut"}_${fin || "fin"}.pdf`;
  doc.save(filename);
}
