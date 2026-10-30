import pg from 'pg';

async function main() {
  console.log('Testing connection to port 5432...');
  const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  });
  
  // Try different common users / passwords if default fails
  const attempts = [
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
    'postgresql://root:ZKTeco%23%23123@127.0.0.1:5432/postgres',
    'postgresql://postgres:root@127.0.0.1:5432/postgres',
    'postgresql://postgres:admin@127.0.0.1:5432/postgres',
    'postgresql://zk_lecture:ZKTeco%23%23123@127.0.0.1:5432/postgres',
  ];

  for (const url of attempts) {
    const p = new pg.Pool({ connectionString: url });
    try {
      const res = await p.query('SELECT datname FROM pg_database WHERE datistemplate = false;');
      console.log('SUCCESS on', url);
      console.log('Databases on 5432:', res.rows.map(r => r.datname));
      await p.end();
      process.exit(0);
    } catch (e) {
      console.log('Failed:', url.split('@')[0], '->', e.message);
      await p.end();
    }
  }

  process.exit(1);
}

main();
