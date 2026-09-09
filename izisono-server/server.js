import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import billingRoutes from './routes/billing.js';
import lyricsRoutes from './routes/lyrics.js';
import languageRoutes from './routes/language.js';
import musicRoutes, { recoverPendingGenerations } from './routes/music.js';
import adminRoutes from './routes/admin.js';
import { CURRENCY_CONFIG, SUPPORTED_LANGUAGES } from '../izisono-config/i18n.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const AUDIO_DIR = path.join(__dirname, 'audio');
const FRONTEND_DIR = path.join(__dirname, '..', 'izisono-frontend');
const allowedOrigins = new Set(String(process.env.CLIENT_URL || 'http://localhost:3000').split(',').map(x=>x.trim()).filter(Boolean));

// Configuration CORS pour les langues du Togo
app.use(cors({
  origin: (origin, cb) => { if (!origin || allowedOrigins.has(origin)) return cb(null, true); cb(new Error('cors_origin_not_allowed')); },
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

// Public runtime configuration must be registered before the generic /api routers.
app.get('/api/config', (req, res) => {
  res.set('Cache-Control','no-store');
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

// Routes API
app.use('/api', musicRoutes);
app.use('/api', lyricsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/language', languageRoutes);
app.use('/api/admin', adminRoutes);

// Fichiers audio générés
app.use('/audio', express.static(AUDIO_DIR));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'izisono' });
});

app.get('/admin', (_req,res) => res.sendFile(path.join(FRONTEND_DIR, 'admin.html')));

// Serve the main browser module explicitly. This avoids Render/static-middleware
// edge cases that can turn /script.js into a 500 and leave the auth buttons dead.
app.get('/script.js', async (_req, res) => {
  try {
    const source = await fs.readFile(path.join(FRONTEND_DIR, 'script.js'), 'utf8');
    res.set({ 'Content-Type':'application/javascript; charset=UTF-8', 'Cache-Control':'no-store' });
    res.status(200).send(source);
  } catch (error) {
    console.error('Failed to serve frontend script:', error);
    res.status(500).type('text/plain').send('frontend_script_unavailable');
  }
});

// Frontend statique
app.use(express.static(FRONTEND_DIR, { fallthrough: true }));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  console.log(`🎵 izisono backend prêt sur http://localhost:${port}`);
  console.log(`📍 Localisation: Togo (Francophone)`);
  console.log(`💱 Monnaie: ${CURRENCY_CONFIG.name} (${CURRENCY_CONFIG.code})`);
  console.log(`🌍 Langues: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`);
  console.log(`🤖 Fournisseur: ${process.env.MUSIC_PROVIDER || 'mureka'}`);
  await recoverPendingGenerations();
  setInterval(() => recoverPendingGenerations().catch(()=>{}), 5 * 60 * 1000);
});
