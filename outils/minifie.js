#!/usr/bin/env node
/* ==========================================================================
 * LE JUMEAU MINIFIE DES SCRIPTS PARTAGES
 *
 * `stakebubble.js` fait 448 Ko dont 42 % de commentaires — c'est voulu : le
 * fichier est sa propre documentation, et il le reste. Mais il est charge par
 * trente pages, synchrone, et c'est le premier poste de tout ce qui pese sur
 * le rendu (Lighthouse du 17 septembre : 2,7 s de blocage a lui seul sur une
 * connexion mobile simulee). Compresse par GitHub Pages, il transfere
 * 141 Ko ; minifie puis compresse, 49 Ko.
 *
 * Ce script ecrit `<nom>.min.js` a cote du source, avec en tete l'empreinte du
 * source qu'il a lu. `minifie.test.js` echoue des que le source a change sans
 * que le jumeau soit regenere — comme le marqueur de cache. On n'edite jamais
 * le .min : on edite le source et on relance `node outils/minifie.js`.
 *
 * Terser vit dans le dossier des dependances d'essai (~/.swoge-pw, pose par
 * le crochet de demarrage), jamais dans le depot.
 * ======================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SITE = path.join(__dirname, '..');
const SOURCES = ['stakebubble.js'];
const empreinte = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

let terser;
try { terser = require('terser'); }
catch (e) { try { terser = require(path.join(process.env.HOME || '/root', '.swoge-pw', 'node_modules', 'terser')); }
  catch (e2) { console.error('terser introuvable : NODE_PATH=~/.swoge-pw/node_modules ou npm install terser@5 dans ~/.swoge-pw'); process.exit(2); } }

(async () => {
  for (const nom of SOURCES) {
    const src = fs.readFileSync(path.join(SITE, nom), 'utf8');
    const e = empreinte(src);
    const r = await terser.minify(src, { compress: true, mangle: true, format: { comments: false } });
    if (r.error) throw r.error;
    const tete = '/* SWOGE — ' + nom.replace(/\.js$/, '.min.js') + ' : genere par outils/minifie.js depuis ' + nom
      + ' (empreinte ' + e + '). Ne pas editer ; editer ' + nom + ' puis relancer. */\n';
    const cible = path.join(SITE, nom.replace(/\.js$/, '.min.js'));
    fs.writeFileSync(cible, tete + r.code + '\n');
    console.log('  ok  ' + path.basename(cible) + ' : ' + src.length + ' → ' + (tete.length + r.code.length) + ' octets (source ' + e + ')');
  }
})().catch((e) => { console.error('RATE : ' + e.message); process.exit(1); });
