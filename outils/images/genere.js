#!/usr/bin/env node
/* ==========================================================================
 * GENERATION D'IMAGES EN LOT, PAR L'API D'IMAGES D'OPENAI
 *
 * « A chaque fois je dois passer par ChatGPT, prompt par prompt. » Ici on
 * donne une liste, et tout part d'un coup. Le script lit `prompts.json` :
 *
 *   [ { "nom": "colonie_x", "prompt": "…", "size": "1536x1024",
 *       "quality": "medium", "background": "transparent" }, … ]
 *
 * et ecrit `sorties/<nom>.png`. La cle vit dans l'environnement
 * (OPENAI_API_KEY), jamais dans le depot. Sans cle, il montre ce qu'il ferait
 * et s'arrete. Les parametres (model, size, quality, background,
 * output_format, n) sont ceux de l'API d'images, lus dans le SDK officiel
 * openai-node (src/resources/images.ts) le 17/09/2026 :
 *   size     : 1024x1024 · 1024x1536 · 1536x1024 · auto
 *   quality  : low · medium · high · xhigh · max · auto
 *   models   : gpt-image-1 · gpt-image-1-mini · gpt-image-1.5 · gpt-image-2 …
 *
 * Usage :
 *   OPENAI_API_KEY=sk-… node genere.js [prompts.json] [--modele gpt-image-1.5]
 *       [--taille 1536x1024] [--qualite medium] [--parallele 3] [--force]
 * ======================================================================== */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const fichier = args.find((a) => !a.startsWith('--') && a.endsWith('.json')) || path.join(__dirname, 'prompts.json');
const MODELE = opt('modele', process.env.IMAGES_MODELE || 'gpt-image-1');
const TAILLE = opt('taille', '1536x1024');
const QUALITE = opt('qualite', 'medium');
const PARALLELE = Math.max(1, parseInt(opt('parallele', '3'), 10) || 3);
const FORCE = args.includes('--force');
const DOSSIER = path.join(__dirname, 'sorties');
const CLE = process.env.OPENAI_API_KEY || '';

function lisPrompts() {
  const brut = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const liste = Array.isArray(brut) ? brut : (brut.images || []);
  return liste.map((x, i) => ({
    nom: String(x.nom || ('image_' + (i + 1))).replace(/[^a-zA-Z0-9_\-]/g, '_'),
    prompt: String(x.prompt || '').trim(),
    size: x.size || TAILLE, quality: x.quality || QUALITE,
    background: x.background || undefined, output_format: x.output_format || 'png',
    n: Math.max(1, Math.min(4, parseInt(x.n || 1, 10) || 1)),
  })).filter((x) => x.prompt);
}

async function genere(p) {
  const corps = { model: MODELE, prompt: p.prompt, size: p.size, quality: p.quality, n: p.n, output_format: p.output_format };
  if (p.background) corps.background = p.background;
  for (let essai = 1; essai <= 3; essai++) {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CLE },
      body: JSON.stringify(corps),
    });
    if (r.status === 429 || r.status >= 500) {
      const attente = 2000 * essai;
      console.warn('  ' + p.nom + ' : HTTP ' + r.status + ', nouvel essai dans ' + attente / 1000 + ' s');
      await new Promise((ok) => setTimeout(ok, attente));
      continue;
    }
    const j = await r.json();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' : ' + ((j.error && j.error.message) || JSON.stringify(j)).slice(0, 200));
    const sorties = [];
    (j.data || []).forEach((d, i) => {
      if (!d.b64_json) return;
      const nom = p.nom + (p.n > 1 ? '_' + (i + 1) : '') + '.' + p.output_format;
      fs.writeFileSync(path.join(DOSSIER, nom), Buffer.from(d.b64_json, 'base64'));
      sorties.push(nom);
    });
    return { sorties, usage: j.usage || null };
  }
  throw new Error('trois essais, toujours refuse');
}

(async () => {
  const liste = lisPrompts();
  if (!liste.length) { console.error('rien a generer dans ' + fichier); process.exit(1); }
  fs.mkdirSync(DOSSIER, { recursive: true });
  const aFaire = liste.filter((p) => FORCE || !fs.existsSync(path.join(DOSSIER, p.nom + '.' + p.output_format)));
  console.log(liste.length + ' image(s) dans ' + path.basename(fichier) + ' · ' + aFaire.length + ' a generer'
    + ' · modele ' + MODELE + ' · ' + PARALLELE + ' en parallele');
  if (!CLE) {
    console.log('\nPas de OPENAI_API_KEY dans l environnement : voici ce qui partirait, et rien ne part.');
    for (const p of aFaire) console.log('  - ' + p.nom + ' [' + p.size + ', ' + p.quality + '] ' + p.prompt.slice(0, 90) + (p.prompt.length > 90 ? '…' : ''));
    process.exit(2);
  }
  let i = 0, ok = 0, rate = 0;
  const debut = Date.now();
  await Promise.all(Array.from({ length: PARALLELE }, async () => {
    while (i < aFaire.length) {
      const p = aFaire[i++];
      try {
        const r = await genere(p);
        ok++; console.log('  ok  ' + r.sorties.join(', ') + (r.usage ? ' · ' + (r.usage.total_tokens || '?') + ' jetons' : ''));
      } catch (e) { rate++; console.error('  RATE ' + p.nom + ' : ' + e.message); }
    }
  }));
  console.log('\n' + ok + ' generee(s), ' + rate + ' ratee(s), ' + Math.round((Date.now() - debut) / 1000) + ' s · dossier ' + DOSSIER);
  process.exit(rate ? 1 : 0);
})();
