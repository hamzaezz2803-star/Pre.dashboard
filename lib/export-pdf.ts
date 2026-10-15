import type { AttendanceRow } from "./types";
import { formatDateFr, formatDateTimeFr, formatDuration } from "./dates";
import { downloadBlob, loadLogoPng } from "./export-utils";

/** Génère et télécharge un PDF paysage A4 des lignes données. */
export async function exportAttendanceToPdf(
  rows: AttendanceRow[],
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

  const logo = await loadLogoPng();
  let textX = margin;
  if (logo) {
    const h = 48;
    const w = h * (logo.width / logo.height);
    doc.addImage(logo.dataUrl, "PNG", margin, 24, w, h);
    textX = margin + w + 14;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...green);
  doc.text("Pointages du personnel", textX, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 70, 66);
  doc.text(`Période : du ${formatDateFr(from)} au ${formatDateFr(to)}`, textX, 62);
  doc.text(
    `Généré le ${new Date().toLocaleString("fr-FR")}  |  ${rows.length} ligne${rows.length > 1 ? "s" : ""}`,
    textX,
    75,
  );

  const body = rows.map((r) => [
    r.id,
    r.nom,
    r.prenom,
    r.prestation,
    r.firstPunch ? formatDateTimeFr(r.firstPunch) : "Aucun",
    r.lastPunch ? formatDateTimeFr(r.lastPunch) : "Aucun",
    String(r.punchCount),
    r.zones.join(", ") || "Aucune",
    formatDuration(r.presenceMinutes),
    r.absenceCount > 0
      ? `${r.absenceCount} (${r.absenceDates.map((d) => formatDateFr(d).slice(0, 5)).join(", ")})`
      : "0",
  ]);

  autoTable(doc, {
    startY: 92,
    margin: { left: margin, right: margin, bottom: 36 },
    head: [["ID", "Nom", "Prénom", "Prestation", "Pointage min", "Pointage max", "Nb", "Zones", "Présence", "Absences"]],
    body,
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, lineColor: [213, 221, 217], lineWidth: 0.4, valign: "middle" },
    headStyles: { fillColor: green, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 246] },
    columnStyles: {
      0: { cellWidth: 34 },
      4: { halign: "center", cellWidth: 74 },
      5: { halign: "center", cellWidth: 74 },
      6: { halign: "center", cellWidth: 28 },
      8: { halign: "center", cellWidth: 52 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 9 && data.cell.raw !== "0") {
        data.cell.styles.textColor = [138, 90, 0];
        data.cell.styles.fillColor = [255, 244, 224];
      }
    },
    didDrawPage: () => {
      const page = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 125);
      doc.text(`Page ${page}`, pageW - margin, pageH - 16, { align: "right" });
      doc.text("Suivi des pointages du personnel", margin, pageH - 16);
    },
  });

  downloadBlob(doc.output("blob"), `pointages_${from}_${to}.pdf`);
}
