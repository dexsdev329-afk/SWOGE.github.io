/* ==========================================================================
 * LE JUMEAU MINIFIE EST A JOUR — SINON LA PAGE SERT UN VIEUX SCRIPT
 *
 * Meme logique que le marqueur de cache : un `stakebubble.js` edite sans
 * relancer `node outils/minifie.js` laisse trente pages charger un jumeau
 * perime, et rien ne le dit. Cet essai le dit, et donne la commande.
 * ======================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const empreinte = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

for (const nom of ['stakebubble.js']) {
  const min = nom.replace(/\.js$/, '.min.js');
  const src = fs.readFileSync(path.join(SITE, nom), 'utf8');
  const existe = fs.existsSync(path.join(SITE, min));
  ok(existe, min + ' existe');
  if (!existe) continue;
  const code = fs.readFileSync(path.join(SITE, min), 'utf8');
  const m = code.match(/\(empreinte ([0-9a-f]{8})\)/);
  ok(!!m && m[1] === empreinte(src),
     m && m[1] === empreinte(src)
       ? min + ' porte l empreinte du source (' + m[1] + ')'
       : min + ' est perime : le source vaut ' + empreinte(src) + ', le jumeau dit ' + (m ? m[1] : 'rien') + ' — lancer node outils/minifie.js');
  let parse = true; try { new vm.Script(code, { filename: min }); } catch (e) { parse = false; }
  ok(parse, min + ' se lit comme du JavaScript');
  ok(code.length < src.length * 0.6, min + ' fait moins de 60 % du source (' + code.length + ' / ' + src.length + ')');
  /* Les pages chargent le jumeau, jamais le source : le source reste la
     documentation, le jumeau ce qui part sur le reseau. */
  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
  const brut = pages.filter((f) => new RegExp('src="' + nom.replace('.', '\\.') + '(\\?|")').test(fs.readFileSync(path.join(SITE, f), 'utf8')));
  ok(brut.length === 0, brut.length ? 'ces pages chargent encore le source non minifie : ' + brut.join(', ') : 'aucune page ne charge le source non minifie');
}
console.log(`\nminifie.test.js : ${n} verifications, ${rates} echec(s)`);
process.exit(rates ? 1 : 0);
