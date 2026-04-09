-- Green Express — PostgreSQL (Render, local, etc.)
-- Créez la base si besoin : CREATE DATABASE cv_greenexpress ENCODING 'UTF8';
-- Puis exécutez ce script dans cette base (ou laissez ensureTable() au démarrage du serveur).

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
);

CREATE INDEX IF NOT EXISTS idx_applications_submitted ON applications (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_email ON applications (email);

-- Ouverture / fermeture des candidatures (ligne unique, id = 1)
CREATE TABLE IF NOT EXISTS form_gate (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  submissions_blocked BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO form_gate (id, submissions_blocked) VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;
