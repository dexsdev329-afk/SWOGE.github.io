#!/usr/bin/env node
/* ==========================================================================
 * RENDU LOCAL D'ASSETS : GABARIT HTML → PNG, EN LOT, SANS CLE NI SERVICE
 *
 * Tout ce qui est carte X, banniere, badge, visuel de tableau, avatar avec du
 * texte : un gabarit HTML et une liste. Chromium (Playwright) rend chaque
 * entree de `cartes.json` en PNG, a la taille demandee, avec la police et la
 * palette du site. Aucun texte mal orthographie, aucun tirage au sort : le
 * meme JSON donne toujours la meme image.
 *
 *   [ { "nom": "colonie_x", "gabarit": "carte", "largeur": 1600, "hauteur": 900,
 *       "sur": "SWOGE AI", "titre": "A colony, not a bot.",
 *       "lignes": ["12 agents vote on every token", "…"], "pied": "swoge.io" } ]
 *
 * Usage : node rendu.js [cartes.json]
 * Playwright : NODE_PATH=<scratchpad>/pw/node_modules (voir CLAUDE.md du serveur).
 * ======================================================================== */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const fichier = process.argv.slice(2).find((a) => a.endsWith('.json')) || path.join(__dirname, 'cartes.json');
const DOSSIER = path.join(__dirname, 'sorties');
const ECHAPPE = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* `{{cle}}` → valeur echappee ; `{{#lignes}}<li>{{.}}</li>{{/lignes}}` → une
   repetition par element. Assez pour des cartes ; pas un moteur de gabarits. */
function remplit(gabarit, d) {
  let s = gabarit.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, bloc) =>
    (Array.isArray(d[k]) ? d[k] : []).map((v) => bloc.replace(/\{\{\.\}\}/g, ECHAPPE(v))).join(''));
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => ECHAPPE(d[k]));
}

(async () => {
  const liste = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  fs.mkdirSync(DOSSIER, { recursive: true });
  const navigateur = await chromium.launch();
  let n = 0;
  for (const c of liste) {
    const gab = fs.readFileSync(path.join(__dirname, 'gabarits', (c.gabarit || 'carte') + '.html'), 'utf8');
    const largeur = c.largeur || 1600, hauteur = c.hauteur || 900;
    const page = await navigateur.newPage({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: c.echelle || 1 });
    await page.setContent(remplit(gab, Object.assign({ largeur, hauteur }, c)), { waitUntil: 'networkidle' });
    try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch (e) { /* sans police web, la police de repli sert */ }
    const nom = String(c.nom || ('carte_' + (n + 1))).replace(/[^a-zA-Z0-9_\-]/g, '_') + '.png';
    await page.screenshot({ path: path.join(DOSSIER, nom), fullPage: false, omitBackground: !!c.transparent });
    await page.close();
    n++; console.log('  ok  ' + nom + ' (' + largeur + '×' + hauteur + ')');
  }
  await navigateur.close();
  console.log(n + ' image(s) dans ' + DOSSIER);
})().catch((e) => { console.error('RATE : ' + e.message); process.exit(1); });
