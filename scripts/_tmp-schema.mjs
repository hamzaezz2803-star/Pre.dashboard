import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tables = ['auth_department', 'users', 'pers_person', 'pointage_journalier'];
for (const t of tables) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [t],
  );
  console.log('==', t, rows.map((r) => `${r.column_name}:${r.data_type}${r.character_maximum_length ? '(' + r.character_maximum_length + ')' : ''}`).join(', '));
}
const c = await pool.query(`SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype IN ('f','p') AND (conrelid::regclass::text IN ('auth_department','users','pers_person') OR confrelid::regclass::text IN ('auth_department','users','pers_person'))`);
console.log(c.rows);
const d = await pool.query(`SELECT id, name, parent_id FROM auth_department LIMIT 15`).catch((e) => ({ rows: [e.message] }));
console.log(d.rows);
const u = await pool.query(`SELECT id, username, role, active FROM users`);
console.log(u.rows);
await pool.end();
