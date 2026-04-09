-- Ancien schéma MySQL (référence / migration manuelle si besoin)
-- Non utilisé par le serveur actuel (PostgreSQL).

CREATE DATABASE IF NOT EXISTS cv_greenexpress
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cv_greenexpress;

CREATE TABLE IF NOT EXISTS applications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  age TINYINT UNSIGNED NULL,
  gender VARCHAR(32) NULL,
  address TEXT NULL,
  whatsapp VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  position JSON NULL,
  autre_poste_text VARCHAR(255) NULL,
  availability VARCHAR(32) NULL,
  days JSON NULL,
  other_job VARCHAR(16) NULL,
  experience VARCHAR(16) NULL,
  experience_details TEXT NULL,
  skills TEXT NULL,
  smartphone VARCHAR(16) NULL,
  languages JSON NULL,
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
  declaration TINYINT(1) NOT NULL DEFAULT 0,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_submitted (submitted_at),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
