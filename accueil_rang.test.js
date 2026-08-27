'use strict';
/*
 * LE CLASSEMENT DE LA PAGE D'ACCUEIL — IL EST VRAI, OU IL N'EST PAS.
 *
 * ---- CE QUI ETAIT ECRIT ----
 *
 * « SWOGE WORLD LEADERBOARD / 01 SwogeKing LEGEND 984,200 XP / 02 DogeLord
 *   ALPHA 821,300 XP / 03 FlonDoge GAMMA 774,250 XP »
 *
 * Trois joueurs qui n'existent pas. Une XP que personne n'a gagnee. Et des
 * rangs — LEGEND, ALPHA, GAMMA — qui n'existent nulle part dans le jeu : la
 * Fame y est un NOMBRE, pas un titre. C'est exactement la faute deja reparee
 * trente lignes plus haut sur la meme page, avec les « 128K+ joueurs » de la
 * maquette, et elle se repare de la meme facon : on lit le serveur, ou l'on
 * ne montre rien.
 *
 * ---- CE QUE CET ESSAI VERROUILLE ----
 *
 * 1. LES LIGNES VIENNENT DU SERVEUR. Les noms de l'essai ne figurent nulle
 *    part dans la page : s'ils s'affichent, ils ont ete lus.
 * 2. LES NOMS DE LA MAQUETTE NE REVIENNENT JAMAIS, ni en dur ni en repli.
 * 3. SANS REPONSE, LA CARTE DISPARAIT. Une carte vide se remarque et ne
 *    trompe personne ; trois inconnus valent mieux que trois inventions.
 * 4. UN NOM EST DU TEXTE. Il est ecrit par un joueur : il se pose en
 *    `textContent`, jamais en balises.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('accueil_rang.test.js : playwright absent — essai saute'); process.exit(0); }

const SITE = __dirname;
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${JSON.stringify(a)} vs ${JSON.stringify(b)}]`);

const TYPES = { '.html': 'text/html', '.js': 'application/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.css': 'text/css', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };

/* Le site, et la route publique de la vitrine servie a cote — c'est le meme
   hote pour la page que pour les chiffres, comme en production. */
function servir(vitrine) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      if (u === '/vitrine.json') {
        const v = vitrine();
        if (v === null) { r.writeHead(503); return r.end(); }
        r.writeHead(200, { 'content-type': 'application/json',
                           'access-control-allow-origin': '*' });
        return r.end(JSON.stringify(v));
      }
      const f = path.join(SITE, u === '/' ? 'index.html' : u);
      if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        r.writeHead(404); return r.end();
      }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => res({ port: s.address().port, stop: () => s.close() }));
  });
}

const CHIFFRES = { joueurs: 12, volume: 3400, manches: 88, rendus: 2100 };

(async () => {
  let quoi = null;
  const site = await servir(() => quoi);
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* Trois noms qu'on ne trouve NULLE PART dans le depot : s'ils s'affichent,
     c'est qu'ils ont ete lus sur la route, et pas ecrits dans la page. */
  const TROIS = [
    { nom: 'Kalimero', xp: 40312, niveau: 17, fame: 44 },
    { nom: 'Vercingetorix', xp: 9004, niveau: 9, fame: 10 },
    { nom: '0x73737373', xp: 2001, niveau: 5, fame: 2 },
  ];

  async function ouvre() {
    const p = await nav.newPage({ viewport: { width: 1400, height: 950 } });
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${site.port}/index.html?server=`
                 + encodeURIComponent(`http://127.0.0.1:${site.port}`),
                 { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    return p;
  }
  const lis = (p) => p.evaluate(() => {
    const c = document.getElementById('gxRangCarte');
    const rangs = [...document.querySelectorAll('#gxRangs .rang')].map((r) => ({
      no: (r.querySelector('.no') || {}).textContent,
      nom: (r.querySelector('.qui b') || {}).textContent,
      note: (r.querySelector('.qui small') || {}).textContent,
      xp: (r.querySelector('.xp') || {}).textContent,
      balises: (r.querySelector('.qui b') || {}).children.length,
    }));
    /* `innerText` et non `textContent` : le second rapporte AUSSI le code des
       balises `<script>`, et cette page explique la panne dans un commentaire
       de script — l'essai accusait donc sa propre explication. On lit ce que
       le visiteur lit. */
    return { vue: !!c && !c.hidden, rangs, brut: document.body.innerText };
  });

  // ---------------- 1. TROIS VRAIES LIGNES
  console.log('\n-- le classement arrive du serveur --');
  quoi = Object.assign({}, CHIFFRES, { classement: TROIS });
  {
    const p = await ouvre();
    const v = await lis(p);
    ok(v.vue, 'la carte s affiche une fois le classement recu');
    eq(v.rangs.length, 3, 'trois lignes');
    eq(v.rangs[0].nom, 'Kalimero', 'le premier porte le nom du serveur');
    eq(v.rangs[0].no, '01', 'et son rang');
    eq(v.rangs[0].xp, '40,312 XP', 'son XP est celle du serveur, mise en forme');
    eq(v.rangs[0].note, 'LEVEL 17 · 44 FAME',
       'et sa ligne dit le NIVEAU et la FAME — deux choses qui existent');
    eq(v.rangs[2].nom, '0x73737373',
       'sans nom, le debut de l adresse, comme dans le jeu');
    ok(!/SwogeKing|DogeLord|FlonDoge/.test(v.brut),
       'aucun nom de la maquette ne subsiste');
    ok(!/\bLEGEND\b|\bALPHA\b|\bGAMMA\b/.test(v.brut),
       'et aucun rang invente : la Fame est un nombre, pas un titre');
    ok(!/984,200|821,300|774,250/.test(v.brut), 'ni aucune de leurs XP');
    await p.close();
  }

  // ---------------- 2. PERSONNE ENCORE : PAS DE CARTE
  console.log('\n-- personne n a encore joue --');
  quoi = Object.assign({}, CHIFFRES, { classement: [] });
  {
    const p = await ouvre();
    const v = await lis(p);
    ok(!v.vue, 'la carte disparait plutot que de montrer des lignes vides');
    ok(!/SwogeKing|DogeLord|FlonDoge/.test(v.brut),
       'et la maquette ne revient pas la remplir');
    await p.close();
  }

  // ---------------- 3. SERVEUR MUET : PAS DE CARTE NON PLUS
  console.log('\n-- le serveur ne repond pas --');
  quoi = null;
  {
    const p = await ouvre();
    const v = await lis(p);
    ok(!v.vue, 'sans reponse, la carte disparait');
    ok(!/SwogeKing|DogeLord|FlonDoge/.test(v.brut), 'et rien ne prend sa place');
    await p.close();
  }

  // ---------------- 4. UN NOM EST DU TEXTE, PAS DES BALISES
  console.log('\n-- un nom de joueur reste du texte --');
  quoi = Object.assign({}, CHIFFRES, { classement: [
    { nom: '<img src=x onerror="window.__cassé=1">', xp: 10, niveau: 1, fame: 0 },
  ] });
  {
    const p = await ouvre();
    const v = await lis(p);
    eq(v.rangs.length, 1, 'la ligne est posee');
    eq(v.rangs[0].balises, 0, 'et le nom n a fabrique aucune balise');
    ok(await p.evaluate(() => !window.__cassé), 'rien ne s est execute');
    await p.close();
  }

  await nav.close(); site.stop();
  console.log(rates ? `\naccueil_rang.test.js : ${rates} echec(s) sur ${n}\n`
                    : `\naccueil_rang.test.js : ${n} verifications OK\n`);
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
