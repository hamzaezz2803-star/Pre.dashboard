const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const allAff = await pool.query(`
      SELECT 
        a.id,
        a.cvaccess_person_id,
        p.pin,
        p.last_name,
        p.name,
        a.date_service,
        h.period_name,
        a.debut_prevu,
        a.fin_prevue,
        a.heure_entree,
        a.heure_sortie,
        a.statut
      FROM affectations_horaires_dynamiques a
      LEFT JOIN pers_person p ON p.id = a.cvaccess_person_id
      LEFT JOIN cvaccess_horaires h ON h.cvaccess_horaire_id = a.cvaccess_horaire_id
      ORDER BY a.date_service DESC, p.pin ASC
    `);
    console.log(`Total affectations_horaires_dynamiques: ${allAff.rows.length}`);
    console.table(allAff.rows.map(r => ({
      pin: r.pin,
      nom: `${r.last_name} ${r.name}`,
      date_service: r.date_service ? r.date_service.toISOString().split('T')[0] : null,
      horaire: r.period_name,
      entree: r.heure_entree ? r.heure_entree.toISOString().slice(11, 16) : null,
      sortie: r.heure_sortie ? r.heure_sortie.toISOString().slice(11, 16) : null,
      statut: r.statut
    })));

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

run();
