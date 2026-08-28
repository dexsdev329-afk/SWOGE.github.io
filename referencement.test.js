'use strict';
/*
 * CHAQUE PAGE A SON ICONE, ET DE QUOI ETRE TROUVEE.
 *
 * ---- ce qui etait signale ----
 *
 * « Dans les recherches Google on a du mal a trouver le site, il n'y a pas
 * d'icone sur toutes les pages en haut, aussi le SEO tu pourrais l'ameliorer. »
 *
 * ---- ce que l'audit a trouve ----
 *
 *   L'icone : 23 pages sur 28 n'en avaient AUCUNE. Les 5 restantes pointaient
 *   vers trois fichiers differents, dont `img/favicon.png`, qui n'existe pas.
 *
 *   Le partage : aucune balise Open Graph nulle part sauf trois lignes sur le
 *   white paper. Un lien colle dans Telegram, sur X ou dans Discord n'affichait
 *   ni titre, ni resume, ni image — juste l'adresse nue. Pour un projet qui vit
 *   dans Telegram, c'est le lien lui-meme qui fait la vitrine.
 *
 *   Le reste : aucune adresse canonique, pas de `robots.txt`, pas de
 *   `sitemap.xml`, neuf pages sans resume — dont l'accueil et le hall — deux
 *   pages annoncees en francais alors qu'elles sont en anglais, deux sans
 *   langue du tout, et un titre d'accueil reduit a « SWOGE WORLD », qui ne
 *   contient aucun des mots qu'on taperait pour le trouver.
 *
 *   Et une page a mettre HORS des moteurs de toute urgence : `wallet-export`,
 *   qui affiche une cle privee.
 *
 * ---- ce que cet essai tient ----
 *
 * Il lit les vingt-huit pages et verifie, pour chacune, ce qu'un robot verifie.
 * Il controle aussi que les fichiers pointes EXISTENT — c'est precisement la ou
 * l'ancienne icone echouait, et un lien vers un fichier absent se lit comme une
 * icone posee.
 */
const fs = require('fs');
const path = require('path');

const SITE = __dirname;
const DOMAINE = 'https://swoleeswoge.dog';
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const lis = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
const un = (s, re) => { const m = s.match(re); return m ? m[1] : null; };

const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).sort();

/* ---- les fichiers que tout le site attend ---- */
console.log('-- les fichiers de la racine --');
for (const f of ['robots.txt', 'sitemap.xml', 'site.webmanifest', 'favicon.ico',
                 'img/site/icone-32.png', 'img/site/icone-180.png',
                 'img/site/icone-512.png', 'img/site/partage.jpg']) {
  ok(fs.existsSync(path.join(SITE, f)), `${f} existe`);
}
{
  const r = lis('robots.txt');
  ok(r.includes(`Sitemap: ${DOMAINE}/sitemap.xml`), 'robots.txt annonce le sitemap');
  ok(r.includes('Disallow: /wallet-export.html'),
     'robots.txt tient la page de la cle privee a l ecart');
  const m = JSON.parse(lis('site.webmanifest'));
  ok(Array.isArray(m.icons) && m.icons.length >= 2, 'le manifeste porte ses icones');
  for (const i of m.icons) {
    ok(fs.existsSync(path.join(SITE, i.src.replace(/^\//, ''))),
       `  et ${i.src} existe vraiment`);
  }
}

/* ---- le sitemap ne liste que ce qui est indexable ---- */
console.log('\n-- le sitemap --');
{
  const s = lis('sitemap.xml');
  const listees = [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(listees.length > 0, `${listees.length} adresses listees`);
  const horsMoteur = pages.filter((f) => /name="robots"[^>]*noindex/.test(lis(f)));
  const fautives = listees.filter((u) => {
    const f = u.replace(DOMAINE + '/', '') || 'index.html';
    return horsMoteur.includes(f);
  });
  ok(fautives.length === 0,
     fautives.length ? `le sitemap liste des pages en noindex : ${fautives.join(', ')}`
                     : `aucune page en noindex n y figure (${horsMoteur.length} ecartees)`);
  const manquantes = pages.filter((f) => !horsMoteur.includes(f))
    .filter((f) => !listees.includes(DOMAINE + '/' + (f === 'index.html' ? '' : f)));
  ok(manquantes.length === 0,
     manquantes.length ? `absentes du sitemap : ${manquantes.join(', ')}`
                       : 'et toutes les pages indexables y sont');
}

/* ---- page par page ---- */
console.log(`\n-- les ${pages.length} pages --`);
for (const f of pages) {
  const s = lis(f);
  const horsMoteur = /name="robots"[^>]*noindex/.test(s);

  /* L icone, sur TOUTES les pages — c'est le point signale. */
  const icones = [...s.matchAll(/<link[^>]*rel="(?:[^"]*\s)?(?:icon|apple-touch-icon)(?:\s[^"]*)?"[^>]*href="([^"]+)"/g)]
    .map((m) => m[1]);
  ok(icones.length >= 2, `${f} : ${icones.length} icone(s) declaree(s)`);
  const absents = icones.filter((h) => !fs.existsSync(path.join(SITE, h.replace(/^\//, ''))));
  ok(absents.length === 0,
     absents.length ? `${f} : icone vers un fichier ABSENT — ${absents.join(', ')}`
                    : `${f} : et chaque fichier pointe existe`);

  /* La langue : declaree, et une seule fois. */
  const lang = un(s, /<html[^>]*\slang="([a-z-]+)"/);
  ok(!!lang, lang ? `${f} : langue declaree (${lang})` : `${f} : aucune langue declaree`);

  if (horsMoteur) {
    ok(!/property="og:/.test(s),
       `${f} : hors des moteurs, et sans balise de partage — c est voulu`);
    continue;
  }

  const titre = un(s, /<title>([\s\S]*?)<\/title>/);
  ok(titre && titre.trim().length >= 15 && titre.length <= 70,
     `${f} : titre de ${titre ? titre.trim().length : 0} signes — « ${titre ? titre.trim() : ''} »`);

  const desc = un(s, /<meta name="description" content="([^"]*)"/);
  ok(desc && desc.length >= 60 && desc.length <= 320,
     desc ? `${f} : resume de ${desc.length} signes`
          : `${f} : AUCUN resume — c est la ligne que Google affiche sous le titre`);

  const canon = un(s, /<link rel="canonical" href="([^"]+)"/);
  const attendue = DOMAINE + '/' + (f === 'index.html' ? '' : f);
  ok(canon === attendue,
     canon === attendue ? `${f} : adresse canonique juste`
                        : `${f} : canonique « ${canon} » au lieu de « ${attendue} »`);

  for (const b of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
    const v = un(s, new RegExp('<meta property="' + b + '" content="([^"]*)"'));
    ok(!!v && v.length > 0, `${f} : ${b} presente`);
  }
  const img = un(s, /<meta property="og:image" content="([^"]+)"/);
  ok(img && img.startsWith('https://'),
     `${f} : l image de partage est en adresse absolue`);
  ok(img && fs.existsSync(path.join(SITE, img.replace(DOMAINE + '/', ''))),
     img ? `${f} : et le fichier ${img.replace(DOMAINE + '/', '')} existe`
         : `${f} : image de partage absente`);
  ok(/name="twitter:card" content="summary_large_image"/.test(s),
     `${f} : carte X en grand format`);

  /* ---- ET PAS DEUX FOIS LA MEME BALISE ----
   * Le white paper portait deja trois balises Open Graph, ecrites a la main,
   * dont une image en adresse RELATIVE — qu'un robot lisant la page depuis son
   * propre serveur ne sait pas resoudre. Avec le bloc commun par-dessus, la
   * page en annoncait deux, et selon le lecteur c'est l'une ou l'autre qui
   * gagne. Une balise en double n'est pas une balise de plus, c'est une
   * reponse qu'on ne controle plus. */
  for (const b of ['og:title', 'og:description', 'og:image', 'og:url']) {
    const c = (s.match(new RegExp('<meta property="' + b + '"', 'g')) || []).length;
    ok(c === 1, c === 1 ? `${f} : ${b} declaree une seule fois`
                        : `${f} : ${b} declaree ${c} fois — laquelle gagne ?`);
  }
}

/* ---- deux pages ne peuvent pas porter le meme titre ---- */
console.log('\n-- pas deux fois le meme titre, ni le meme resume --');
{
  const vus = new Map(), vusD = new Map();
  for (const f of pages) {
    const s = lis(f);
    if (/name="robots"[^>]*noindex/.test(s)) continue;
    const t = (un(s, /<title>([\s\S]*?)<\/title>/) || '').trim();
    vus.set(t, (vus.get(t) || []).concat(f));
    const d = (un(s, /<meta name="description" content="([^"]*)"/) || '').trim();
    if (d) vusD.set(d, (vusD.get(d) || []).concat(f));
  }
  const doublesT = [...vus.entries()].filter(([, l]) => l.length > 1);
  ok(doublesT.length === 0,
     doublesT.length ? `titres en double : ${doublesT.map(([t, l]) => `« ${t} » (${l.join(', ')})`).join(' ; ')}`
                     : `${vus.size} titres, tous differents`);
  const doublesD = [...vusD.entries()].filter(([, l]) => l.length > 1);
  ok(doublesD.length === 0,
     doublesD.length ? `resumes en double : ${doublesD.map(([, l]) => l.join(' = ')).join(' ; ')}`
                     : `${vusD.size} resumes, tous differents`);
}

/* ---- et la page de la cle privee est bien hors de portee ---- */
console.log('\n-- la page qui montre une cle privee --');
{
  const s = lis('wallet-export.html');
  ok(/name="robots"[^>]*noindex/.test(s), 'elle porte `noindex`');
  ok(lis('robots.txt').includes('Disallow: /wallet-export.html'),
     'et `robots.txt` interdit meme la visite');
}

console.log(rates ? `\nreferencement.test.js : ${rates} echec(s) sur ${n}\n`
                  : `\nreferencement.test.js : ${n} verifications OK\n`);
process.exit(rates ? 1 : 0);
