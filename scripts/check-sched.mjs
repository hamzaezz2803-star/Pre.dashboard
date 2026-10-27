import { sourcePool, targetPool } from '../lib/db.js';

async function check() {
  try {
    const ts = await sourcePool.query('SELECT * FROM att_timeslot LIMIT 2');
    console.log('SAMPLE att_timeslot cols:', Object.keys(ts.rows[0] || {}));
    console.log('SAMPLE att_timeslot rows:', ts.rows);
  } catch (e) {
    console.log('att_timeslot error:', e.message);
  }

  try {
    const ac = await sourcePool.query('SELECT * FROM att_class LIMIT 2');
    console.log('SAMPLE att_class cols:', Object.keys(ac.rows[0] || {}));
    console.log('SAMPLE att_class rows:', ac.rows);
  } catch (e) {
    console.log('att_class error:', e.message);
  }

  process.exit(0);
}
check();
