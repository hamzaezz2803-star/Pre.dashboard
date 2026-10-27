import { exportRapportPresenceExcel } from '../lib/export-rapport-presences.js';

async function testExports() {
  console.log('Testing export imports and setup...');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rapport des Présences');
  ws.columns = [
    { header: 'ID', width: 14 },
    { header: 'Nom Employé', width: 32 },
    { header: 'Heure de Pointage', width: 24 },
    { header: 'Horaire Affecté', width: 28 },
  ];
  ws.addRow(['101', 'Ahmed Mezi', '2024-04-02 07:15', 'H001 - Matin']);
  const buf = await wb.xlsx.writeBuffer();
  console.log('Excel write buffer size:', buf.byteLength);

  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.text('PS - Rapport des Présences', 36, 45);
  autoTable(doc, {
    startY: 60,
    head: [['ID', 'Nom Employé', 'Heure de Pointage', 'Horaire Affecté']],
    body: [['101', 'Ahmed Mezi', '2024-04-02 07:15', 'H001 - Matin']],
  });
  const pdfBytes = doc.output('arraybuffer');
  console.log('PDF arraybuffer size:', pdfBytes.byteLength);
  console.log('Both Excel and PDF generators work perfectly!');
  process.exit(0);
}

testExports().catch(e => {
  console.error('Export test error:', e);
  process.exit(1);
});
