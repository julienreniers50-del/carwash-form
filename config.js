// ─────────────────────────────────────────────────────────────────────────────
// config.js — SOURCE UNIQUE DE VÉRITÉ AutoClean v2
// ─────────────────────────────────────────────────────────────────────────────

const ENTREPRISE = {
  nom:       'AutoClean',
  slogan:    'Une voiture plus que Clean',
  zone:      'Ittre & Enghien — Hainaut, Belgique',
  email:     process.env.OWNER_EMAIL        || '',
  telephone: process.env.OWNER_PHONE_NUMBER || ''
};

// Formules triées par prix croissant
const FORMULES = [
  {
    id:                'interieur',
    nom:               'Lavage Intérieur',
    emoji:             '🪑',
    prix:              25,
    duree:             'Environ 1h',
    duree_minutes:     60,
    description:       'Aspiration complète habitacle, nettoyage plastiques intérieurs, vitres intérieures sans traces',
    badge:             null,
    inclut_supplements: false
  },
  {
    id:                'exterieur',
    nom:               'Lavage Extérieur',
    emoji:             '🚗',
    prix:              35,
    duree:             'Environ 45 min',
    duree_minutes:     45,
    description:       'Shampoing carrosserie, nettoyage jantes, gel brillant pneus, traitement plastiques extérieurs, silicone joints portes & coffre',
    badge:             null,
    inclut_supplements: false
  },
  {
    id:                'complet',
    nom:               'Lavage Complet',
    emoji:             '✨',
    prix:              50,
    duree:             'Environ 1h30',
    duree_minutes:     90,
    description:       'Extérieur + Intérieur combinés — le meilleur rapport qualité/prix',
    badge:             'Populaire',
    inclut_supplements: false
  },
  {
    id:                'showroom',
    nom:               'Formule Showroom',
    emoji:             '💎',
    prix:              120,
    duree:             'Environ 3h',
    duree_minutes:     180,
    description:       'Lavage complet + cire de protection carrosserie, black wax peintures noires, gel brillant pneus, traitement plastiques, silicone joints, extraction eau sièges & moquettes incluse',
    badge:             'Premium',
    inclut_supplements: true
  }
];

const SUPPLEMENTS = [
  {
    id:                  'extraction',
    nom:                 'Extraction eau sièges & moquettes',
    emoji:               '🧽',
    description:         'Shampouinage par injecteur-extracteur — nettoyage en profondeur des sièges et moquettes',
    prix:                30,
    duree_extra:         'Environ 45 min',
    duree_extra_minutes: 45,
    incompatible_avec:   ['showroom']
  },
  {
    id:                  'cire',
    nom:                 'Cire de protection carrosserie',
    emoji:               '✨',
    description:         'Application car wax — protection et brillance longue durée (3 à 6 mois). Nécessite un espace ombragé ou créneau matinal.',
    note:                '🎨 Nous disposons de la car wax pour véhicules clairs et du black wax pour véhicules foncés — précisez la couleur de votre véhicule dans le champ commentaire.',
    prix:                30,
    duree_extra:         'Environ 45 min',
    duree_extra_minutes: 45,
    incompatible_avec:   ['showroom']
  }
];

// Offre de lancement — source de vérité côté serveur
// places_restantes et promo_active sont gérés dans Notion (NOTION_CONFIG_DATABASE_ID)
const PROMO_LANCEMENT = {
  formule_id:        'showroom',
  prix_promo:        90,
  prix_normal:       120,
  places_total:      50,
  pourcentage:       25,
  date_fin_affichage:'2026-04-30'  // Après cette date, bannière "terminée" disparaît
};

// Créneaux : max 2 par demi-journée, max 4 par jour
const CRENEAUX = {
  matin:      ['07:30', '08:30', '09:30', '10:30'],
  apres_midi: ['12:00', '13:30', '15:00', '16:30']
};
const CRENEAUX_FLAT        = [...CRENEAUX.matin, ...CRENEAUX.apres_midi];
const MAX_PAR_JOUR         = 4;
const MAX_PAR_DEMI_JOURNEE = 2;
const JOURS_OUVRES               = [1, 2, 3, 4, 5]; // Lundi → Vendredi
const JOURS_MAX_A_L_AVANCE       = 60;
const DELAI_DEPLACEMENT_MINUTES  = 30; // Trajet minimum entre deux RDV

module.exports = {
  ENTREPRISE, FORMULES, SUPPLEMENTS, PROMO_LANCEMENT,
  CRENEAUX, CRENEAUX_FLAT,
  MAX_PAR_JOUR, MAX_PAR_DEMI_JOURNEE,
  JOURS_OUVRES, JOURS_MAX_A_L_AVANCE,
  DELAI_DEPLACEMENT_MINUTES
};
