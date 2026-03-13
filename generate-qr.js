// generate-qr.js — Génère un QR code PNG stylisé (modules arrondis + logo central)
// Usage : node generate-qr.js
// Sortie : qr-autoclean.png

const QRCode = require('qrcode');
const { PNG }  = require('pngjs');
const fs       = require('fs');
const path     = require('path');

const URL_CIBLE   = 'https://carwash-form.onrender.com';
const FICHIER_PNG = path.join(__dirname, 'qr-autoclean.png');
const FICHIER_SVG = path.join(__dirname, 'qr-autoclean.svg');

// ── Paramètres visuels ────────────────────────────────────────────────────────
const TAILLE      = 900;        // px total de l'image
const MARGE_PCT   = 0.05;
const RAYON_PCT   = 0.40;       // arrondi des modules (0 = carré, 0.5 = cercle)
const LOGO_PCT    = 0.22;       // logo = 22% de la taille QR

// Couleurs (RGBA)
const COL_FOND    = { r: 255, g: 255, b: 255, a: 255 };
const COL_MODULE  = { r:  26, g:  26, b:  46, a: 255 };  // #1a1a2e
const COL_LOGO_BG = { r:  14, g: 165, b: 233, a: 255 };  // #0ea5e9
const COL_LOGO_AC = { r:  56, g: 189, b: 248, a: 255 };  // #38bdf8 (accent)
const COL_BLANC   = { r: 255, g: 255, b: 255, a: 255 };

// ── Helpers pixel ─────────────────────────────────────────────────────────────
function setPixel(png, x, y, col) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) * 4;
  png.data[idx]     = col.r;
  png.data[idx + 1] = col.g;
  png.data[idx + 2] = col.b;
  png.data[idx + 3] = col.a;
}

// Remplir un rectangle plein
function fillRect(png, x, y, w, h, col) {
  for (let py = y; py < y + h; py++)
    for (let px = x; px < x + w; px++)
      setPixel(png, px, py, col);
}

// Rectangle arrondi (pixel par pixel)
function fillRoundRect(png, x, y, w, h, r, col) {
  r = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const lx = px - x, ly = py - y;
      // Coins : vérifier si dans le rayon
      const inCornerTL = lx < r && ly < r;
      const inCornerTR = lx >= w - r && ly < r;
      const inCornerBL = lx < r && ly >= h - r;
      const inCornerBR = lx >= w - r && ly >= h - r;

      let inside = true;
      if (inCornerTL) inside = dist(lx, ly, r, r) <= r;
      else if (inCornerTR) inside = dist(lx, ly, w - r - 1, r) <= r;
      else if (inCornerBL) inside = dist(lx, ly, r, h - r - 1) <= r;
      else if (inCornerBR) inside = dist(lx, ly, w - r - 1, h - r - 1) <= r;

      if (inside) setPixel(png, px, py, col);
    }
  }
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// Cercle plein
function fillCircle(png, cx, cy, r, col) {
  for (let py = cy - r; py <= cy + r; py++)
    for (let px = cx - r; px <= cx + r; px++)
      if (dist(px, py, cx, cy) <= r) setPixel(png, px, py, col);
}

// Détecter finder patterns (3 coins du QR)
function isFinderPattern(row, col, n) {
  const inZone = (r, c, r0, c0) => r >= r0 && r <= r0 + 8 && c >= c0 && c <= c0 + 8;
  return inZone(row, col, 0, 0) || inZone(row, col, 0, n - 9) || inZone(row, col, n - 9, 0);
}

// ── Dessin du logo AutoClean ──────────────────────────────────────────────────
function dessinerLogo(png, lx, ly, ls) {
  // Fond bleu arrondi
  fillRoundRect(png, lx, ly, ls, ls, Math.floor(ls * 0.15), COL_LOGO_BG);

  // Carrosserie voiture (rectangle arrondi)
  const carY  = ly + Math.floor(ls * 0.38);
  const carH  = Math.floor(ls * 0.28);
  const carX  = lx + Math.floor(ls * 0.1);
  const carW  = Math.floor(ls * 0.80);
  fillRoundRect(png, carX, carY, carW, carH, Math.floor(carH * 0.2), COL_BLANC);

  // Toit voiture (trapèze simplifié = rectangle plus petit centré)
  const toitX = lx + Math.floor(ls * 0.25);
  const toitW = Math.floor(ls * 0.50);
  const toitH = Math.floor(ls * 0.18);
  const toitY = carY - toitH + Math.floor(ls * 0.02);
  fillRoundRect(png, toitX, toitY, toitW, toitH, Math.floor(toitH * 0.3), COL_BLANC);

  // Roues
  const roueR  = Math.floor(ls * 0.085);
  const roueY  = carY + carH - Math.floor(roueR * 0.3);
  fillCircle(png, lx + Math.floor(ls * 0.28), roueY, roueR, COL_MODULE);
  fillCircle(png, lx + Math.floor(ls * 0.28), roueY, Math.floor(roueR * 0.55), COL_LOGO_AC);
  fillCircle(png, lx + Math.floor(ls * 0.72), roueY, roueR, COL_MODULE);
  fillCircle(png, lx + Math.floor(ls * 0.72), roueY, Math.floor(roueR * 0.55), COL_LOGO_AC);

  // Goutte d'eau (coin haut droit)
  const gX = lx + Math.floor(ls * 0.75);
  const gY = ly + Math.floor(ls * 0.06);
  const gR = Math.floor(ls * 0.07);
  fillCircle(png, gX, gY + gR, gR, COL_LOGO_AC);
  // Pointe de goutte (triangle pixel)
  for (let i = 0; i < gR; i++) {
    const w2 = Math.floor((i / gR) * gR);
    fillRect(png, gX - w2, gY + i, w2 * 2, 1, COL_LOGO_AC);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function generer() {
  // 1. Matrice QR
  const qrData = await QRCode.create(URL_CIBLE, {
    errorCorrectionLevel: 'H',
    version: 5
  });
  const mat    = qrData.modules;
  const nCells = mat.size;

  // 2. Calculer dimensions
  const marge  = Math.floor(TAILLE * MARGE_PCT);
  const qrSize = TAILLE - marge * 2;
  const cell   = qrSize / nCells;
  const r      = Math.floor(cell * RAYON_PCT);

  const logoTaille = Math.floor(qrSize * LOGO_PCT);
  const logoX      = Math.floor(TAILLE / 2 - logoTaille / 2);
  const logoY      = Math.floor(TAILLE / 2 - logoTaille / 2);

  // 3. Créer l'image PNG
  const png    = new PNG({ width: TAILLE, height: TAILLE });
  // Remplir fond blanc
  fillRect(png, 0, 0, TAILLE, TAILLE, COL_FOND);

  // 4. Dessiner les modules
  for (let row = 0; row < nCells; row++) {
    for (let col = 0; col < nCells; col++) {
      if (!mat.get(row, col)) continue;

      const px = marge + Math.floor(col * cell);
      const py = marge + Math.floor(row * cell);
      const cw = Math.floor(cell) - 2;
      const ch = Math.floor(cell) - 2;
      const cx = px + cw / 2;
      const cy = py + ch / 2;

      // Exclure zone logo
      if (
        cx >= logoX - cell && cx <= logoX + logoTaille + cell &&
        cy >= logoY - cell && cy <= logoY + logoTaille + cell
      ) continue;

      // Finder patterns : moins arrondis
      const ri = isFinderPattern(row, col, nCells) ? Math.floor(cell * 0.1) : r;
      fillRoundRect(png, px + 1, py + 1, cw, ch, ri, COL_MODULE);
    }
  }

  // 5. Fond blanc autour du logo
  fillRoundRect(png, logoX - 8, logoY - 8, logoTaille + 16, logoTaille + 16, 20, COL_FOND);

  // 6. Logo
  dessinerLogo(png, logoX, logoY, logoTaille);

  // 7. Sauvegarder
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(FICHIER_PNG, buffer);

  console.log(`✅ PNG généré  : ${FICHIER_PNG}`);
  console.log(`   URL         : ${URL_CIBLE}`);
  console.log(`   Taille      : ${TAILLE}x${TAILLE}px`);
  console.log(`   Grille QR   : ${nCells}x${nCells} modules`);
}

generer().catch(console.error);
