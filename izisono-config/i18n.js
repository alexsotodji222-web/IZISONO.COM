/**
 * Configuration internationalization (i18n) pour izisono
 * Langues du Togo + Français + Anglais
 */

export const SUPPORTED_LANGUAGES = {
  fr: { name: 'Français', nativeName: 'Français', flag: '🇫🇷' },
  en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
  ee: { name: 'Ewe', nativeName: 'Eʋegbe', flag: '🇹🇬' },
  ha: { name: 'Hausa', nativeName: 'Hausa', flag: '🇹🇬' },
  kbp: { name: 'Kabyè', nativeName: 'Kabyè', flag: '🇹🇬' },
  tw: { name: 'Twi', nativeName: 'Twi', flag: '🇹🇬' },
  yo: { name: 'Yoruba', nativeName: 'Yoruba', flag: '🇹🇬' },
};

export const CURRENCY_CONFIG = {
  // Display currency requested for the Izisono credit shop.
  // PayDunya payment invoices remain XOF because its documented Togo channels are XOF.
  code: 'ZAR',
  symbol: 'ZAR',
  name: 'Rand sud-africain',
  nativeName: 'Rand sud-africain',
  decimals: 2,
  locale: 'fr-ZA',
  payment_code: 'XOF',
  exchange_rates: {
    XOF: 0.02845, // UI-only reference rate: 1 XOF ≈ 0.02845 ZAR (Sep. 10, 2026)
    USD: 1 / 17.5,
    EUR: 1 / 20.4,
  }
};

export const translations = {
  fr: {
    // Header
    'app.title': 'izisono',
    'app.subtitle': 'Créez de la musique avec l\'IA',
    'nav.features': 'Fonctionnalités',
    'nav.genres': 'Genres',
    'nav.library': 'Ma bibliothèque',
    'nav.gallery': 'Galerie',
    'nav.pricing': 'Tarifs',
    'nav.login': 'Se connecter',
    'nav.language': 'Langue',

    // Hero
    'hero.kicker': 'Studio de composition assisté par IA',
    'hero.title': 'Dites ce que vous voulez entendre. <strong>izisono</strong> compose la musique.',
    'hero.subtitle': 'Décrivez une ambiance, collez des paroles ou partez d\'une simple idée : izisono génère un morceau complet en moins d\'une minute.',
    'hero.cta': 'Créer ma musique',

    // Prompt form
    'form.prompt': 'Décrivez votre morceau',
    'form.example': 'Ex. : une ballade lo-fi mélancolique sur un retour à la maison, voix féminine douce',
    'form.genre': 'Genre',
    'form.mood': 'Ambiance',
    'form.language': 'Langue vocale',
    'form.duration': 'Durée',
    'form.submit': 'Générer',
    'form.generating': 'Génération en cours...',

    // Pricing
    'pricing.title': 'Plans d\'abonnement',
    'pricing.free': 'Gratuit',
    'pricing.free_desc': 'Pour débuter',
    'pricing.pro': 'Pro',
    'pricing.pro_desc': 'Pour créateurs sérieux',
    'pricing.studio': 'Studio',
    'pricing.studio_desc': 'Illimité',
    'pricing.per_month': 'par mois',
    'pricing.credits': 'crédits inclus',

    // Messages
    'msg.success': 'Musique générée avec succès!',
    'msg.error': 'Une erreur s\'est produite. Veuillez réessayer.',
    'msg.loading': 'Chargement...',
  },

  en: {
    // Header
    'app.title': 'izisono',
    'app.subtitle': 'Create Music with AI',
    'nav.features': 'Features',
    'nav.genres': 'Genres',
    'nav.library': 'My Library',
    'nav.gallery': 'Gallery',
    'nav.pricing': 'Pricing',
    'nav.login': 'Login',
    'nav.language': 'Language',

    // Hero
    'hero.kicker': 'AI-Assisted Music Studio',
    'hero.title': 'Say what you want to hear. <strong>izisono</strong> creates the music.',
    'hero.subtitle': 'Describe a mood, add lyrics, or start with an idea: izisono generates a complete track in less than a minute.',
    'hero.cta': 'Create My Music',

    // Prompt form
    'form.prompt': 'Describe your track',
    'form.example': 'E.g.: melancholic lo-fi ballad about coming home, soft female voice',
    'form.genre': 'Genre',
    'form.mood': 'Mood',
    'form.language': 'Vocal Language',
    'form.duration': 'Duration',
    'form.submit': 'Generate',
    'form.generating': 'Generating...',

    // Pricing
    'pricing.title': 'Subscription Plans',
    'pricing.free': 'Free',
    'pricing.free_desc': 'To get started',
    'pricing.pro': 'Pro',
    'pricing.pro_desc': 'For serious creators',
    'pricing.studio': 'Studio',
    'pricing.studio_desc': 'Unlimited',
    'pricing.per_month': 'per month',
    'pricing.credits': 'credits included',

    // Messages
    'msg.success': 'Music generated successfully!',
    'msg.error': 'An error occurred. Please try again.',
    'msg.loading': 'Loading...',
  },

  ee: {
    // Header
    'app.title': 'izisono',
    'app.subtitle': 'Wɔ́ ha agbemetata kple AI',
    'nav.features': 'Nusɔsɔ Nusɔnɔsɔ',
    'nav.genres': 'Agbadanu',
    'nav.library': 'Me Library',
    'nav.gallery': 'Agbɔgblɔ',
    'nav.pricing': 'Vidzɔ',
    'nav.login': 'Ku na Kple',
    'nav.language': 'Gbe',

    // Hero
    'hero.kicker': 'AI Agbemetata Studio',
    'hero.title': 'Gblɔ nu si nèlɔ be natrɔ. <strong>izisono</strong> la agbemetata.',
    'hero.subtitle': 'Ɖe agbɔ dɔ ɖa, abe agbe me vɔ alo nusɔ: izisono wu agbemetata bubu na segundu kekeme.',
    'hero.cta': 'Wɔ Agbemetata',

    // Prompt form
    'form.prompt': 'Ɖe agbemetata dɔ ɖa',
    'form.example': 'Abe: lo-fi agbemetata si dzi nu ŋu ƒakuma tso aƒe, nyɔnu ƒe gbe',
    'form.genre': 'Agbadanu',
    'form.mood': 'Dzi ƒu',
    'form.language': 'Gbe Dé',
    'form.duration': 'Akpa',
    'form.submit': 'Wɔ',
    'form.generating': 'Wɔm de le...',

    // Pricing
    'pricing.title': 'Azɔ Ƒome',
    'pricing.free': 'Libre',
    'pricing.free_desc': 'Ate ƒo tsoe',
    'pricing.pro': 'Pro',
    'pricing.pro_desc': 'Na Agbemetṯola gã',
    'pricing.studio': 'Studio',
    'pricing.studio_desc': 'Ɖe Gɔme',
    'pricing.per_month': 'a ŋɔ le',
    'pricing.credits': 'crediti me',

    // Messages
    'msg.success': 'Agbemetata wu ɖe ene!',
    'msg.error': 'Nusɔtakaeme dze. Mía ƒu agbagba.',
    'msg.loading': 'Ðɔm de le...',
  },

  ha: {
    'app.title': 'izisono',
    'app.subtitle': 'Ƙirƙira Kiɗa tare da AI',
    'nav.features': 'Layukan',
    'nav.genres': 'Nau\'i',
    'nav.library': 'Kajewarsa',
    'nav.gallery': 'Baje-baje',
    'nav.pricing': 'Farashin',
    'nav.login': 'Shiga',
    'nav.language': 'Harshe',
    'hero.kicker': 'Gidan Kidoɗe tare da AI',
    'hero.title': 'Fadi abin da kuke so ka ji. <strong>izisono</strong> yana ƙira kiɗa.',
    'hero.subtitle': 'Bayyana jiyya, ƙo waƙoƙi ko fara da ƙarin: izisono yana ƙira kiɗi gaba daya a daƙiƙa kadan.',
    'form.prompt': 'Bayyana kiɗarku',
    'form.genre': 'Nau\'i',
    'form.mood': 'Jiyya',
    'form.language': 'Harshen Murya',
    'form.submit': 'Ƙira',
    'msg.success': 'An ƙira kiɗa da nasara!',
    'msg.error': 'Lahani ya faru. Jiya kayi ƙoƙari.',
  },

  kbp: {
    'app.title': 'izisono',
    'app.subtitle': 'Kuɖu ziŋmu pɛli AI',
    'nav.features': 'Nɔ̃nu',
    'nav.genres': 'Ziŋmu pɛli',
    'nav.library': 'Sɛnɛŋ',
    'nav.gallery': 'Fɔ̃nɔ̃',
    'nav.pricing': 'Piisi',
    'nav.login': 'Sɛnɛ',
    'nav.language': 'Kalɛ',
    'hero.title': 'Gɛ̀ ŋɔlɔ́ a kuli. <strong>izisono</strong> kùɖu ziŋmu.',
    'form.prompt': 'Gɛ̀ ziŋmu pɛli sa',
    'form.genre': 'Ziŋmu pɛli',
    'form.submit': 'Kùɖu',
    'msg.success': 'Ziŋmu kùɖù láku!',
  }
};

/**
 * Fonction de traduction
 */
export function t(key, lang = 'fr', params = {}) {
  let value = translations[lang]?.[key] || translations.fr[key] || key;
  
  // Remplacer les paramètres
  Object.entries(params).forEach(([param, val]) => {
    value = value.replace(`{${param}}`, val);
  });
  
  return value;
}

/**
 * Déterminer la langue préférée
 */
export function detectLanguage() {
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language.split('-')[0];
    return Object.keys(SUPPORTED_LANGUAGES).includes(browserLang) 
      ? browserLang 
      : 'fr';
  }
  return 'fr';
}

/**
 * Formater la monnaie
 */
export function formatCurrency(amount, lang = 'fr') {
  const formatter = new Intl.NumberFormat(CURRENCY_CONFIG.locale, {
    style: 'currency',
    currency: CURRENCY_CONFIG.code,
    minimumFractionDigits: 0,
  });
  return formatter.format(amount);
}

export default {
  SUPPORTED_LANGUAGES,
  CURRENCY_CONFIG,
  translations,
  t,
  detectLanguage,
  formatCurrency,
};
