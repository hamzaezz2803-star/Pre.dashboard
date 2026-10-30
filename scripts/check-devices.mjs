import { sourcePool } from '../lib/db.js';

async function main() {
  try {
    const devAcc = await sourcePool.query(`SELECT * FROM acc_device LIMIT 2;`);
    console.log('acc_device count:', devAcc.rows.length);
    if (devAcc.rows.length) console.log(devAcc.rows[0]);
  } catch (e) {
    console.log('acc_device err:', e.message);
  }

  try {
    const devAtt = await sourcePool.query(`SELECT * FROM att_device LIMIT 2;`);
    console.log('att_device count:', devAtt.rows.length);
    if (devAtt.rows.length) console.log(devAtt.rows[0]);
  } catch (e) {
    console.log('att_device err:', e.message);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
