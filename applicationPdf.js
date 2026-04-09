'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const {
  PDFDocument: PdfLibDocument,
  PDFName,
  PDFArray,
  PDFDict,
  StandardFonts,
  rgb,
} = require('pdf-lib');

/**
 * Seuil sur la taille du flux /Contents seul (sans compter les XObject image).
 * Les pages photo sont souvent « petites » en octets de /Contents mais référencent une image.
 */
const MIN_MAIN_PAGE_BYTES = 380;
const MIN_CV_EDGE_PAGE_BYTES = 280;

function pageUsesXObject(page) {
  try {
    const res = page.node.Resources();
    if (!res) return false;
    const xobj = res.lookup(PDFName.of('XObject'));
    if (!xobj) return false;
    if (xobj instanceof PDFDict) {
      return xobj.entries().length > 0;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Helvetica / PDF standard = WinAnsi (Latin-1). Au-delà, PdfKit lève une erreur.
 */
function pdfSafe(str) {
  if (str == null) return '';
  let s = String(str);
  s = s
    .replace(/\u2013|\u2014|\u2015/g, '-')
    .replace(/\u2018|\u2019|\u02BC/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c <= 0xff ? s[i] : '?';
  }
  return out;
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

function renderList(arr) {
  if (Array.isArray(arr)) return arr.length ? arr.join(', ') : '-';
  if (arr == null || arr === '') return '-';
  return String(arr);
}

function diskPath(uploadRoot, rel) {
  if (!rel) return null;
  const normalized = String(rel).replace(/\//g, path.sep);
  return path.join(uploadRoot, normalized);
}

/**
 * Taille cumulée des flux de contenu bruts de la page (approximation « page vide »).
 */
function sumContentStreamBytes(page) {
  const ctx = page.doc.context;
  let contents;
  try {
    contents = page.node.lookup(PDFName.of('Contents'));
  } catch {
    return 0;
  }
  if (!contents) return 0;

  const refs = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) refs.push(contents.get(i));
  } else {
    refs.push(contents);
  }

  let total = 0;
  for (const ref of refs) {
    try {
      const obj = ctx.lookup(ref);
      if (obj && typeof obj.getContentsSize === 'function') {
        total += obj.getContentsSize();
      }
    } catch {
      /* ignore */
    }
  }
  return total;
}

function isMainPageBlankArtifact(page) {
  if (sumContentStreamBytes(page) >= MIN_MAIN_PAGE_BYTES) return false;
  if (pageUsesXObject(page)) return false;
  return true;
}

/** Retire uniquement les pages vraiment vides (pas de texte ni image XObject) sur la fiche PdfKit. */
function selectMainPageIndices(doc) {
  const pages = doc.getPages();
  const kept = [];
  for (let i = 0; i < pages.length; i++) {
    if (!isMainPageBlankArtifact(pages[i])) kept.push(i);
  }
  return kept.length > 0 ? kept : doc.getPageIndices();
}

function isCvEdgeBlank(page) {
  if (sumContentStreamBytes(page) >= MIN_CV_EDGE_PAGE_BYTES) return false;
  if (pageUsesXObject(page)) return false;
  return true;
}

/** Pages blanches en début / fin du CV (exports Word, etc.), sans couper une page photo. */
function selectCvPageIndices(doc) {
  const pages = doc.getPages();
  const n = pages.length;
  if (n === 0) return [];

  let start = 0;
  while (start < n && isCvEdgeBlank(pages[start])) {
    start += 1;
  }
  let end = n - 1;
  while (end > start && isCvEdgeBlank(pages[end])) {
    end -= 1;
  }

  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out.length > 0 ? out : doc.getPageIndices();
}

/**
 * Assemble un PDF neuf (arbre de pages propre) : fiche filtrée + CV rogné.
 * Évite d’ajouter les pages du CV au document « main » chargé (cas qui désynchronise certains lecteurs).
 */
async function assembleFinalPdf(kitBuffer, cvAbsolutePath, willMergeCvPdf) {
  const mainSrc = await PdfLibDocument.load(kitBuffer, { ignoreEncryption: true });
  const out = await PdfLibDocument.create();

  const mainIdx = selectMainPageIndices(mainSrc);
  let copied = await out.copyPages(mainSrc, mainIdx);
  copied.forEach((p) => out.addPage(p));

  if (willMergeCvPdf && cvAbsolutePath && fs.existsSync(cvAbsolutePath)) {
    try {
      const cvSrc = await PdfLibDocument.load(fs.readFileSync(cvAbsolutePath), {
        ignoreEncryption: true,
      });
      const cvIdx = selectCvPageIndices(cvSrc);
      if (cvIdx.length > 0) {
        copied = await out.copyPages(cvSrc, cvIdx);
        copied.forEach((p) => out.addPage(p));
      }
    } catch (err) {
      console.error('[PDF] lecture CV pour assemblage :', err.message);
    }
  }

  return Buffer.from(await out.save());
}

/**
 * Pieds de page (pdf-lib, origine bas-gauche), une seule passe sur le PDF final.
 */
async function addFootersToAllPages(pdfBuffer, rowId) {
  const doc = await PdfLibDocument.load(pdfBuffer, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;
  const footerColor = rgb(0.39, 0.45, 0.55);
  const textSize = 7;

  for (let i = 0; i < total; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    const text = `Green Express - Candidature n°${rowId} - p. ${i + 1} / ${total}`;
    const tw = font.widthOfTextAtSize(text, textSize);
    const x = Math.max(48, (width - tw) / 2);
    page.drawText(text, {
      x,
      y: 22,
      size: textSize,
      font,
      color: footerColor,
    });
  }

  return Buffer.from(await doc.save());
}

/**
 * @returns {Promise<void>}
 */
function streamApplicationPdf(row, res, uploadRoot) {
  const filename = `GreenExpress-candidat-${row.id}.pdf`;
  const cvAbs = diskPath(uploadRoot, row.cv_path);
  const willMergeCvPdf =
    cvAbs && fs.existsSync(cvAbs) && path.extname(cvAbs).toLowerCase() === '.pdf';

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      margin: 48,
      size: 'A4',
      bufferPages: false,
      info: {
        Title: pdfSafe('Fiche candidature Green Express'),
        Author: 'Green Express',
      },
    });

    doc.on('data', (c) => chunks.push(c));
    doc.on('error', (err) => {
      console.error('[PDF] flux', err);
      reject(err);
    });
    doc.on('end', () => {
      (async () => {
        try {
          let buf = Buffer.concat(chunks);
          buf = await assembleFinalPdf(buf, cvAbs, willMergeCvPdf);
          buf = await addFootersToAllPages(buf, row.id);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buf);
          resolve();
        } catch (e) {
          reject(e);
        }
      })();
    });

    try {
      const pageW = doc.page.width;
      const left = 48;
      const w = pageW - 96;

      doc.save();
      doc.rect(0, 0, pageW, 102).fill('#0b1220');
      doc.fillColor('#d4af37').font('Helvetica-Bold').fontSize(22).text('Green Express', left, 34);
      doc.fillColor('#22d3ee').font('Helvetica-Bold').fontSize(11).text('Fiche candidature', left, 62);
      doc
        .fillColor('#94a3b8')
        .font('Helvetica')
        .fontSize(8.5)
        .text(pdfSafe('Document confidentiel - usage interne uniquement'), left, 78);
      doc.restore();

      doc.y = 120;

      const labelColor = '#b8860b';
      const valueColor = '#1e293b';

      function addField(label, value) {
        const safeL = pdfSafe(label);
        const raw = value == null || value === '' ? '-' : String(value);
        const safeV = pdfSafe(raw);
        doc.fillColor(labelColor).font('Helvetica-Bold').fontSize(9).text(`${safeL} : `, {
          continued: true,
        });
        doc.fillColor(valueColor).font('Helvetica').fontSize(10).text(safeV, {
          width: w,
          lineGap: 2,
        });
        doc.moveDown(0.45);
      }

      const positions = parseJsonField(row.position) || [];
      const days = parseJsonField(row.days) || [];
      const languages = parseJsonField(row.languages) || [];

      addField('Nom', row.full_name);
      addField('Âge', row.age);
      addField('Sexe', row.gender);
      addField('Adresse', row.address);
      addField('WhatsApp', row.whatsapp);
      addField('Email', row.email);
      addField('Postes', renderList(positions));
      addField('Autre poste', row.autre_poste_text);
      addField('Disponibilité horaires', row.availability);
      addField('Jours', renderList(days));
      addField('Autre emploi', row.other_job);
      addField('Expérience', row.experience);
      addField('Détails expérience', row.experience_details);
      addField('Compétences', row.skills);
      addField('Smartphone / ordinateur', row.smartphone);
      addField('Langues', renderList(languages));
      addField('Moyen de transport', row.transport);
      addField('Permis', row.license);
      addField('Conditions météo', row.weather);
      addField('Zone de livraison', row.delivery_zone);
      addField('Motivation', row.motivation);
      addField('Connu via', row.discovery);
      addField('Valeur marque', row.motto);
      addField('Client mécontent', row.client_service);
      if (willMergeCvPdf) {
        addField(
          'CV',
          `${path.basename(row.cv_path)} — intégré en annexe (pages PDF suivantes)`
        );
      } else if (row.cv_path) {
        addField('CV (fichier sur serveur)', path.basename(row.cv_path));
      } else {
        addField('CV', null);
      }
      addField('Signature', row.signature_name);
      addField('Date de signature', row.date_signed);
      addField('Déclaration (informations exactes)', row.declaration ? 'Oui' : 'Non');
      addField('Soumis le', row.submitted_at ? String(row.submitted_at) : null);

      function addImagePage(title, relStored) {
        const full = diskPath(uploadRoot, relStored);
        if (!full || !fs.existsSync(full)) return;
        const ext = path.extname(full).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return;
        try {
          if (fs.statSync(full).size === 0) return;
        } catch {
          return;
        }

        let image;
        try {
          image = doc.openImage(full);
        } catch {
          return;
        }
        if (!image || !image.width || !image.height) return;

        doc.addPage();
        doc.save();
        doc.rect(0, 0, pageW, 52).fill('#0b1220');
        doc.fillColor('#d4af37').font('Helvetica-Bold').fontSize(11).text(pdfSafe(title), left, 18);
        doc.restore();

        const yTop = 62;
        const maxH = Math.max(80, doc.page.height - yTop - 56);
        const iw = image.width;
        const ih = image.height;
        const scale = Math.min(w / iw, maxH / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const ix = left + (w - dw) / 2;

        try {
          doc.image(full, ix, yTop, { width: dw, height: dh });
        } catch {
          doc
            .fillColor('#64748b')
            .font('Helvetica')
            .fontSize(10)
            .text(pdfSafe('(Image non integree au PDF.)'), left, yTop, { width: w });
        }
      }

      addImagePage('Photo du postulant', row.postulant_photo_path);
      addImagePage("Carte d'electeur - recto", row.card_recto_path);
      addImagePage("Carte d'electeur - verso", row.card_verso_path);
      addImagePage('Photo du moyen de transport', row.transport_photo_path);

      doc.end();
    } catch (err) {
      console.error('[PDF] generation', err);
      try {
        doc.destroy();
      } catch {
        /* ignore */
      }
      reject(err);
    }
  });
}

module.exports = { streamApplicationPdf };
