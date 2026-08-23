'use strict';
/*
 * LE MARQUEUR DE CACHE EST L'EMPREINTE DU FICHIER, PAS UNE DATE.
 *
 * ---- CE QUI EST ARRIVE ----
 *
 * Le proprietaire voyait la maison manga sur la place, et pas celle des
 * series. Les deux etaient dans le code, toutes deux commitees, et la page
 * les DESSINAIT toutes les deux — mesure faite, 360x283 a 1100,1557. Le
 * defaut n'etait pas dans le dessin, il etait dans la livraison :
 *
 *   9364efd  la maison manga arrive    marqueur 20260825a   bumpe
 *   a0b84a5  la maison series arrive   marqueur 20260825a   PAS bumpe
 *
 * La maison manga est partie avec un marqueur neuf, donc les navigateurs ont
 * recharge le script. Celle des series est partie sous un marqueur qu'ils
 * avaient deja en cache : ils n'ont jamais redemande le fichier. Le travail
 * etait fait, pousse, correct — et invisible.
 *
 * La meme omission s'est reproduite deux fois de suite ensuite, emportant le
 * portail +18 et une correction de collision. Trois fois le meme oubli, ce
 * n'est plus un oubli : c'est une regle qui n'a pas de gardien.
 *
 * ---- CE QUE CET ESSAI IMPOSE ----
 *
 * Un marqueur ecrit a la main peut toujours etre oublie. Un marqueur DERIVE
 * du contenu ne le peut pas : si le fichier change, son empreinte change, et
 * cet essai tombe tant que la page ne porte pas la nouvelle. Il ne se
 * contente pas de dire « tu as oublie » — il donne la valeur a ecrire.
 *
 * Aucun nom de fichier n'est inscrit ici : on releve les couples
 * (script, marqueur) dans les pages elles-memes. Un sixieme script versionne
 * sera couvert le jour ou il apparait, sans qu'on y pense.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok   ' + m); };

const SITE = __dirname;
const empreinte = (f) =>
  crypto.createHash('md5').update(fs.readFileSync(path.join(SITE, f))).digest('hex').slice(0, 8);

/* Les couples releves dans les pages, jamais recopies ici. */
const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
const trouves = [];
for (const p of pages) {
  const src = fs.readFileSync(path.join(SITE, p), 'utf8');
  for (const m of src.matchAll(/([A-Za-z0-9_]+\.js)\?v=([0-9a-z]+)/g)) {
    trouves.push({ page: p, script: m[1], marque: m[2] });
  }
}

console.log('-- ce que les pages declarent --');
ok(pages.length > 5, `${pages.length} pages relues`);
/* Sans ce seuil, « tous les marqueurs sont bons » serait vrai d'un site qui
   n'en aurait plus un seul — et l'essai feliciterait le vide le jour ou la
   relecture ci-dessus cesse de trouver quoi que ce soit. */
ok(trouves.length >= 20, `${trouves.length} marqueurs de cache trouves`);
const scripts = [...new Set(trouves.map((t) => t.script))].sort();
ok(scripts.length >= 2, `sur ${scripts.length} scripts : ${scripts.join(', ')}`);

console.log('\n-- chaque marqueur est l empreinte de son fichier --');
for (const s of scripts) {
  const f = path.join(SITE, s);
  if (!fs.existsSync(f)) { ok(false, `${s} : le fichier versionne n'existe pas`); continue; }
  const attendu = empreinte(s);
  const portes = trouves.filter((t) => t.script === s);
  const mauvais = portes.filter((t) => t.marque !== attendu);
  ok(mauvais.length === 0,
     mauvais.length === 0
       ? `${s} : ${portes.length} page(s) portent ${attendu}`
       : `${s} : ${mauvais.length} page(s) portent un marqueur perime — ` +
         `ecrire ${attendu} dans ${[...new Set(mauvais.map((t) => t.page))].join(', ')}`);
}

console.log('\n-- et le meme script porte la meme marque partout --');
for (const s of scripts) {
  const vues = new Set(trouves.filter((t) => t.script === s).map((t) => t.marque));
  ok(vues.size === 1,
     `${s} : une seule marque en circulation${vues.size === 1 ? '' : ' — ' + [...vues].join(' / ')}`);
}

console.log(`\ncache_marqueur.test.js : ${n} verifications OK`);
