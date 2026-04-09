/**
 * Applique schema.sql sur la base PostgreSQL (Render, local, etc.).
 * Utilise DATABASE_URL ou PG* depuis .env à la racine du projet.
 *
 * Usage : npm run db:seed
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function sslOptionForDatabaseUrl(url) {
  if (!url) return false;
  try {
    const normalized = url.replace(/^postgresql:/i, 'http:');
    const u = new URL(normalized);
    const h = (u.hostname || '').toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
  } catch {
    /* ignore */
  }
  return { rejectUnauthorized: false };
}

function createPool() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return new Pool({
      connectionString: databaseUrl,
      ssl: sslOptionForDatabaseUrl(databaseUrl),
      max: 2,
      connectionTimeoutMillis: 20000,
    });
  }
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'cv_greenexpress',
    max: 2,
    connectionTimeoutMillis: 20000,
    ssl:
      String(process.env.PGSSLMODE || '').toLowerCase() === 'require'
        ? { rejectUnauthorized: false }
        : false,
  });
}

/** Retire les commentaires `--` en début de ligne (schema.sql n’a pas de `--` dans des chaînes). */
function stripLineComments(sql) {
  return sql
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--');
      if (i === -1) return line;
      return line.slice(0, i);
    })
    .join('\n');
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    console.error(
      'Configurez DATABASE_URL (recommandé pour Render) ou PGHOST/PGUSER/... dans le fichier .env à la racine.'
    );
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('Fichier introuvable :', schemaPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(schemaPath, 'utf8');
  const sql = stripLineComments(raw).trim();
  if (!sql) {
    console.error('schema.sql est vide après nettoyage.');
    process.exit(1);
  }

  const pool = createPool();
  try {
    await pool.query(sql);
    console.log('OK — Schéma appliqué : tables `applications`, `form_gate`, index, ligne initiale form_gate.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Échec du seed :', err.message || err);
  process.exit(1);
});
