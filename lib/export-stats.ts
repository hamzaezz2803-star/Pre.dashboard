import { formatDateFr, formatDurationLong } from "./dates";
import { downloadBlob, loadLogoPng } from "./export-utils";

export interface DepartmentStatItem {
  name: string;
  total: number;
  present: number;
  anomalie: number;
  absent: number;
  sansHoraire: number;
  minutes: number;
  employeeCount: number;
  rate: number;
  ponctualRate: number;
}

export interface StatsExportData {
  totalRecords: number;
  uniqueEmployees: number;
  uniqueDays: number;
  totalMinutes: number;
  presenceRate: number;
  ponctualityRate: number;
  anomalyRate: number;
  statusCounts: {
    present: number;
    anomalie: number;
    absent: number;
    "sans-horaire": number;
  };
  deptsList: DepartmentStatItem[];
}

/** Exporte le rapport statistique d'assiduité au format PDF paysage. */
export async function exportStatsToPdf(
  data: StatsExportData,
  from: string,
  to: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  const green: [number, number, number] = [15, 107, 79];

  // En-tête avec logo
  const logo = await loadLogoPng();
  let textX = margin;
  if (logo) {
    const h = 44;
    const w = h * (logo.width / logo.height);
    doc.addImage(logo.dataUrl, "PNG", margin, 24, w, h);
    textX = margin + w + 14;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...green);
  doc.text("Rapport Analytique des Présences & Statistiques", textX, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 70, 66);
  doc.text(`Période d'analyse : du ${formatDateFr(from)} au ${formatDateFr(to)}`, textX, 58);
  doc.text(
    `Généré le ${new Date().toLocaleString("fr-FR")} · ${data.totalRecords} pointages analysés sur ${data.uniqueDays} jours`,
    textX,
    71,
  );

  // Encadré des indicateurs clés (KPIs)
  doc.setFillColor(245, 248, 246);
  doc.setDrawColor(213, 221, 217);
  doc.roundedRect(margin, 84, pageW - margin * 2, 44, 4, 4, "FD");

  const kpis = [
    { label: "Taux de présence", val: `${data.presenceRate}%` },
    { label: "Taux de ponctualité", val: `${data.ponctualityRate}%` },
    { label: "Anomalies / Retards", val: `${data.statusCounts.anomalie}` },
    { label: "Temps cumulé", val: formatDurationLong(data.totalMinutes, "0h") },
    { label: "Employés suivis", val: `${data.uniqueEmployees}` },
  ];

  const colW = (pageW - margin * 2) / kpis.length;
  kpis.forEach((kpi, idx) => {
    const x = margin + idx * colW + colW / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...green);
    doc.text(kpi.val, x, 103, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 100, 95);
    doc.text(kpi.label, x, 118, { align: "center" });
  });

  // Tableau 1 : Synthèse par Département
  const deptsBody = data.deptsList.map((d) => [
    d.name,
    String(d.employeeCount),
    String(d.present),
    String(d.anomalie),
    String(d.absent),
    `${d.rate}%`,
    `${d.ponctualRate}%`,
    formatDurationLong(d.minutes, "0h 00m"),
  ]);

  autoTable(doc, {
    startY: 142,
    margin: { left: margin, right: margin },
    head: [
      [
        "Département / Pôle",
        "Effectif",
        "Présents",
        "Retards / Anomalies",
        "Absents",
        "Taux d'assiduité",
        "Ponctualité",
        "Heures totales",
      ],
    ],
    body: deptsBody,
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, lineColor: [213, 221, 217], lineWidth: 0.4, valign: "middle" },
    headStyles: { fillColor: green, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    columnStyles: {
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center", fontStyle: "bold" },
      6: { halign: "center" },
      7: { halign: "center" },
    },
    didDrawPage: () => {
      const page = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 125);
      doc.text(`Page ${page}`, pageW - margin, pageH - 16, { align: "right" });
      doc.text("OCP Phosboucraa - Suivi des pointages et statistiques", margin, pageH - 16);
    },
  });

  downloadBlob(doc.output("blob"), `rapport_statistiques_${from}_${to}.pdf`);
}

/** Exporte la synthèse statistique au format Excel. */
export async function exportStatsToExcel(
  data: StatsExportData,
  from: string,
  to: string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "OCP Suivi des pointages";

  const GREEN = "FF0F6B4F";
  const GREEN_SOFT = "FFE8F3EE";

  // Feuille 1 : Synthèse par Département
  const wsDept = wb.addWorksheet("Par Département", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  });

  wsDept.columns = [
    { header: "Département", width: 28 },
    { header: "Effectif", width: 12 },
    { header: "Total Pointages", width: 16 },
    { header: "Présents", width: 12 },
    { header: "Anomalies / Retards", width: 20 },
    { header: "Absents", width: 12 },
    { header: "Taux Assiduité (%)", width: 18 },
    { header: "Taux Ponctualité (%)", width: 20 },
    { header: "Heures Cumulées", width: 18 },
  ];

  // En-tête de titre
  wsDept.mergeCells("A1:I1");
  const title = wsDept.getCell("A1");
  title.value = "Rapport Statistique par Département";
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: GREEN } };

  wsDept.mergeCells("A2:I2");
  const sub = wsDept.getCell("A2");
  sub.value = `Période : du ${formatDateFr(from)} au ${formatDateFr(to)}  |  Généré le ${new Date().toLocaleString("fr-FR")}`;
  sub.font = { name: "Calibri", size: 11, italic: true };

  // Données départements
  data.deptsList.forEach((d) => {
    wsDept.addRow({
      Département: d.name,
      Effectif: d.employeeCount,
      "Total Pointages": d.total,
      Présents: d.present,
      "Anomalies / Retards": d.anomalie,
      Absents: d.absent,
      "Taux Assiduité (%)": `${d.rate}%`,
      "Taux Ponctualité (%)": `${d.ponctualRate}%`,
      "Heures Cumulées": formatDurationLong(d.minutes, "0h 00m"),
    });
  });

  // Feuille 2 : Répartition par Statut
  const wsStatus = wb.addWorksheet("Par Statut");
  wsStatus.columns = [
    { header: "Catégorie de Statut", width: 26 },
    { header: "Nombre de Cas", width: 18 },
    { header: "Pourcentage (%)", width: 18 },
  ];

  const total = data.totalRecords || 1;
  const statuses = [
    { label: "Présent", count: data.statusCounts.present },
    { label: "Anomalie / Retard", count: data.statusCounts.anomalie },
    { label: "Absent", count: data.statusCounts.absent },
    { label: "Pas d'horaire / Incomplet", count: data.statusCounts["sans-horaire"] },
  ];

  statuses.forEach((s) => {
    wsStatus.addRow({
      "Catégorie de Statut": s.label,
      "Nombre de Cas": s.count,
      "Pourcentage (%)": `${Math.round((s.count / total) * 100)}%`,
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `statistiques_${from}_${to}.xlsx`,
  );
}
