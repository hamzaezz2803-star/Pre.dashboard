/**
 * Script pour purger définitivement toutes les données de test dans les DEUX bases :
 * 1. biosecurity-boot (source CVAccess qui réinjecte les badgeages toutes les minutes)
 * 2. ocp_pointage (base du dashboard)
 *
 * Usage : node --env-file=.env.local scripts/purger-tous-les-tests.mjs
 */
import pg from 'pg';

const { Pool } = pg;

async function purger() {
  console.log('--- PURGE COMPLÈTE DES DONNÉES DE TEST ---');

  // 1. Purge dans biosecurity-boot (SOURCE)
  const sourcePool = new Pool({
    connectionString: 'postgresql://root:ZKTeco%23%23123@127.0.0.1:5442/biosecurity-boot',
  });

  // 2. Purge dans ocp_pointage (CIBLE)
  const targetPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://root:ZKTeco%23%23123@127.0.0.1:5442/ocp_pointage',
  });

  try {
    console.log('1/2. Vidage de la base source CVAccess (biosecurity-boot)...');
    await sourcePool.query('TRUNCATE TABLE att_transaction CASCADE;');
    await sourcePool.query('TRUNCATE TABLE att_record CASCADE;');
    console.log('   ✅ biosecurity-boot vidé (att_transaction et att_record = 0)');

    console.log('2/2. Vidage de la base de bord OCP (ocp_pointage)...');
    await targetPool.query('TRUNCATE TABLE public.affectations_horaires_dynamiques RESTART IDENTITY CASCADE;');
    await targetPool.query('TRUNCATE TABLE public.pointage_journalier RESTART IDENTITY CASCADE;');
    await targetPool.query('TRUNCATE TABLE public.att_transaction RESTART IDENTITY CASCADE;');
    await targetPool.query('TRUNCATE TABLE public.att_record RESTART IDENTITY CASCADE;');
    console.log('   ✅ ocp_pointage vidé (toutes les tables de pointage = 0)');

    console.log('\n--- VÉRIFICATION FINALE ---');
    const verif = await targetPool.query(`
      SELECT 'affectations_horaires_dynamiques' AS table_name, count(*) AS total FROM public.affectations_horaires_dynamiques
      UNION ALL
      SELECT 'pointage_journalier', count(*) FROM public.pointage_journalier
      UNION ALL
      SELECT 'att_transaction', count(*) FROM public.att_transaction
      UNION ALL
      SELECT 'att_record', count(*) FROM public.att_record;
    `);
    console.table(verif.rows);

  } catch (err) {
    console.error('Erreur lors de la purge :', err.message);
  } finally {
    await sourcePool.end();
    await targetPool.end();
    process.exit(0);
  }
}

purger();
