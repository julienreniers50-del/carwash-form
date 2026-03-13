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

// Notification UNIQUEMENT au propriétaire — pas d'email automatique au client
async function envoyerEmail(reservation) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, OWNER_EMAIL } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !OWNER_EMAIL) {
    console.log('[EMAIL] Gmail non configuré — ignoré.');
    return;
  }

  const { prenom, nom, telephone, email, adresse, codePostal, ville,
          commentaire, formule, supplements, dateRdv, heureRdv, prixTotal,
          promo_lancement } = reservation;

  const dateLongue = formatDateLong(dateRdv);
  const suppsTexte = supplements.length > 0 ? supplements.join(', ') : '—';
  const transporter = getTransporter();

  const textOwner = [
    `🔔 Nouvelle réservation AutoClean`,
    ``,
    `Client     : ${prenom} ${nom}`,
    `Téléphone  : ${telephone}`,
    `Email      : ${email || '—'}`,
    ``,
    `Formule    : ${formule}`,
    `Suppléments: ${suppsTexte}`,
    `Date       : ${dateLongue} à ${heureRdv}`,
    `Adresse    : ${adresse}, ${codePostal} ${ville}`,
    `Commentaire: ${commentaire || '—'}`,
    ``,
    `Prix total : ${prixTotal}€`,
    ...(promo_lancement ? [``, `🎉 Promo lancement appliquée — tarif 90€`] : [])
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
