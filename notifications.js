require('dotenv').config();
const nodemailer = require('nodemailer');

function formatDate(dateStr) {
  const j = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const m = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d = new Date(dateStr + 'T12:00:00');
  return `${j[d.getDay()]} ${d.getDate()} ${m[d.getMonth()]}`;
}
function formatDateCourt(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

async function envoyerSMS(telephone, r) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, OWNER_PHONE_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.log('[SMS] Warning: Twilio non configure.'); return;
  }
  const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const supps  = r.supplements.length ? r.supplements.join(', ') : 'Aucun';
  const dateC  = formatDateCourt(r.dateRdv);
  const msgClient = `AutoClean Reservation confirmee !\nDate: ${dateC} a ${r.heureRdv}\nFormule: ${r.formule} - ${r.prixTotal}EUR\nAdresse: ${r.adresse}, ${r.ville}\nQuestions ? Repondez a ce SMS.`;
  const msgOwner  = `Nouvelle resa AutoClean\n${r.prenom} ${r.nom} - ${r.telephone}\n${dateC} a ${r.heureRdv}\n${r.formule} + ${supps}\n${r.adresse}, ${r.codePostal} ${r.ville}\n${r.prixTotal}EUR`;
  try {
    await twilio.messages.create({ body: msgClient, from: TWILIO_PHONE_NUMBER, to: telephone });
    console.log('[SMS] Client notifie');
    if (OWNER_PHONE_NUMBER) await twilio.messages.create({ body: msgOwner, from: TWILIO_PHONE_NUMBER, to: OWNER_PHONE_NUMBER });
  } catch (err) { console.error('[SMS] Erreur:', err.message); }
}

async function envoyerEmail(emailDest, r) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, OWNER_EMAIL } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) { console.log('[EMAIL] Warning: Gmail non configure.'); return; }
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
  const dateLisible = formatDate(r.dateRdv);
  const suppsStr    = r.supplements.length ? r.supplements.join(', ') : 'Aucun';
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F4F8FF;font-family:Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;padding:32px 16px;"><div style="background:#0D1B3E;border-radius:16px;padding:28px;text-align:center;margin-bottom:20px;"><h1 style="color:#00AAFF;font-size:26px;margin:0 0 4px;">AutoClean</h1><p style="color:#A8C4E0;margin:0;font-size:13px;">Une voiture plus que Clean</p></div><div style="background:#FFFFFF;border-radius:16px;padding:28px;border:1px solid #E0ECFF;"><div style="text-align:center;margin-bottom:24px;"><h2 style="color:#0D1B3E;font-size:20px;margin:0 0 6px;">Reservation confirmee !</h2><p style="color:#4A6080;margin:0;font-size:14px;">Bonjour ${r.prenom}, voici votre recapitulatif.</p></div><table style="width:100%;border-collapse:collapse;"><tr style="border-bottom:1px solid #E0ECFF;"><td style="padding:11px 0;color:#4A6080;font-size:13px;width:40%;">Date et heure</td><td style="padding:11px 0;color:#0D1B3E;font-size:14px;font-weight:700;">${dateLisible} a ${r.heureRdv}</td></tr><tr style="border-bottom:1px solid #E0ECFF;"><td style="padding:11px 0;color:#4A6080;font-size:13px;">Formule</td><td style="padding:11px 0;color:#0D1B3E;font-size:14px;font-weight:700;">${r.formule}</td></tr><tr style="border-bottom:1px solid #E0ECFF;"><td style="padding:11px 0;color:#4A6080;font-size:13px;">Supplements</td><td style="padding:11px 0;color:#0D1B3E;font-size:14px;">${suppsStr}</td></tr><tr style="border-bottom:1px solid #E0ECFF;"><td style="padding:11px 0;color:#4A6080;font-size:13px;">Adresse</td><td style="padding:11px 0;color:#0D1B3E;font-size:14px;">${r.adresse}, ${r.codePostal} ${r.ville}</td></tr><tr><td style="padding:14px 0 4px;color:#4A6080;font-size:13px;">Total</td><td style="padding:14px 0 4px;color:#00AAFF;font-size:24px;font-weight:800;">${r.prixTotal}EUR</td></tr></table></div><div style="text-align:center;color:#4A6080;font-size:12px;margin-top:16px;"><p>AutoClean — Ath &amp; Enghien, Hainaut</p></div></div></body></html>`;
  try {
    await transporter.sendMail({ from: `"AutoClean" <${GMAIL_USER}>`, to: emailDest, subject: 'Votre reservation AutoClean est confirmee', html });
    console.log('[EMAIL] Client notifie');
    if (OWNER_EMAIL) await transporter.sendMail({ from: `"AutoClean" <${GMAIL_USER}>`, to: OWNER_EMAIL, subject: `[AutoClean] Nouvelle resa - ${r.prenom} ${r.nom} - ${formatDateCourt(r.dateRdv)} ${r.heureRdv}`, html });
  } catch (err) { console.error('[EMAIL] Erreur:', err.message); }
}

module.exports = { envoyerSMS, envoyerEmail };
