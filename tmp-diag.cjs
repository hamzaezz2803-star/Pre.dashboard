process.loadEnvFile('.env');
const { Pool } = require('pg');
(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const c = await p.query("select column_name,data_type from information_schema.columns where table_name='acc_transaction'");
    console.log(c.rows.map(r => r.column_name + ':' + r.data_type).join(', '));
    const n = await p.query('select count(*) from acc_transaction');
    console.log('count', n.rows[0].count);
    const s = await p.query('select * from acc_transaction order by event_time desc limit 2');
    console.log(JSON.stringify(s.rows));
  } catch (e) { console.log('ERR', e.message); }
  process.exit();
})();
