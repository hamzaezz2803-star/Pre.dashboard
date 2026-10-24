/**
 * Script pour insérer un jeu d'exemples réalistes dans la base de données.
 * Insère dans biosecurity-boot puis déclenche la synchronisation vers ocp_pointage.
 *
 * Usage : node --env-file=.env scripts/inserer-exemples.mjs
 */
import pg from 'pg';
import crypto from 'node:crypto';
import { runSync, syncState } from '../lib/sync.js';

const { Pool } = pg;

const EMPLOYES = [
  // Informatique
  { pin: '3', prenom: 'Youssef', nom: 'Idrissi', dept: 'Informatique' },
  { pin: '7', prenom: 'Hamza', nom: 'Benjelloun', dept: 'Informatique' },
  { pin: '8', prenom: 'Ahmed Louad', nom: 'Lhaj', dept: 'Informatique' },
  { pin: '12', prenom: 'Karim', nom: 'Alami', dept: 'Informatique' },

  // Ressources Humaines
  { pin: '2', prenom: 'Sara', nom: 'Bennani', dept: 'Ressources Humaines' },
  { pin: '14', prenom: 'Salma', nom: 'Mansouri', dept: 'Ressources Humaines' },
  { pin: '15', prenom: 'Tariq', nom: 'Kettani', dept: 'Ressources Humaines' },

  // Finance & Comptabilité
  { pin: '4', prenom: 'Fatima', nom: 'Zahra', dept: 'Finance & Comptabilité' },
  { pin: '16', prenom: 'Mehdi', nom: 'Tazi', dept: 'Finance & Comptabilité' },
  { pin: '17', prenom: 'Meryem', nom: 'Alaoui', dept: 'Finance & Comptabilité' },

  // Sécurité & Environnement
  { pin: '6', prenom: 'Said', nom: 'Hamada', dept: 'Sécurité & Environnement' },
  { pin: '18', prenom: 'Khalid', nom: 'Berrada', dept: 'Sécurité & Environnement' },
  { pin: '19', prenom: 'Omar', nom: 'Chraibi', dept: 'Sécurité & Environnement' },

  // Exploitation & Production
  { pin: '11', prenom: 'Hamza', nom: 'Amrani', dept: 'Exploitation & Production' },
  { pin: '20', prenom: 'Rachid', nom: 'Naciri', dept: 'Exploitation & Production' },
  { pin: '21', prenom: 'Yassine', nom: 'Belkacem', dept: 'Exploitation & Production' },
  { pin: '22', prenom: 'Bilal', nom: 'Daoudi', dept: 'Exploitation & Production' },

  // Maintenance & Logistique
  { pin: '23', prenom: 'Nabil', nom: 'Kabbaj', dept: 'Maintenance & Logistique' },
  { pin: '24', prenom: 'Amina', nom: 'Cherkaoui', dept: 'Maintenance & Logistique' },
  { pin: '25', prenom: 'Saad', nom: 'Zouiten', dept: 'Maintenance & Logistique' },
];

const JOURS = [
  '2026-10-19',
  '2026-10-20',
  '2026-10-21',
  '2026-10-22',
  '2026-10-23',
  '2026-10-24',
];

async function main() {
  console.log('--- Début de l\'insertion des données d\'exemple ---');

  // Connexion en root à biosecurity-boot
  const pool = new Pool({
    connectionString: 'postgresql://root:ZKTeco%23%23123@127.0.0.1:5442/biosecurity-boot',
  });

  try {
    // 1. Nettoyer les anciennes transactions de test si souhaité
    console.log('Vidage des tables att_transaction et att_record dans biosecurity-boot...');
    await pool.query('TRUNCATE TABLE att_transaction CASCADE');
    await pool.query('TRUNCATE TABLE att_record CASCADE');

    const transactions = [];
    const records = [];

    for (const emp of EMPLOYES) {
      for (const jour of JOURS) {
        const seed = `${emp.pin}-${jour}`;
        const hash = crypto.createHash('md5').update(seed).digest('hex');
        const num = parseInt(hash.slice(0, 4), 16) % 100;

        let punchType = 'normal';
        if (num < 10) {
          punchType = 'absent';
        } else if (num < 25) {
          punchType = 'late';
        } else if (num < 35) {
          punchType = 'incomplet';
        } else {
          punchType = 'normal';
        }

        if (punchType === 'absent') {
          // Aucun pointage, enregistrement att_record d'absence
          records.push({
            id: crypto.randomUUID().replace(/-/g, ''),
            pin: emp.pin,
            nom: emp.nom,
            prenom: emp.prenom,
            dept: emp.dept,
            jour: jour,
            statut: 'absent',
            actualMin: 0,
            absentMin: 480,
          });
          continue;
        }

        if (punchType === 'late') {
          // Arrivée entre 09:10 et 09:45, sortie entre 16:30 et 17:15
          const inMin = 10 + (num % 35);
          const outMin = 30 + (num % 45);
          const inTime = `${jour} 09:${String(inMin).padStart(2, '0')}:00`;
          const outTime = `${jour} 17:${String(outMin).padStart(2, '0')}:00`;

          transactions.push({
            id: crypto.randomUUID().replace(/-/g, ''),
            pin: emp.pin,
            nom: emp.nom,
            prenom: emp.prenom,
            dept: emp.dept,
            time: inTime,
            state: '0',
          });
          transactions.push({
            id: crypto.randomUUID().replace(/-/g, ''),
            pin: emp.pin,
            nom: emp.nom,
            prenom: emp.prenom,
            dept: emp.dept,
            time: outTime,
            state: '1',
          });

          const actualMinutes = Math.round((new Date(outTime).getTime() - new Date(inTime).getTime()) / 60000);
          records.push({
            id: crypto.randomUUID().replace(/-/g, ''),
            pin: emp.pin,
            nom: emp.nom,
            prenom: emp.prenom,
            dept: emp.dept,
            jour: jour,
            statut: 'late',
            actualMin: actualMinutes,
            absentMin: inMin + 60,
          });
        } else if (punchType === 'incomplet') {
          // Uniquement pointage entrée (sans sortie)
          const inMin = 5 + (num % 25);
          const inTime = `${jour} 08:${String(inMin).padStart(2, '0')}:00`;

          transactions.push({
            id: crypto.randomUUID().replace(/-/g, ''),
            pin: emp.pin,
            nom: emp.nom,
            prenom: emp.prenom,
            dept: emp.dept,
            time: inTime,
            state: '0',
          });

          records.push({
            id: crypto.randomUUID().replace(/-/g, ''),
            pin: emp.pin,
            nom: emp.nom,
            prenom: emp.prenom,
            dept: emp.dept,
            jour: jour,
            statut: 'noCheckOut',
            actualMin: 0,
            absentMin: 240,
          });
        } else {
          // Présence normale : 08h00-08h30 à 16h30-17h30
          const inMin = num % 25;
          const outMin = num % 45;
          const inTime = `${jour} 08:${String(inMin).padStart(2, '0')}:00`;
          const outTime = `${jour} 17:${String(outMin).padStart(2, '0')}:00`;

          transactions.push({
            id: crypto.randomUUID().replace(/-/g, ''),
            pin: emp.pin,
            nom: emp.nom,
            prenom: emp.prenom,
            dept: emp.dept,
            time: inTime,
            state: '0',
          });
          transactions.push({
            id: crypto.randomUUID().replace(/-/g, ''),
            pin: emp.pin,
            nom: emp.nom,
            prenom: emp.prenom,
            dept: emp.dept,
            time: outTime,
            state: '1',
          });

          const actualMinutes = Math.round((new Date(outTime).getTime() - new Date(inTime).getTime()) / 60000);
          records.push({
            id: crypto.randomUUID().replace(/-/g, ''),
            pin: emp.pin,
            nom: emp.nom,
            prenom: emp.prenom,
            dept: emp.dept,
            jour: jour,
            statut: 'normal',
            actualMin: actualMinutes,
            absentMin: 0,
          });
        }
      }
    }

    console.log(`Insertion de ${transactions.length} pointages dans att_transaction...`);
    for (const t of transactions) {
      await pool.query(
        `INSERT INTO att_transaction (
          id, pers_person_pin, pers_person_name, pers_person_last_name,
          auth_dept_name, att_datetime, att_state, op_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
        [t.id, t.pin, t.prenom, t.nom, t.dept, t.time, t.state],
      );
    }

    console.log(`Insertion de ${records.length} récapitulatifs dans att_record...`);
    for (const r of records) {
      await pool.query(
        `INSERT INTO att_record (
          id, pers_person_pin, pers_person_name, pers_person_last_name,
          auth_dept_name, att_date, attendance_status, actual_minute, absent_minute, op_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)`,
        [r.id, r.pin, r.prenom, r.nom, r.dept, r.jour, r.statut, r.actualMin, r.absentMin],
      );
    }

    console.log('✅ Insertion réussie dans biosecurity-boot.');
  } finally {
    await pool.end();
  }

  // 2. Lancer la synchronisation vers ocp_pointage
  console.log('Lancement de la synchronisation vers ocp_pointage...');
  await runSync();
  console.log('Résultat de la synchronisation :', syncState);
  console.log('🎉 Terminé avec succès !');
}

main().catch((err) => {
  console.error('Erreur lors de l\'insertion :', err);
  process.exit(1);
});
