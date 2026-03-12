require('dotenv').config();
const QRCode = require('qrcode');
const path   = require('path');

const URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, 'public', 'qrcode.png');

QRCode.toFile(OUT, URL, {
  width: 400, margin: 2,
  color: { dark: '#00AAFF', light: '#0D1B3E' },
  errorCorrectionLevel: 'H'
}).then(() => {
  console.log(`\n✅ QR Code généré !\n   → ${OUT}\n   → URL : ${URL}\n`);
}).catch(err => {
  console.error('❌ Erreur :', err.message);
  process.exit(1);
});
