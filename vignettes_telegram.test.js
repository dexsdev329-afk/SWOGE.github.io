/* CHAQUE JEU ANNONCE PAR TELEGRAM DOIT AVOIR SA VIGNETTE.
 *
 * Le serveur envoie ses annonces avec `sendPhoto` et une adresse construite
 * a partir de la cle du jeu : `media/jeu-<cle>.jpg`. Quand le fichier
 * n'existe pas, Telegram refuse la photo et `notifyPhoto` retombe sur un
 * message TEXTE — l'annonce part quand meme, mais nue, au milieu d'un canal
 * ou toutes les autres sont illustrees.
 *
 * C'EST EXACTEMENT CE QUI EST ARRIVE A SWOGE BONANZA. Le jeu etait branche
 * partout — `NOM_TABLE`, `PAGE_JEU`, l'appel a `notifyTableWin` — et son
 * annonce partait vraiment ; il ne manquait qu'un fichier image, et rien ne
 * le disait. Ni erreur au demarrage, ni echec d'essai : juste une annonce
 * qui ne ressemblait pas aux autres, et un joueur pour le remarquer.
 *
 * Cet essai lit les tables du serveur et exige le fichier. Il ne se contente
 * pas de son existence : un WebP renomme en .jpg passerait le test du nom et
 * serait refuse par Telegram tout pareil, donc on verifie le FORMAT reel.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const SITE = __dirname;

if (!fs.existsSync(path.join(SERVEUR, 'server.js'))) {
  console.log('vignettes_telegram.test.js : depot du serveur introuvable — essai saute');
  process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const src = fs.readFileSync(path.join(SERVEUR, 'server.js'), 'utf8');

/* Tout le corps est enveloppe : le controle en ligne, a la fin, est
   asynchrone. */
(async () => {

/** Les cles d'une table ecrite en toutes lettres dans server.js. On lit le
 *  fichier plutot que de recopier la liste : une liste recopiee vieillit, et
 *  c'est precisement le genre d'oubli que cet essai existe pour attraper. */
function clesDe(nom) {
  const i = src.indexOf('const ' + nom + ' = {');
  if (i < 0) return null;
  const j = src.indexOf('};', i);
  const bloc = src.slice(i, j);
  const cles = [];
  const re = /(?:^|[{,\s])([a-z0-9_]+)\s*:/gi;
  let m;
  while ((m = re.exec(bloc))) cles.push(m[1]);
  return cles;
}

const noms = clesDe('NOM_TABLE');
const pages = clesDe('PAGE_JEU');
ok(!!noms && noms.length > 5, 'NOM_TABLE se lit dans server.js (' + (noms ? noms.length : 0) + ' jeux)');
ok(!!pages && pages.length > 5, 'PAGE_JEU se lit dans server.js (' + (pages ? pages.length : 0) + ' jeux)');
if (!noms || !pages) { console.log('\n' + n + ' verifications, ' + (rates + 1) + ' echec(s)'); process.exit(1); }

/* `paris` est le seul jeu dont l'image se choisit par sport : il a bien
   `jeu-paris.jpg` en repli, et cinq variantes en plus. Rien a excepter. */
const manquantes = [];
const malFormees = [];
for (const cle of noms) {
  const f = path.join(SITE, 'media', 'jeu-' + cle + '.jpg');
  if (!fs.existsSync(f)) { manquantes.push(cle); continue; }
  /* Les deux premiers octets d'un JPEG sont FF D8. Un WebP commence par
     « RIFF », un PNG par 0x89 « PNG » — les deux seraient refuses par
     Telegram malgre l'extension. */
  const tete = fs.readFileSync(f).subarray(0, 2);
  if (!(tete[0] === 0xFF && tete[1] === 0xD8)) malFormees.push(cle);
}
ok(manquantes.length === 0,
   'chaque jeu de NOM_TABLE a son media/jeu-<cle>.jpg'
   + (manquantes.length ? ' — MANQUE : ' + manquantes.join(', ') : ' (' + noms.length + ' verifiees)'));
ok(malFormees.length === 0,
   'et chacune est un VRAI JPEG, pas un autre format renomme'
   + (malFormees.length ? ' — FAUX : ' + malFormees.join(', ') : ''));

/* L'autre moitie de l'annonce : le lien « Play this table ». Une cle
   presente dans NOM_TABLE mais absente de PAGE_JEU donne une annonce qui
   nomme le jeu sans y mener. */
const sansPage = noms.filter((c) => pages.indexOf(c) < 0);
ok(sansPage.length === 0,
   'chaque jeu annonce mene aussi a sa page'
   + (sansPage.length ? ' — SANS LIEN : ' + sansPage.join(', ') : ''));

/* Et la page visee existe vraiment sur le site. */
const pagesMortes = [];
const rePage = /([a-z0-9_]+)\s*:\s*'([^']+\.html)/gi;
const iP = src.indexOf('const PAGE_JEU = {');
const blocP = src.slice(iP, src.indexOf('};', iP));
let mp;
while ((mp = rePage.exec(blocP))) {
  const fichier = mp[2].split('?')[0];
  if (!fs.existsSync(path.join(SITE, fichier))) pagesMortes.push(mp[1] + ' → ' + fichier);
}
ok(pagesMortes.length === 0,
   'et cette page existe sur le site'
   + (pagesMortes.length ? ' — MORTE : ' + pagesMortes.join(', ') : ''));

/* ---- ET ELLE DOIT ETRE EN LIGNE, PAS SEULEMENT DANS LE DEPOT ----
 * Telegram ne recoit pas le fichier : il recoit une ADRESSE, et va la
 * chercher lui-meme. Une vignette presente dans le depot mais pas encore
 * publiee passe tout ce qui precede et echoue quand meme dans le canal.
 * On demande donc l'adresse que le serveur construit VRAIMENT.
 * Sans reseau, on saute : un essai qui echoue faute de reseau apprend a ne
 * plus le croire. */
const mBase = /GAME_IMAGE_BASE:\s*env\('GAME_IMAGE_BASE',\s*'([^']+)'/.exec(
  fs.readFileSync(path.join(SERVEUR, 'config.js'), 'utf8'));
const mTirage = /const TIRAGE_VIGNETTES = (\d+)/.exec(src);
if (mBase && mTirage && !process.env.SWOGE_SANS_RESEAU) {
  const base = mBase[1].replace(/\/+$/, '');
  const cles = ['bonanza'].concat(noms.filter((c) => c !== 'bonanza').slice(0, 2));
  const vues = [];
  for (const cle of cles) {
    const u = `${base}/jeu-${cle}.jpg?v=${mTirage[1]}`;
    try {
      const r = await fetch(u, { method: 'GET', signal: AbortSignal.timeout(20000) });
      const type = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      vues.push({ cle, code: r.status, type, taille: buf.length,
                  jpeg: buf[0] === 0xFF && buf[1] === 0xD8 });
    } catch (e) { vues.push({ cle, erreur: e.message }); }
  }
  if (vues.some((v) => v.erreur)) {
    console.log('  --   reseau indisponible, controle en ligne saute ('
                + vues.find((v) => v.erreur).erreur + ')');
  } else {
    const b = vues[0];
    ok(b.code === 200 && b.jpeg,
       'la vignette de Bonanza repond A L ADRESSE QUE LE SERVEUR ENVOIE'
       + ' (HTTP ' + b.code + ', ' + b.taille + ' octets, JPEG ' + b.jpeg + ')'
       + ' — sans ca Telegram refuse la photo et l annonce part en texte nu');
    ok(vues.every((v) => v.code === 200 && v.jpeg),
       'et les autres vignettes controlees aussi ('
       + vues.map((v) => v.cle + ' ' + v.code).join(', ') + ')');
  }
}

console.log('\n' + n + ' verifications, ' + rates + ' echec(s)');
process.exit(rates ? 1 : 0);
})();
