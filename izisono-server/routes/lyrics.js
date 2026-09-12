import express from 'express';
const router = express.Router();
router.post('/lyrics/generate', (req,res) => {
  const { subject='mon histoire', occasion='autre', language='fr', style='afrobeat' } = req.body || {};
  const templates = {
    fr: `[Couplet 1]\nAujourd'hui ${subject} devient une mélodie\nUne histoire qui mérite d'être chantée ici\n\n[Refrain]\nCette chanson est pour toi, ${occasion}\nQue la vie danse au rythme de nos émotions\n\n[Couplet 2]\nChaque souvenir prend une nouvelle couleur\nEt la musique garde tout ce qu'il y a dans nos cœurs`,
    en: `[Verse 1]\nToday ${subject} becomes a melody\nA story that deserves to be sung\n\n[Chorus]\nThis song is for you, ${occasion}\nLet life dance with every emotion\n\n[Verse 2]\nEvery memory finds a brand new color\nAnd music keeps what lives inside our hearts`
  };
  res.json({ lyrics: templates[language] || templates.fr, style });
});
export default router;
