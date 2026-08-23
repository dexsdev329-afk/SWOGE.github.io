'use strict';
/*
 * UNE PAGE PERIMEE SE REMPLACE-T-ELLE VRAIMENT TOUTE SEULE ?
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * `cache_marqueur.test.js` garantit que les marqueurs sont les empreintes des
 * fichiers, et que `version.json` est a jour. Il lit des fichiers ; il ne peut
 * pas dire si le NAVIGATEUR fait quelque chose de tout ca.
 * Or le mecanisme ajoute est precisement du genre qui peut ne rien faire sans
 * que personne ne s'en apercoive : la page perimee se rechargerait... jamais,
 * et tout aurait l'air normal. C'est le defaut qui a deja coute le plus cher
 * ici — du travail fait, pousse, correct, et invisible.
 *
 * ---- CE QU'ON MESURE ----
 *
 * Le NOMBRE de chargements de la page, pas un drapeau interne : c'est ce qui
 * arrive au joueur. Trois situations, et la troisieme compte autant que les
 * deux autres — une page qui se rechargerait en boucle serait un jeu
 * injouable, donc pire que le defaut d'origine.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { echecs++; console.log('  RATE ' + m); } };

const SITE = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.css': 'text/css', '.mp3': 'audio/mpeg' };

(async () => {
  /* Le manifeste servi est pilote depuis ici : on ne touche pas au fichier du
     depot pour fabriquer une page perimee. Un essai qui modifierait les
     sources qu'il verifie finirait par en laisser une abimee. */
  let manifesteServi = null;
  /* ---- ON COMPTE LES DEMANDES DE PAGE COTE SERVEUR ----
   * Et non l'evenement `load` du pilote. Premiere mesure faite avec `load` :
   * elle annoncait UN chargement alors que la page avait bel et bien note sa
   * signature avant de se recharger — donc l'instrument comptait mal. Le
   * serveur, lui, ne peut pas se tromper sur le nombre de fois qu'on lui a
   * demande la page, et c'est exactement ce que vit le joueur. */
  let demandes = 0;
  const srv = http.createServer((q, r) => {
    const nom = decodeURIComponent(q.url.split('?')[0]);
    if (nom === '/nexus.html') demandes++;
    if (nom === '/version.json' && manifesteServi) {
      r.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      r.end(manifesteServi);
      return;
    }
    const f = path.join(SITE, nom);
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/nexus.html`;

  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* Le vrai manifeste, relu et non recopie : ecrit en dur ici, il cesserait de
     representer le site des le prochain changement de script. */
  const vrai = JSON.parse(fs.readFileSync(path.join(SITE, 'version.json'), 'utf8'));

  const compteLesChargements = async (manifeste, ms) => {
    manifesteServi = manifeste;
    demandes = 0;
    const ctx = await nav.newContext({ viewport: { width: 390, height: 780 },
                                       hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(base, { waitUntil: 'load' });
    await p.waitForTimeout(ms);
    const memoire = await p.evaluate(() => {
      try { return sessionStorage.getItem('swogeRelanceCache'); } catch (e) { return null; }
    });
    await ctx.close();
    return { charges: demandes, memoire };
  };

  console.log('\n-- le manifeste est a jour : on ne recharge pas --');
  const a = await compteLesChargements(JSON.stringify(vrai), 2500);
  console.log('   ' + JSON.stringify(a));
  ok(a.charges === 1, `la page se charge UNE fois et reste (${a.charges})`);
  ok(!a.memoire, 'et rien n a ete note : il n y avait rien a rattraper');

  console.log('\n-- le manifeste a change : la page se remplace --');
  /* On PERIME la page en annoncant une autre empreinte pour le script qu'elle
     porte. C'est exactement ce que vit un joueur dont le navigateur a garde
     une page d'avant-hier. */
  const perime = Object.assign({}, vrai, { 'nexus.js': '00000000' });
  const b = await compteLesChargements(JSON.stringify(perime), 3500);
  console.log('   ' + JSON.stringify(b));
  ok(b.charges >= 2, `la page perimee se recharge (${b.charges} chargements)`);
  ok(!!b.memoire && /nexus\.js/.test(b.memoire),
     'et elle note d ou elle venait, pour ne pas y revenir');

  console.log('\n-- et elle ne tourne PAS en boucle --');
  /* La situation la plus dangereuse : le manifeste reste different apres le
     rechargement — page toujours servie depuis un cache, deploiement a moitie
     fait. Sans garde-fou, le jeu se rechargerait indefiniment : injouable, et
     bien pire que le defaut d origine. On laisse tourner plus longtemps que la
     mesure d avant, pour qu une boucle ait le temps de se voir. */
  const c = await compteLesChargements(JSON.stringify(perime), 8000);
  console.log('   ' + JSON.stringify(c));
  ok(c.charges === 2,
     `elle s arrete apres UNE relance, meme si rien ne s arrange (${c.charges} chargements)`);

  await nav.close();
  srv.close();
  console.log(`\ncache_page.test.js : ${n} verifications, ${echecs} echec(s)`);
  if (echecs) process.exit(1);
})().catch((e) => { console.error('essai interrompu : ' + (e && e.message)); process.exit(1); });
