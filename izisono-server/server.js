import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import billingRoutes from './routes/billing.js';
import lyricsRoutes from './routes/lyrics.js';
import languageRoutes from './routes/language.js';
import musicRoutes from './routes/music.js';
import { CURRENCY_CONFIG, SUPPORTED_LANGUAGES } from '../izisono-config/i18n.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const AUDIO_DIR = path.join(__dirname, 'audio');

// Configuration CORS pour les langues du Togo
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Middleware pour détecter la langue et la monnaie
app.use((req, res, next) => {
  // Détecter la langue depuis l'entête Accept-Language ou le query param
  const browserLang = req.acceptsLanguages(Object.keys(SUPPORTED_LANGUAGES));
  req.language = req.query.lang || req.headers['accept-language']?.split(',')[0]?.split('-')[0] || browserLang || 'fr';
  req.currency = CURRENCY_CONFIG;
  next();
});

// Le webhook Stripe a besoin du corps brut
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Routes API
app.use('/api', musicRoutes);
app.use('/api', lyricsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/language', languageRoutes);

// Fichiers audio générés
app.use('/audio', express.static(AUDIO_DIR));

// Frontend statique
app.use(express.static(path.join(__dirname, '..', 'izisono-frontend')));

// Route info pour les informations de configuration
app.get('/api/config', (req, res) => {
  res.json({
    app: 'izisono',
    supabase: { url: process.env.SUPABASE_URL || '', publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '' },
    version: '1.0.0',
    languages: SUPPORTED_LANGUAGES,
    currency: {
      code: CURRENCY_CONFIG.code,
      symbol: CURRENCY_CONFIG.symbol,
      name: CURRENCY_CONFIG.name,
    },
    features: {
      multilingual: true,
      localCurrency: true,
      aiGeneration: true,
      communityGallery: true,
    }
  });
});


// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'izisono' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'izisono-frontend', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🎵 izisono backend prêt sur http://localhost:${port}`);
  console.log(`📍 Localisation: Togo (Francophone)`);
  console.log(`💱 Monnaie: ${CURRENCY_CONFIG.name} (${CURRENCY_CONFIG.code})`);
  console.log(`🌍 Langues: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
  console.log(`🤖 Fournisseur: ${process.env.MUSIC_PROVIDER || 'mock'}`);
});
