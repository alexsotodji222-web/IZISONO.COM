import express from 'express';
import { SUPPORTED_LANGUAGES, CURRENCY_CONFIG, t, formatCurrency } from '../../izisono-config/i18n.js';

const router = express.Router();

/**
 * GET /api/language/list
 * Retourne toutes les langues supportées
 */
router.get('/list', (req, res) => {
  res.json({
    languages: SUPPORTED_LANGUAGES,
    count: Object.keys(SUPPORTED_LANGUAGES).length,
  });
});

/**
 * GET /api/language/config
 * Retourne la configuration de localisation complète
 */
router.get('/config', (req, res) => {
  const currentLang = req.query.lang || req.language || 'fr';
  
  res.json({
    current_language: currentLang,
    supported_languages: SUPPORTED_LANGUAGES,
    currency: {
      code: CURRENCY_CONFIG.code,
      symbol: CURRENCY_CONFIG.symbol,
      name: CURRENCY_CONFIG.name,
      locale: CURRENCY_CONFIG.locale,
    },
    features_by_language: {
      fr: { voice_synthesis: true, lyrics_support: true },
      en: { voice_synthesis: true, lyrics_support: true },
      ee: { voice_synthesis: true, lyrics_support: false },
      ha: { voice_synthesis: true, lyrics_support: false },
      kbp: { voice_synthesis: true, lyrics_support: false },
      tw: { voice_synthesis: false, lyrics_support: false },
      yo: { voice_synthesis: false, lyrics_support: false },
    }
  });
});

/**
 * POST /api/language/translate
 * Traduit une clé i18n
 */
router.post('/translate', (req, res) => {
  const { key, lang = 'fr', params = {} } = req.body;
  
  if (!key) {
    return res.status(400).json({ error: 'Translation key is required' });
  }
  
  if (!SUPPORTED_LANGUAGES[lang]) {
    return res.status(400).json({ error: `Unsupported language: ${lang}` });
  }
  
  const translation = t(key, lang, params);
  
  res.json({
    key,
    lang,
    value: translation,
  });
});

/**
 * GET /api/language/pricing
 * Retourne les tarifs dans la monnaie locale
 */
router.get('/pricing', (req, res) => {
  const lang = req.query.lang || req.language || 'fr';
  
  const pricingPlans = {
    free: {
      name: t('pricing.free', lang),
      description: t('pricing.free_desc', lang),
      price: 0,
      credits: 10,
      features: [
        'Génération 10 crédits/mois',
        'Téléchargement MP3',
        'Accès galerie communautaire',
      ]
    },
    pro: {
      name: t('pricing.pro', lang),
      description: t('pricing.pro_desc', lang),
      price: 4990, // XOF
      priceFormatted: formatCurrency(4990),
      credits: 1000,
      billingCycle: 'monthly',
      features: [
        '1000 crédits/mois',
        'Genres illimités',
        'Paroles personnalisées',
        'Sans filigrane',
        'Support prioritaire',
      ]
    },
    studio: {
      name: t('pricing.studio', lang),
      description: t('pricing.studio_desc', lang),
      price: 9990, // XOF
      priceFormatted: formatCurrency(9990),
      credits: 999999,
      billingCycle: 'monthly',
      features: [
        'Crédits illimités',
        'Toutes les fonctionnalités Pro',
        'API accès',
        'Collaboration en équipe',
        'Support 24/7',
      ]
    }
  };
  
  res.json({
    currency: {
      code: CURRENCY_CONFIG.code,
      symbol: CURRENCY_CONFIG.symbol,
    },
    language: lang,
    plans: pricingPlans,
    note: 'Tarifs en Franc CFA (XOF) - Monnaie du Togo'
  });
});

/**
 * GET /api/language/genres
 * Retourne les genres de musique localisés
 */
router.get('/genres', (req, res) => {
  const lang = req.query.lang || req.language || 'fr';
  
  const genres = {
    'lo-fi': { name: 'Lo-Fi', description: 'Beats relaxants et mélancoliques' },
    'pop': { name: 'Pop', description: 'Musique populaire moderne' },
    'hip-hop': { name: 'Hip-Hop', description: 'Rythmes urbains énergiques' },
    'cinematic': { name: 'Cinématique', description: 'Bandes sonores épiques' },
    'edm': { name: 'EDM', description: 'Electronic Dance Music' },
    'classique': { name: 'Classique', description: 'Musique symphonique' },
    'rock': { name: 'Rock', description: 'Rock énergique' },
    'afrobeat': { name: 'Afrobeat', description: 'Rythmes africains contemporains' },
    'rnb': { name: 'R&B', description: 'Rhythm and Blues' },
    'ambient': { name: 'Ambient', description: 'Musique d\'ambiance apaisante' },
  };
  
  res.json({
    language: lang,
    genres,
    count: Object.keys(genres).length,
  });
});

/**
 * GET /api/language/moods
 * Retourne les humeurs localisées
 */
router.get('/moods', (req, res) => {
  const lang = req.query.lang || req.language || 'fr';
  
  const moods = {
    'melancholic': { name: 'Mélancolique', emoji: '🌧️' },
    'joyful': { name: 'Joyeuse', emoji: '😊' },
    'energetic': { name: 'Énergique', emoji: '⚡' },
    'calm': { name: 'Apaisante', emoji: '🧘' },
    'epic': { name: 'Épique', emoji: '🦁' },
    'nostalgic': { name: 'Nostalgique', emoji: '🕰️' },
  };
  
  res.json({
    language: lang,
    moods,
    count: Object.keys(moods).length,
  });
});

/**
 * GET /api/language/voices
 * Retourne les voix disponibles par langue
 */
router.get('/voices', (req, res) => {
  const lang = req.query.lang || req.language || 'fr';
  
  const voices = {
    fr: [
      { id: 'fr-FR-Denise', name: 'Denise (Féminin)', gender: 'female', accent: 'Neutre' },
      { id: 'fr-FR-Henri', name: 'Henri (Masculin)', gender: 'male', accent: 'Neutre' },
    ],
    en: [
      { id: 'en-US-Aria', name: 'Aria (Féminin)', gender: 'female', accent: 'Américain' },
      { id: 'en-GB-Ryan', name: 'Ryan (Masculin)', gender: 'male', accent: 'Britannique' },
    ],
    ee: [
      { id: 'ee-EE-Ama', name: 'Ama (Féminin)', gender: 'female', accent: 'Ewe' },
    ],
    ha: [
      { id: 'ha-HA-Zainab', name: 'Zainab (Féminin)', gender: 'female', accent: 'Hausa' },
    ],
    kbp: [
      { id: 'kbp-KBP-Kofi', name: 'Kofi (Masculin)', gender: 'male', accent: 'Kabyè' },
    ],
  };
  
  res.json({
    current_language: lang,
    voices: voices[lang] || voices.fr,
    all_languages: Object.keys(voices),
  });
});

/**
 * GET /api/language/stats
 * Statistiques de localisation
 */
router.get('/stats', (req, res) => {
  res.json({
    total_languages: Object.keys(SUPPORTED_LANGUAGES).length,
    languages: SUPPORTED_LANGUAGES,
    currency: CURRENCY_CONFIG.code,
    region: 'Togo (West Africa)',
    timezone: 'UTC+0',
    population_speakers: {
      'fr': '5.2M (Français)',
      'en': '3.1M (Anglais)',
      'ee': '2.1M (Ewe)',
      'ha': '1.8M (Hausa)',
      'kbp': '1.2M (Kabyè)',
      'tw': '0.9M (Twi)',
      'yo': '0.7M (Yoruba)',
    }
  });
});

export default router;
