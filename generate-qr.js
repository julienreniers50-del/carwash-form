// generate-qr.js — QR code PNG avec vrai logo + coins arrondis globaux
// Usage : node generate-qr.js
// Sortie : qr-autoclean.png

const QRCode = require('qrcode');
const { PNG }  = require('pngjs');
const jpeg     = require('jpeg-js');
const fs       = require('fs');
const path     = require('path');

const URL_CIBLE   = 'https://carwash-form.onrender.com';
const LOGO_PATH   = path.join(__dirname, 'public', 'logo.png');
const FICHIER_PNG = path.join(__dirname, 'qr-autoclean.png');

// ── Paramètres visuels ────────────────────────────────────────────────────────
const TAILLE       = 900;    // px total
const MARGE_PCT    = 0.06;   // marge autour du QR
const RAYON_PCT    = 0.42;   // arrondi des modules
const LOGO_PCT     = 0.24;   // logo = 24% de la taille QR
const RAYON_GLOBAL = 60;     // arrondi coins du QR code entier (px)

const COL_FOND   = { r: 255, g: 255, b: 255, a: 255 };
const COL_MODULE = { r:  26, g:  26, b:  46, a: 255 };  // #1a1a2e
const COL_TRANSP = { r:   0, g:   0, b:   0, a:   0 };  // transparent

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPixel(png, x, y) {
  const idx = (png.width * y + x) * 4;
  return { r: png.data[idx], g: png.data[idx+1], b: png.data[idx+2], a: png.data[idx+3] };
}

function setPixel(png, x, y, col) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) * 4;
  png.data[idx]   = col.r;
  png.data[idx+1] = col.g;
  png.data[idx+2] = col.b;
  png.data[idx+3] = col.a;
}

function fillRect(png, x, y, w, h, col) {
  for (let py = y; py < y + h; py++)
    for (let px = x; px < x + w; px++)
      setPixel(png, px, py, col);
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1-x2)**2 + (y1-y2)**2);
}

function fillRoundRect(png, x, y, w, h, r, col) {
  r = Math.min(r, Math.floor(w/2), Math.floor(h/2));
  for (let py = y; py < y+h; py++) {
    for (let px = x; px < x+w; px++) {
      const lx = px-x, ly = py-y;
      let inside = true;
      if      (lx < r   && ly < r)   inside = dist(lx, ly, r,   r)   <= r;
      else if (lx >= w-r && ly < r)   inside = dist(lx, ly, w-r-1, r)   <= r;
      else if (lx < r   && ly >= h-r) inside = dist(lx, ly, r,   h-r-1) <= r;
      else if (lx >= w-r && ly >= h-r) inside = dist(lx, ly, w-r-1, h-r-1) <= r;
      if (inside) setPixel(png, px, py, col);
    }
  }
}

function isFinderPattern(row, col, n) {
  const inZone = (r, c, r0, c0) => r >= r0 && r <= r0+8 && c >= c0 && c <= c0+8;
  return inZone(row,col,0,0) || inZone(row,col,0,n-9) || inZone(row,col,n-9,0);
}

// Redimensionne un PNG source vers (tw x th) par interpolation nearest-neighbor
function resizePNG(src, tw, th) {
  const dst = new PNG({ width: tw, height: th });
  dst.data = Buffer.alloc(tw * th * 4);
  for (let dy = 0; dy < th; dy++) {
    for (let dx = 0; dx < tw; dx++) {
      const sx = Math.floor(dx * src.width  / tw);
      const sy = Math.floor(dy * src.height / th);
      const srcIdx = (src.width * sy + sx) * 4;
      const dstIdx = (tw * dy + dx) * 4;
      dst.data[dstIdx]   = src.data[srcIdx];
      dst.data[dstIdx+1] = src.data[srcIdx+1];
      dst.data[dstIdx+2] = src.data[srcIdx+2];
      dst.data[dstIdx+3] = src.data[srcIdx+3];
    }
  }
  return dst;
}

// Composite le logo sur le QR (ignore pixels blancs/transparents du logo)
function compositeLogo(png, logo, lx, ly) {
  for (let dy = 0; dy < logo.height; dy++) {
    for (let dx = 0; dx < logo.width; dx++) {
      const px = lx + dx, py = ly + dy;
      if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
      const idx = (logo.width * dy + dx) * 4;
      const a = logo.data[idx+3];
      const r = logo.data[idx], g = logo.data[idx+1], b = logo.data[idx+2];
      // Ignorer pixels quasi-blancs (fond du logo)
      if (a < 30 || (r > 240 && g > 240 && b > 240)) continue;
      setPixel(png, px, py, { r, g, b, a: 255 });
    }
  }
}

// Applique un masque arrondi sur les coins de toute l'image (rend transparent hors du coin arrondi)
function appliquerCoinArrondis(png, rayon) {
  const w = png.width, h = png.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inCornerTL = x < rayon   && y < rayon;
      const inCornerTR = x >= w-rayon && y < rayon;
      const inCornerBL = x < rayon   && y >= h-rayon;
      const inCornerBR = x >= w-rayon && y >= h-rayon;
      let masquer = false;
      if      (inCornerTL) masquer = dist(x, y, rayon,   rayon)   > rayon;
      else if (inCornerTR) masquer = dist(x, y, w-rayon-1, rayon)   > rayon;
      else if (inCornerBL) masquer = dist(x, y, rayon,   h-rayon-1) > rayon;
      else if (inCornerBR) masquer = dist(x, y, w-rayon-1, h-rayon-1) > rayon;
      if (masquer) setPixel(png, x, y, COL_TRANSP);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function generer() {
  // 1. Matrice QR
  const qrData = await QRCode.create(URL_CIBLE, { errorCorrectionLevel: 'H', version: 5 });
  const mat    = qrData.modules;
  const nCells = mat.size;

  const marge      = Math.floor(TAILLE * MARGE_PCT);
  const qrSize     = TAILLE - marge * 2;
  const cell       = qrSize / nCells;
  const r          = Math.floor(cell * RAYON_PCT);
  const logoTaille = Math.floor(qrSize * LOGO_PCT);
  const logoX      = Math.floor(TAILLE/2 - logoTaille/2);
  const logoY      = Math.floor(TAILLE/2 - logoTaille/2);

  // 2. Image de base (fond blanc + alpha)
  const png = new PNG({ width: TAILLE, height: TAILLE, colorType: 6 });
  fillRect(png, 0, 0, TAILLE, TAILLE, COL_FOND);

  // 3. Modules QR
  for (let row = 0; row < nCells; row++) {
    for (let col = 0; col < nCells; col++) {
      if (!mat.get(row, col)) continue;
      const px = marge + Math.floor(col * cell);
      const py = marge + Math.floor(row * cell);
      const cw = Math.floor(cell) - 2;
      const ch = Math.floor(cell) - 2;
      const cx = px + cw/2, cy = py + ch/2;

      // Exclure zone logo
      if (cx >= logoX-cell && cx <= logoX+logoTaille+cell &&
          cy >= logoY-cell && cy <= logoY+logoTaille+cell) continue;

      const ri = isFinderPattern(row, col, nCells) ? Math.floor(cell*0.12) : r;
      fillRoundRect(png, px+1, py+1, cw, ch, ri, COL_MODULE);
    }
  }

  // 4. Fond blanc autour du logo
  const pad = 12;
  fillRoundRect(png, logoX-pad, logoY-pad, logoTaille+pad*2, logoTaille+pad*2, 24, COL_FOND);

  // 5. Logo réel redimensionné (JPEG ou PNG)
  const logoBuffer = fs.readFileSync(LOGO_PATH);
  let logoSrc;
  const sig = logoBuffer[0];
  if (sig === 0xFF) {
    // JPEG
    const raw = jpeg.decode(logoBuffer, { useTArray: true });
    logoSrc = { width: raw.width, height: raw.height, data: Buffer.from(raw.data) };
  } else {
    logoSrc = PNG.sync.read(logoBuffer);
  }
  const logoRedim = resizePNG(logoSrc, logoTaille, logoTaille);
  compositeLogo(png, logoRedim, logoX, logoY);

  // 6. Coins arrondis sur l'image entière
  appliquerCoinArrondis(png, RAYON_GLOBAL);

  // 7. Sauvegarder
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(FICHIER_PNG, buffer);
  // Copie dans public/
  fs.writeFileSync(path.join(__dirname, 'public', 'qr-autoclean.png'), buffer);

  console.log(`✅ PNG généré  : ${FICHIER_PNG}`);
  console.log(`   URL         : ${URL_CIBLE}`);
  console.log(`   Logo        : public/logo.png`);
  console.log(`   Taille      : ${TAILLE}x${TAILLE}px`);
}

generer().catch(console.error);
