// generate-qr.js — Génère un QR code SVG stylisé avec logo central
// Usage : node generate-qr.js
// Sortie : qr-autoclean.svg (même dossier)

const QRCode = require('qrcode');
const fs     = require('fs');
const path   = require('path');

const URL_CIBLE = 'https://carwash-form.onrender.com';
const FICHIER   = path.join(__dirname, 'qr-autoclean.svg');

// ── Paramètres visuels ────────────────────────────────────────────────────────
const TAILLE_SVG   = 600;
const MARGE_PCT    = 0.05;
const COULEUR_QR   = '#1a1a2e';
const COULEUR_FOND = '#ffffff';
const RAYON_MODULE = 0.45;      // 0 = carré, 0.5 = rond
const LOGO_PCT     = 0.22;      // logo = 22% de la taille QR

async function generer() {
  const qrData = await QRCode.create(URL_CIBLE, {
    errorCorrectionLevel: 'H',  // H = 30% redondance (nécessaire pour couvrir le logo)
    version: 5
  });

  const mat    = qrData.modules;
  const nCells = mat.size;

  const marge  = TAILLE_SVG * MARGE_PCT;
  const qrSize = TAILLE_SVG - marge * 2;
  const cell   = qrSize / nCells;
  const r      = cell * RAYON_MODULE;

  // Zone logo (centre)
  const logoTaille = qrSize * LOGO_PCT;
  const logoCX     = TAILLE_SVG / 2;
  const logoCY     = TAILLE_SVG / 2;
  const logoX      = logoCX - logoTaille / 2;
  const logoY      = logoCY - logoTaille / 2;

  // Construction des modules QR
  let pathData = '';
  for (let row = 0; row < nCells; row++) {
    for (let col = 0; col < nCells; col++) {
      if (!mat.get(row, col)) continue;

      const x  = marge + col * cell;
      const y  = marge + row * cell;
      const cx = x + cell / 2;
      const cy = y + cell / 2;

      // Ignorer les modules sous la zone logo
      if (
        cx >= logoX - cell && cx <= logoX + logoTaille + cell &&
        cy >= logoY - cell && cy <= logoY + logoTaille + cell
      ) continue;

      const ri = isFinderPattern(row, col, nCells) ? cell * 0.15 : r;
      pathData += rectArrondi(x + 1, y + 1, cell - 2, cell - 2, ri);
    }
  }

  const logoSVG = logoAutoClean(logoX, logoY, logoTaille);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${TAILLE_SVG}" height="${TAILLE_SVG}" viewBox="0 0 ${TAILLE_SVG} ${TAILLE_SVG}">
  <defs>
    <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#1a1a2e"/>
    </linearGradient>
  </defs>

  <!-- Fond blanc arrondi -->
  <rect width="${TAILLE_SVG}" height="${TAILLE_SVG}" fill="${COULEUR_FOND}" rx="24"/>

  <!-- Modules QR -->
  <path fill="${COULEUR_QR}" d="${pathData}"/>

  <!-- Fond blanc derrière logo -->
  <rect x="${logoX - 6}" y="${logoY - 6}" width="${logoTaille + 12}" height="${logoTaille + 12}" rx="18" fill="${COULEUR_FOND}"/>

  <!-- Logo -->
  ${logoSVG}
</svg>`;

  fs.writeFileSync(FICHIER, svg, 'utf8');
  console.log(`✅ QR code généré : ${FICHIER}`);
  console.log(`   URL            : ${URL_CIBLE}`);
  console.log(`   Grille         : ${nCells}x${nCells} modules`);
}

function rectArrondi(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${x+r},${y} h${w-2*r} a${r},${r} 0 0 1 ${r},${r} v${h-2*r} a${r},${r} 0 0 1 -${r},${r} h-${w-2*r} a${r},${r} 0 0 1 -${r},-${r} v-${h-2*r} a${r},${r} 0 0 1 ${r},-${r} Z `;
}

function isFinderPattern(row, col, n) {
  const inZone = (r, c, r0, c0) => r >= r0 && r <= r0+8 && c >= c0 && c <= c0+8;
  return inZone(row, col, 0, 0) || inZone(row, col, 0, n-9) || inZone(row, col, n-9, 0);
}

function logoAutoClean(x, y, s) {
  return `<g transform="translate(${x}, ${y})">
    <!-- Fond coloré -->
    <rect width="${s}" height="${s}" rx="14" fill="url(#logoGrad)"/>
    <!-- Carrosserie voiture -->
    <path fill="white" transform="translate(${s*0.08}, ${s*0.3}) scale(${s/320})"
      d="M280 100 L60 100 L20 160 L20 200 L300 200 L300 160 Z"/>
    <!-- Toit -->
    <path fill="white" transform="translate(${s*0.08}, ${s*0.3}) scale(${s/320})"
      d="M90 100 L115 45 L205 45 L230 100 Z"/>
    <!-- Roue gauche -->
    <circle cx="${s*0.28}" cy="${s*0.72}" r="${s*0.1}" fill="#0ea5e9" stroke="white" stroke-width="${s*0.025}"/>
    <!-- Roue droite -->
    <circle cx="${s*0.72}" cy="${s*0.72}" r="${s*0.1}" fill="#0ea5e9" stroke="white" stroke-width="${s*0.025}"/>
    <!-- Goutte d'eau (coin haut droit) -->
    <path fill="#38bdf8" transform="translate(${s*0.72}, ${s*0.04})"
      d="M${s*0.1},0 Q${s*0.16},-${s*0.08} ${s*0.2},0 Q${s*0.2},${s*0.13} ${s*0.1},${s*0.13} Z"/>
    <!-- Texte -->
    <text x="${s/2}" y="${s*0.86}" text-anchor="middle"
      font-family="Arial Black, Arial, sans-serif" font-weight="900"
      font-size="${s*0.19}" fill="white" letter-spacing="1">AUTO</text>
    <text x="${s/2}" y="${s*0.98}" text-anchor="middle"
      font-family="Arial Black, Arial, sans-serif" font-weight="900"
      font-size="${s*0.17}" fill="#38bdf8" letter-spacing="1">CLEAN</text>
  </g>`;
}

generer().catch(console.error);
