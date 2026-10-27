import type { PresenceRow } from "./types";
import { formatDateFr, formatDurationLong } from "./dates";
import { downloadBlob, loadLogoPng } from "./export-utils";
import { formatStatut } from "./status";

/** Génère et télécharge un PDF paysage A4 des lignes données. */
export async function exportAttendanceToPdf(
  rows: PresenceRow[],
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
    r.empCode,
    r.lastName,
    r.firstName,
    r.deptName,
    formatDateFr(r.jour),
    r.premierPointage || "-",
    r.dernierPointage || "-",
    String(r.nbPointages),
    formatDurationLong(r.tempsPresenceMin),
    r.horaire && r.horaire !== "Horaire non défini"
      ? `${formatStatut(r.statutPresence, r.nbPointages)} · ${r.horaire}`
      : formatStatut(r.statutPresence, r.nbPointages),
  ]);

  autoTable(doc, {
    startY: 92,
    margin: { left: margin, right: margin, bottom: 36 },
    head: [["ID", "Nom", "Prénom", "Prestation", "Date", "1er pointage", "Dernier pointage", "Nb pointages", "Temps de présence", "Statut"]],
    body,
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, lineColor: [213, 221, 217], lineWidth: 0.4, valign: "middle" },
    headStyles: { fillColor: green, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 246] },
    columnStyles: {
      0: { cellWidth: 34 },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "center" },
      7: { halign: "center" },
      8: { halign: "center" },
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
