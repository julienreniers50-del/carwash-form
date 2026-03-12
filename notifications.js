require('dotenv').config();
const nodemailer = require('nodemailer');

function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-BE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
  });
}

// Envoi UNIQUEMENT lors d'une nouvelle réservation — jamais au démarrage
async function envoyerEmail(reservation) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, OWNER_EMAIL } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.log('[EMAIL] Gmail non configuré — ignoré.');
    return;
  }

  const { prenom, nom, telephone, email, adresse, codePostal, ville,
          commentaire, formule, supplements, dateRdv, heureRdv, prixTotal } = reservation;

  const dateLongue = formatDateLong(dateRdv);
  const suppsTexte = supplements.length > 0 ? supplements.join(', ') : '—';
  const transporter = getTransporter();

  // ── Email 1 — Confirmation client ─────────────────────────────────────────
  const htmlClient = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8">
<style>
  body{margin:0;padding:20px;background:#F4F8FF;font-family:'Segoe UI',Arial,sans-serif;}
  .wrap{max-width:600px;margin:0 auto;}
  .header{background:linear-gradient(135deg,#0D1B3E,#00AAFF);border-radius:14px;padding:28px;text-align:center;margin-bottom:16px;}
  .header h1{color:#fff;font-size:24px;margin:0 0 4px;}
  .header p{color:rgba(255,255,255,.8);margin:0;font-size:13px;}
  .card{background:#fff;border-radius:14px;border:1px solid #E0ECFF;padding:28px;margin-bottom:16px;}
  .card h2{color:#0D1B3E;font-size:18px;margin:0 0 6px;}
  .card .sub{color:#4A6080;font-size:14px;margin:0 0 20px;}
  table{width:100%;border-collapse:collapse;}
  td{padding:10px 0;border-bottom:1px solid #F0F4FF;font-size:14px;vertical-align:top;}
  td:first-child{color:#4A6080;width:42%;font-weight:500;}
  td:last-child{color:#0D1B3E;font-weight:600;}
  .total-row td{border-bottom:none;padding-top:16px;}
  .total-row td:last-child{color:#00AAFF;font-size:22px;font-weight:800;}
  .info{background:#F4F8FF;border-radius:10px;padding:14px;font-size:13px;color:#4A6080;margin-top:20px;line-height:1.6;}
  .footer{text-align:center;color:#4A6080;font-size:12px;padding-top:8px;}
</style>
</head>
<body><div class="wrap">
  <div class="header">
    <h1>🚗 AutoClean</h1>
    <p>Une voiture plus que Clean</p>
  </div>
  <div class="card">
    <h2>✅ Réservation confirmée !</h2>
    <p class="sub">Bonjour <strong>${prenom}</strong>, votre rendez-vous a bien été enregistré.</p>
    <table>
      <tr><td>Formule</td><td>${formule}</td></tr>
      <tr><td>Suppléments</td><td>${suppsTexte}</td></tr>
      <tr><td>Date</td><td>${dateLongue}</td></tr>
      <tr><td>Heure</td><td>${heureRdv}</td></tr>
      <tr><td>Adresse</td><td>${adresse}, ${codePostal} ${ville}</td></tr>
      ${commentaire ? `<tr><td>Commentaire</td><td>${commentaire}</td></tr>` : ''}
      <tr class="total-row"><td>Prix total</td><td>${prixTotal}€</td></tr>
    </table>
    <div class="info">
      Nous serons chez vous à l'heure prévue avec tout le matériel.<br>
      En cas de question, répondez simplement à cet email.
    </div>
  </div>
  <div class="footer">AutoClean — Yttre &amp; Enghien, Hainaut</div>
</div></body></html>`;

  await transporter.sendMail({
    from:    `AutoClean <${GMAIL_USER}>`,
    to:      email,
    subject: '✅ Votre réservation AutoClean est confirmée',
    html:    htmlClient
  });
  console.log('[EMAIL] ✅ Confirmation envoyée au client');

  // ── Email 2 — Notification propriétaire ───────────────────────────────────
  if (!OWNER_EMAIL) return;

  const textOwner = [
    `🔔 Nouvelle réservation AutoClean`,
    ``,
    `Client     : ${prenom} ${nom}`,
    `Téléphone  : ${telephone}`,
    `Email      : ${email}`,
    ``,
    `Formule    : ${formule}`,
    `Suppléments: ${suppsTexte}`,
    `Date       : ${dateLongue} à ${heureRdv}`,
    `Adresse    : ${adresse}, ${codePostal} ${ville}`,
    `Commentaire: ${commentaire || '—'}`,
    ``,
    `Prix total : ${prixTotal}€`
  ].join('\n');

  await transporter.sendMail({
    from:    `AutoClean <${GMAIL_USER}>`,
    to:      OWNER_EMAIL,
    subject: `🔔 Nouvelle réservation — ${prenom} ${nom} — ${dateLongue}`,
    text:    textOwner
  });
  console.log('[EMAIL] ✅ Notification envoyée au propriétaire');
}

module.exports = { envoyerEmail };
