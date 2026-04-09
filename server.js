/**
 * API Express + PostgreSQL pour les candidatures Green Express.
 * Render : liez une base Postgres ; DATABASE_URL est injectée automatiquement.
 * Local : npm install && .env depuis .env.example, puis npm start
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { streamApplicationPdf } = require('./applicationPdf');

const PORT = Number(process.env.PORT) || 4050;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@greenexpress.com').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const UPLOAD_ROOT = path.join(__dirname, 'uploads');
const UPLOAD_APPS = path.join(UPLOAD_ROOT, 'applications');

if (!fs.existsSync(UPLOAD_APPS)) {
  fs.mkdirSync(UPLOAD_APPS, { recursive: true });
}

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
      max: 10,
    });
  }
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'cv_greenexpress',
    max: 10,
    ssl:
      String(process.env.PGSSLMODE || '').toLowerCase() === 'require'
        ? { rejectUnauthorized: false }
        : false,
  });
}

const pool = createPool();

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

/** Dossier des pages (toujours à côté de ce fichier server.js) */
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

/** Lecture disque puis envoi (évite les bugs de sendFile sous Windows) */
const MIME_PUBLIC = {
  'index.html': 'text/html; charset=utf-8',
  'admin.html': 'text/html; charset=utf-8',
  'script.js': 'application/javascript; charset=utf-8',
  'admin.js': 'application/javascript; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'favicon.svg': 'image/svg+xml; charset=utf-8',
};

function sendPublic(res, relativeName) {
  const resolvedPublic = path.resolve(PUBLIC_DIR);
  const abs = path.resolve(resolvedPublic, relativeName);
  const rel = path.relative(resolvedPublic, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return res.status(403).type('text/plain').send('Green Express: chemin refusé');
  }
  if (!fs.existsSync(abs)) {
    console.error('[Green Express] Absent sur disque:', abs);
    return res
      .status(404)
      .type('text/html; charset=utf-8')
      .send(
        `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Green Express</title></head><body>` +
          `<h1>Green Express</h1><p>Fichier manquant : <code>${relativeName}</code></p>` +
          `<p>Chemin complet : <code>${abs}</code></p>` +
          `<p>Ouvrez le bon port (voir terminal après <code>npm start</code>).</p></body></html>`
      );
  }
  res.set('X-Green-Express', '1');
  if (relativeName.endsWith('.png')) {
    return res.type('image/png').send(fs.readFileSync(abs));
  }
  const ctype = MIME_PUBLIC[relativeName] || 'text/plain; charset=utf-8';
  return res.type(ctype).send(fs.readFileSync(abs, 'utf8'));
}

app.use('/uploads', express.static(UPLOAD_ROOT));

app.get('/health', (_req, res) => {
  res.set('X-Green-Express', '1');
  // api.applicationPdf : présent dans ce serveur (vérifiez après redémarrage si le PDF 404)
  res.json({
    ok: true,
    publicDir: PUBLIC_DIR,
    api: { applicationPdf: true },
  });
});

app.get('/admin', (_req, res) => res.redirect(302, '/admin.html'));

app.get('/', (_req, res) => sendPublic(res, 'index.html'));
app.get('/index.html', (_req, res) => sendPublic(res, 'index.html'));
app.get('/admin.html', (_req, res) => sendPublic(res, 'admin.html'));
app.get('/script.js', (_req, res) => sendPublic(res, 'script.js'));
app.get('/admin.js', (_req, res) => sendPublic(res, 'admin.js'));
app.get('/styles.css', (_req, res) => sendPublic(res, 'styles.css'));
app.get('/favicon.svg', (_req, res) => sendPublic(res, 'favicon.svg'));
app.get('/favicon.ico', (_req, res) => res.redirect(302, '/favicon.svg'));

app.get('/logo.png', (_req, res) => {
  const p = path.join(PUBLIC_DIR, 'logo.png');
  if (!fs.existsSync(p)) return res.status(404).end();
  sendPublic(res, 'logo.png');
});

function authAdmin(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('role');
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée ou invalide' });
  }
}

app.post('/api/admin/login', (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Identifiants invalides' });
});

/** État du formulaire public (candidatures ouvertes / fermées par l’admin). */
app.get('/api/form-status', async (_req, res) => {
  try {
    const blocked = await getSubmissionsBlocked();
    res.json({ submissionsBlocked: blocked });
  } catch (err) {
    console.error('form-status', err);
    res.status(503).json({
      error: 'Service temporairement indisponible',
      submissionsBlocked: false,
    });
  }
});

app.put('/api/admin/form-status', authAdmin, async (req, res) => {
  if (typeof req.body?.blocked !== 'boolean') {
    return res.status(400).json({ error: 'Corps attendu : { "blocked": true|false }' });
  }
  try {
    await pool.query('UPDATE form_gate SET submissions_blocked = $1 WHERE id = 1', [
      req.body.blocked,
    ]);
    const blocked = await getSubmissionsBlocked();
    res.json({ submissionsBlocked: blocked });
  } catch (err) {
    console.error('admin form-status', err);
    res.status(500).json({ error: 'Impossible de mettre à jour le statut du formulaire' });
  }
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_APPS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, safe);
  },
});

function fileFilter(_req, file, cb) {
  if (file.fieldname === 'cv') {
    const ok = /\.(pdf|doc|docx)$/i.test(file.originalname || '');
    if (ok) return cb(null, true);
    return cb(new Error('Le CV doit être en PDF, DOC ou DOCX.'));
  }
  const mime = file.mimetype || '';
  if (mime.startsWith('image/')) return cb(null, true);
  return cb(new Error('Seules les images sont acceptées pour ce champ.'));
}

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
  fileFilter,
});

const uploadFields = upload.fields([
  { name: 'postulantPhoto', maxCount: 1 },
  { name: 'cardRecto', maxCount: 1 },
  { name: 'cardVerso', maxCount: 1 },
  { name: 'cv', maxCount: 1 },
  { name: 'transportPhoto', maxCount: 1 },
]);

function toArray(val) {
  if (val === undefined || val === null || val === '') return [];
  return Array.isArray(val) ? val : [val];
}

/** Champ formulaire multipart : une valeur ou le premier élément si doublon. */
function firstScalarField(val) {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) {
    const x = val.find((v) => v != null && String(v).trim() !== '');
    return x != null ? String(x).trim() : '';
  }
  return String(val).trim();
}

/** Attendu : AAAA-MM-JJ (input type="date"). Évite d’envoyer une chaîne invalide à PostgreSQL (DATE). */
function parseIsoDateOnly(val) {
  const s = firstScalarField(val);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return s;
}

function parseJsonField(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}

function relPath(file) {
  if (!file) return null;
  return path.join('applications', file.filename).replace(/\\/g, '/');
}

function wantsDelivery(positions) {
  return positions.some((p) => String(p).toLowerCase() === 'livreur');
}

function rowToClient(row) {
  if (!row) return row;
  const base = '/uploads/';
  const pick = (p) => (p ? `${base}${p}` : null);
  return {
    id: row.id,
    full_name: row.full_name,
    fullName: row.full_name,
    age: row.age,
    gender: row.gender,
    address: row.address,
    whatsapp: row.whatsapp,
    email: row.email,
    position: parseJsonField(row.position) || [],
    autre_poste_text: row.autre_poste_text,
    autrePosteText: row.autre_poste_text,
    availability: row.availability,
    days: parseJsonField(row.days) || [],
    other_job: row.other_job,
    otherJob: row.other_job,
    experience: row.experience,
    experience_details: row.experience_details,
    experienceDetails: row.experience_details,
    skills: row.skills,
    smartphone: row.smartphone,
    languages: parseJsonField(row.languages) || [],
    transport: row.transport,
    license: row.license,
    weather: row.weather,
    delivery_zone: row.delivery_zone,
    deliveryZone: row.delivery_zone,
    motivation: row.motivation,
    discovery: row.discovery,
    motto: row.motto,
    client_service: row.client_service,
    clientService: row.client_service,
    postulant_photo_path: row.postulant_photo_path,
    postulant_photo_url: pick(row.postulant_photo_path),
    card_recto_path: row.card_recto_path,
    card_recto_url: pick(row.card_recto_path),
    card_verso_path: row.card_verso_path,
    card_verso_url: pick(row.card_verso_path),
    cv_path: row.cv_path,
    cv_url: pick(row.cv_path),
    transport_photo_path: row.transport_photo_path,
    transport_photo_url: pick(row.transport_photo_path),
    signature_name: row.signature_name,
    signatureName: row.signature_name,
    date_signed: row.date_signed,
    date: row.date_signed,
    declaration: Boolean(row.declaration),
    submitted_at: row.submitted_at,
    submittedAt: row.submitted_at,
  };
}

/** Supprime un fichier sous uploads/ à partir d’un chemin relatif stocké en base (ex. applications/…). */
function safeUnlinkStoredUpload(rel) {
  if (!rel || typeof rel !== 'string') return;
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (norm.includes('..')) return;
  if (!norm.startsWith('applications/')) return;
  const abs = path.resolve(UPLOAD_ROOT, norm);
  const root = path.resolve(UPLOAD_ROOT);
  if (abs !== root && !abs.startsWith(root + path.sep)) return;
  try {
    fs.unlinkSync(abs);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('unlink upload', abs, e.message);
  }
}

function unlinkApplicationRowFiles(row) {
  if (!row) return;
  [
    row.postulant_photo_path,
    row.card_recto_path,
    row.card_verso_path,
    row.cv_path,
    row.transport_photo_path,
  ].forEach(safeUnlinkStoredUpload);
}

const INSERT_ERROR_HINT_DEFAULT =
  'Sur Render : Web Service → Environment → DATABASE_URL doit être l’« Internal Database URL » de votre Postgres (ou liaison « Link Database »). Puis Logs : cherchez « insert application » après un envoi. Redéployez après toute modification des variables.';

/** Réponses lisibles pour l’utilisateur du formulaire (sans exposer les détails techniques). */
function mapApplicationInsertError(err) {
  const code = err && err.code;
  const msg = String((err && err.message) || '').toLowerCase();
  const base = 'Impossible d’enregistrer la candidature.';

  const withDefault = (hint) => ({ error: base, hint: hint || INSERT_ERROR_HINT_DEFAULT });

  if (code === '42P01' || (msg.includes('relation') && msg.includes('does not exist'))) {
    return withDefault(
      'Table absente ou mauvaise base. Vérifiez que DATABASE_URL pointe vers la bonne base et redémarrez le service (ensureTable crée les tables au démarrage), ou exécutez npm run db:seed sur cette même base.'
    );
  }
  if (code === '42703') {
    return withDefault(
      'Le schéma de la base ne correspond pas à l’application. Recréez les tables (schema.sql / npm run db:seed).'
    );
  }
  if (
    code === '28P01' ||
    code === '28000' ||
    msg.includes('password authentication failed') ||
    msg.includes('authentication failed')
  ) {
    return withDefault(
      'Connexion refusée par PostgreSQL. Mettez à jour DATABASE_URL sur le service web (mot de passe de la base dans le dashboard Render).'
    );
  }
  if (code === '3D000' || msg.includes('database') && msg.includes('does not exist')) {
    return withDefault('Le nom de base dans DATABASE_URL est incorrect.');
  }
  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === '08006' ||
    code === '08001' ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('connect timed out') ||
    msg.includes('connection terminated')
  ) {
    return withDefault(
      'Le serveur n’atteint pas PostgreSQL. Base suspendue ou URL incorrecte : utilisez l’URL interne Render si le web et la base sont sur Render.'
    );
  }
  if (
    msg.includes('certificate') ||
    msg.includes('ssl') ||
    msg.includes('tls') ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  ) {
    return withDefault(
      'Problème SSL vers la base. Sur Render, utilisez l’URL interne fournie par le dashboard ; évitez de mélanger hôte externe et options SSL incorrectes.'
    );
  }
  if (code === '22001' || msg.includes('value too long')) {
    return withDefault('Une réponse dépasse la taille autorisée en base. Raccourcissez un champ texte ou contactez l’administrateur.');
  }
  if (code === '22007' || msg.includes('invalid input syntax for type date')) {
    return withDefault('Date invalide. Utilisez le sélecteur de date du formulaire (format AAAA-MM-JJ).');
  }
  if (code === '53300' || msg.includes('too many connections')) {
    return withDefault('Trop de connexions sur la base PostgreSQL. Réessayez plus tard ou passez à un plan supérieur sur Render.');
  }
  if (code === '23505') {
    return withDefault('Conflit d’enregistrement (doublon). Réessayez ou contactez l’administrateur.');
  }

  return withDefault(null);
}

app.get('/api/applications', authAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM applications ORDER BY submitted_at DESC'
    );
    res.json({ data: rows.map(rowToClient) });
  } catch (err) {
    console.error('list applications', err);
    res.status(500).json({ error: 'Impossible de lister les candidatures' });
  }
});

app.delete('/api/applications/:id', authAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID invalide' });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM applications WHERE id = $1 LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Candidature introuvable' });
    }
    const row = rows[0];
    await pool.query('DELETE FROM applications WHERE id = $1', [id]);
    unlinkApplicationRowFiles(row);
    res.json({ ok: true });
  } catch (err) {
    console.error('delete application', err);
    res.status(500).json({ error: 'Impossible de supprimer la candidature' });
  }
});

async function handleApplicationPdf(req, res, id) {
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID invalide' });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM applications WHERE id = $1 LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Candidature introuvable' });
    }
    await streamApplicationPdf(rows[0], res, UPLOAD_ROOT);
  } catch (err) {
    console.error('export pdf', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Impossible de générer le PDF' });
    }
  }
}

app.get('/api/applications/:id/pdf', authAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await handleApplicationPdf(req, res, id);
});

/** Même export en query string (évite conflits si un proxy ou le static intercepte le segment /pdf) */
app.get('/api/application-pdf', authAdmin, async (req, res) => {
  const id = Number(req.query.id);
  await handleApplicationPdf(req, res, id);
});

app.post('/api/applications', async (req, res, next) => {
  try {
    if (await getSubmissionsBlocked()) {
      return res.status(403).json({
        error: 'Les candidatures en ligne sont temporairement fermées.',
        code: 'FORM_CLOSED',
      });
    }
    next();
  } catch (err) {
    console.error('applications gate', err);
    return res.status(500).json({ error: 'Impossible de vérifier l’ouverture du formulaire' });
  }
}, (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 8 Mo).' : err.message,
        });
      }
      return res.status(400).json({ error: err.message || 'Fichier invalide' });
    }
    next();
  });
}, async (req, res) => {
  const b = req.body || {};
  const files = req.files || {};

  const position = toArray(b.position);
  const days = toArray(b.days);
  const languages = toArray(b.languages);

  const missing = [];
  const need = [
    ['fullName', b.fullName],
    ['age', b.age],
    ['gender', b.gender],
    ['address', b.address],
    ['whatsapp', b.whatsapp],
    ['email', b.email],
    ['availability', b.availability],
    ['otherJob', b.otherJob],
    ['experience', b.experience],
    ['skills', b.skills],
    ['smartphone', b.smartphone],
    ['motivation', b.motivation],
    ['discovery', b.discovery],
    ['motto', b.motto],
    ['clientService', b.clientService],
    ['signatureName', b.signatureName],
    ['date', b.date],
  ];
  need.forEach(([k, v]) => {
    if (k === 'date') {
      if (!parseIsoDateOnly(v)) missing.push(k);
      return;
    }
    if (firstScalarField(v) === '') missing.push(k);
  });

  if (position.length === 0) missing.push('position');
  if (days.length === 0) missing.push('days');

  const declaration =
    b.declaration === true ||
    b.declaration === 'true' ||
    b.declaration === 'on' ||
    b.declaration === '1';

  if (!declaration) missing.push('declaration');

  const postulantPhoto = files.postulantPhoto?.[0];
  const cardRecto = files.cardRecto?.[0];
  const cardVerso = files.cardVerso?.[0];
  if (!postulantPhoto) missing.push('postulantPhoto');
  if (!cardRecto) missing.push('cardRecto');
  if (!cardVerso) missing.push('cardVerso');

  if (position.includes('autre') && !String(b.autrePosteText || '').trim()) {
    missing.push('autrePosteText');
  }

  const delivery = wantsDelivery(position);
  if (delivery) {
    ['transport', 'license', 'weather', 'deliveryZone'].forEach((k) => {
      const v = b[k];
      if (v === undefined || v === null || String(v).trim() === '') missing.push(k);
    });
  }

  if (missing.length > 0) {
    return res.status(400).json({ error: 'Champs requis manquants', fields: missing });
  }

  const ageNum = Number(b.age);
  if (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 100) {
    return res.status(400).json({ error: 'Âge invalide (18 à 100 ans)' });
  }

  const submittedAt = b.submittedAt ? new Date(b.submittedAt) : new Date();
  if (Number.isNaN(submittedAt.getTime())) {
    return res.status(400).json({ error: 'Date de soumission invalide' });
  }

  const cvFile = files.cv?.[0];
  const transportFile = files.transportPhoto?.[0];

  const payload = {
    full_name: String(b.fullName).trim(),
    age: ageNum,
    gender: String(b.gender),
    address: String(b.address).trim(),
    whatsapp: String(b.whatsapp).trim(),
    email: String(b.email).trim().toLowerCase(),
    position,
    autre_poste_text: b.autrePosteText ? String(b.autrePosteText).trim() : null,
    availability: String(b.availability),
    days,
    other_job: String(b.otherJob),
    experience: String(b.experience),
    experience_details: b.experienceDetails ? String(b.experienceDetails).trim() : null,
    skills: String(b.skills).trim(),
    smartphone: String(b.smartphone),
    languages,
    transport: delivery ? String(b.transport) : null,
    license: delivery ? String(b.license) : null,
    weather: delivery ? String(b.weather) : null,
    delivery_zone: delivery ? String(b.deliveryZone).trim() : null,
    motivation: String(b.motivation).trim(),
    discovery: String(b.discovery).trim(),
    motto: String(b.motto).trim(),
    client_service: String(b.clientService).trim(),
    postulant_photo_path: relPath(postulantPhoto),
    card_recto_path: relPath(cardRecto),
    card_verso_path: relPath(cardVerso),
    cv_path: relPath(cvFile),
    transport_photo_path: relPath(transportFile),
    signature_name: String(b.signatureName).trim(),
    date_signed: parseIsoDateOnly(b.date),
    declaration: declaration ? 1 : 0,
    submitted_at: submittedAt,
  };

  const insertSql = `
    INSERT INTO applications (
      full_name, age, gender, address, whatsapp, email,
      position, autre_poste_text, availability, days, other_job,
      experience, experience_details, skills, smartphone, languages,
      transport, license, weather, delivery_zone,
      motivation, discovery, motto, client_service,
      postulant_photo_path, card_recto_path, card_verso_path, cv_path, transport_photo_path,
      signature_name, date_signed, declaration, submitted_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7::jsonb,$8,$9,$10::jsonb,$11,
      $12,$13,$14,$15,$16::jsonb,
      $17,$18,$19,$20,
      $21,$22,$23,$24,
      $25,$26,$27,$28,$29,
      $30,$31,$32,$33
    ) RETURNING *`;

  const insertVals = [
    payload.full_name,
    payload.age,
    payload.gender,
    payload.address,
    payload.whatsapp,
    payload.email,
    payload.position,
    payload.autre_poste_text,
    payload.availability,
    payload.days,
    payload.other_job,
    payload.experience,
    payload.experience_details,
    payload.skills,
    payload.smartphone,
    payload.languages,
    payload.transport,
    payload.license,
    payload.weather,
    payload.delivery_zone,
    payload.motivation,
    payload.discovery,
    payload.motto,
    payload.client_service,
    payload.postulant_photo_path,
    payload.card_recto_path,
    payload.card_verso_path,
    payload.cv_path,
    payload.transport_photo_path,
    payload.signature_name,
    payload.date_signed,
    payload.declaration,
    payload.submitted_at,
  ];

  try {
    const { rows } = await pool.query(insertSql, insertVals);
    res.status(201).json({ data: rowToClient(rows[0]) });
  } catch (err) {
    console.error('insert application', err);
    const mapped = mapApplicationInsertError(err);
    res.status(500).json({ error: mapped.error, hint: mapped.hint });
  }
});

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      age SMALLINT NULL,
      gender VARCHAR(32) NULL,
      address TEXT NULL,
      whatsapp VARCHAR(64) NULL,
      email VARCHAR(255) NULL,
      position JSONB NULL,
      autre_poste_text VARCHAR(255) NULL,
      availability VARCHAR(32) NULL,
      days JSONB NULL,
      other_job VARCHAR(16) NULL,
      experience VARCHAR(16) NULL,
      experience_details TEXT NULL,
      skills TEXT NULL,
      smartphone VARCHAR(16) NULL,
      languages JSONB NULL,
      transport VARCHAR(32) NULL,
      license VARCHAR(16) NULL,
      weather VARCHAR(16) NULL,
      delivery_zone VARCHAR(255) NULL,
      motivation TEXT NULL,
      discovery VARCHAR(512) NULL,
      motto TEXT NULL,
      client_service TEXT NULL,
      postulant_photo_path VARCHAR(512) NULL,
      card_recto_path VARCHAR(512) NULL,
      card_verso_path VARCHAR(512) NULL,
      cv_path VARCHAR(512) NULL,
      transport_photo_path VARCHAR(512) NULL,
      signature_name VARCHAR(255) NULL,
      date_signed DATE NULL,
      declaration SMALLINT NOT NULL DEFAULT 0,
      submitted_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_applications_submitted ON applications (submitted_at DESC)'
  );
  await pool.query('CREATE INDEX IF NOT EXISTS idx_applications_email ON applications (email)');
  await ensureFormGate();
}

async function ensureFormGate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_gate (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      submissions_blocked BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`
    INSERT INTO form_gate (id, submissions_blocked) VALUES (1, FALSE)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function getSubmissionsBlocked() {
  const { rows } = await pool.query(
    'SELECT submissions_blocked FROM form_gate WHERE id = 1'
  );
  if (!rows.length) return false;
  return Boolean(rows[0].submissions_blocked);
}

/** Ne jamais servir de fichiers sous /api (sinon 404 silencieux à la place des routes API) */
app.use((req, res, next) => {
  const p = req.path || '';
  if (p === '/api' || p.startsWith('/api/')) {
    return next();
  }
  express.static(PUBLIC_DIR, {
    dotfiles: 'deny',
    index: false,
  })(req, res, next);
});

app.use((req, res) => {
  res.set('X-Green-Express', '1');
  if (req.method === 'GET' && req.accepts('html')) {
    return res
      .status(404)
      .type('text/html; charset=utf-8')
      .send(
        `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>404 — Green Express</title></head><body>` +
          `<p><strong>Green Express</strong> — aucune page pour <code>${req.path}</code>.</p>` +
          `<p><a href="/">Formulaire</a> · <a href="/admin.html">Admin</a></p>` +
          `<p><small>Si ce message ne s’affiche pas, ce n’est pas ce serveur (vérifiez le port 4000).</small></p>` +
          `</body></html>`
      );
  }
  res.status(404).type('text/plain; charset=utf-8').send(`404 Green Express — ${req.path}`);
});

app.listen(Number(PORT), '0.0.0.0', async () => {
  const check = (f) => (fs.existsSync(path.join(PUBLIC_DIR, f)) ? 'OK' : 'MANQUANT');
  console.log('');
  console.log('========== Green Express ==========');
  console.log('Dossier public :', PUBLIC_DIR);
  console.log('index.html     :', check('index.html'));
  console.log('admin.html     :', check('admin.html'));
  console.log('styles.css     :', check('styles.css'));
  console.log('Test API       : GET http://localhost:' + PORT + '/health  → doit afficher JSON { ok: true, publicDir: ... }');
  console.log('====================================');
  console.log('Site  : http://localhost:' + PORT + '/');
  console.log('Admin : http://localhost:' + PORT + '/admin.html');
  console.log('');

  try {
    await ensureTable();
  } catch (e) {
    console.error('PostgreSQL indisponible ou base incorrecte :', e.message);
    console.error('Vérifiez DATABASE_URL (Render) ou PG* dans .env, et schema.sql si besoin.');
  }
});
