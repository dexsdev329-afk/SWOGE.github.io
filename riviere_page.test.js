'use strict';
/*
 * L'EAU ARRETE-T-ELLE, ET LE PONT LAISSE-T-IL PASSER ?
 *
 * ---- POURQUOI CET ESSAI EXISTE ----
 *
 * Une riviere est trois choses qui doivent s'accorder : un sol qu'on peint,
 * une collision qui repousse, et des ponts qui annulent cette collision. Un
 * desaccord entre les trois est MUET. On ne voit pas qu'on traverse l'eau, on
 * voit un personnage qui marche ; et un pont qui bloque ressemble a une
 * riviere ordinaire. Rien ne leve d'erreur dans un cas comme dans l'autre.
 *
 * ---- COMMENT ON MESURE UNE POSITION QUE PERSONNE N'ANNONCE ----
 *
 * Le hall n'envoie pas la position du joueur au serveur : il n'y a donc aucun
 * flux a relire, contrairement au monde de combat. Et l'espion de dessin ne
 * donne que des coordonnees d'ECRAN, que la camera deplace a chaque pas.
 * Le pont sert de REPERE. Sa place dans le monde se calcule depuis la source —
 * les memes constantes que la page utilise — et il est dessine dans la meme
 * image que le joueur. La position du joueur dans le monde vaut donc celle du
 * pont plus l'ecart des deux a l'ecran. Aucune connaissance de la camera n'est
 * necessaire, et rien n'est recopie.
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

/* La geometrie vient de la SOURCE, jamais recopiee : le jour ou la riviere
   change de largeur ou la carte de taille, cet essai suit sans qu'on y pense.
   C'est la lecon que ce projet a payee cinq fois. */
function geometrie() {
  const src = fs.readFileSync(path.join(SITE, 'nexus.js'), 'utf8');
  const T = Number(/var TUILE = (\d+)/.exec(src)[1]);
  const c = /var CARTE = \{ cols: (\d+), rows: (\d+) \}/.exec(src);
  const d = /y: MONDE\.h \/ 2 - (\d+)/.exec(src);
  const r = /var RIVIERE = \{ bord: (\d+), large: (\d+), basfond: (\d+) \}/.exec(src);
  const pt = /var PONT_TRAVERS = (\d+), PONT_LARGE = (\d+)/.exec(src);
  const W = Number(c[1]) * T, H = Number(c[2]) * T;
  return { T, W, H, cx: W / 2, cy: H / 2 - Number(d[1]),
           bord: Number(r[1]), large: Number(r[2]),
           travers: Number(pt[1]), largePont: Number(pt[2]) };
}

const espion = `(() => {
  const C = CanvasRenderingContext2D.prototype;
  if (C.__espionRiv) return; C.__espionRiv = true;
  window.__vu = { moi: null, ponts: [] };
  const di = C.drawImage;
  C.drawImage = function (im) {
    const u = (im && (im.currentSrc || im.src)) || '';
    const a = arguments;
    if (a.length >= 9 && a[3] === 256 && a[4] === 256 && a[7] === 150 && a[8] === 150) {
      window.__vu.moi = { x: a[5] + 75, y: a[6] + 130 };
    }
    if (/obj_pont\\.webp/.test(u)) {
      const d = a.length >= 9 ? 5 : 1;
      window.__vu.ponts.push({ x: a[d] + a[d + 2] / 2, y: a[d + 1] + a[d + 3] / 2 });
    }
    return di.apply(this, arguments);
  };
})()`;

(async () => {
  const G = geometrie();
  console.log('-- la geometrie, lue dans la source --');
  console.log(`   carte ${G.W}x${G.H}, centre ${G.cx},${G.cy}, eau a ${G.bord} du bord sur ${G.large}`);
  ok(G.large > 60 && G.bord > 100, `une riviere de ${G.large} unites, a ${G.bord} du bord`);

  /* Le pont du BAS, sur l'axe central : celui qu'on va traverser. */
  const pontBas = { x: G.cx, y: G.H - G.bord - G.large / 2 };
  const eauHaut = G.H - G.bord - G.large, eauBas = G.H - G.bord;

  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/nexus.html`;
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* Une descente : on tient une touche, puis on lit la position du joueur DANS
     LE MONDE en la rapportant au pont le plus proche a l'ecran. */
  const descente = async (versLOuest) => {
    const ctx = await nav.newContext({ viewport: { width: 1500, height: 1200 } });
    const p = await ctx.newPage();
    await p.goto(base, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3500);
    await p.evaluate(() => { const e = document.getElementById('nxVuePct');
      if (e) { e.value = 3000; e.dispatchEvent(new Event('input', { bubbles: true })); } });
    await p.waitForTimeout(1200);
    await p.evaluate(espion);
    if (versLOuest) {
      await p.keyboard.down('ArrowLeft');
      await p.waitForTimeout(1700);
      await p.keyboard.up('ArrowLeft');
    }
    await p.keyboard.down('ArrowDown');
    await p.waitForTimeout(7000);
    await p.keyboard.up('ArrowDown');
    await p.waitForTimeout(500);
    await p.evaluate(() => { window.__vu.ponts.length = 0; });
    await p.waitForTimeout(300);
    const vu = await p.evaluate(() => window.__vu);
    await ctx.close();
    if (!vu.moi || !vu.ponts.length) return null;
    /* Le pont le plus proche du joueur A L'ECRAN est celui du bas : c'est vers
       lui qu'on a marche. On prend le plus proche plutot que le premier, pour
       ne pas dependre de l'ordre de dessin. */
    let meilleur = vu.ponts[0], dmin = Infinity;
    for (const q of vu.ponts) {
      const dd = (q.x - vu.moi.x) ** 2 + (q.y - vu.moi.y) ** 2;
      if (dd < dmin) { dmin = dd; meilleur = q; }
    }
    return { x: pontBas.x + (vu.moi.x - meilleur.x), y: pontBas.y + (vu.moi.y - meilleur.y),
             ponts: vu.ponts.length };
  };

  console.log('\n-- on descend SUR le pont --');
  const surLePont = await descente(false);
  ok(!!surLePont, 'la position du joueur se mesure' + (surLePont ? ` (${surLePont.ponts} ponts a l'ecran)` : ''));
  if (surLePont) {
    console.log(`   joueur en (${Math.round(surLePont.x)}, ${Math.round(surLePont.y)}), eau de ${eauHaut} a ${eauBas}`);
    ok(surLePont.y > eauBas - 20,
       `le pont laisse passer : le joueur est a ${Math.round(surLePont.y)}, l'eau finit a ${eauBas}`);
  }

  console.log('\n-- on descend A COTE du pont --');
  const aCote = await descente(true);
  ok(!!aCote, 'la position du joueur se mesure aussi la');
  if (aCote) {
    console.log(`   joueur en (${Math.round(aCote.x)}, ${Math.round(aCote.y)})`);
    ok(Math.abs(aCote.x - pontBas.x) > G.travers / 2,
       `on est bien HORS du pont (${Math.round(Math.abs(aCote.x - pontBas.x))} unites de son axe, ` +
       `pour un pont large de ${G.travers})`);
    /* La question : l'eau arrete-t-elle ? Le joueur doit s'etre arrete AVANT
       elle, pas au milieu et pas de l'autre cote. */
    ok(aCote.y < eauHaut + 30,
       `l'eau arrete : le joueur bute a ${Math.round(aCote.y)}, l'eau commence a ${eauHaut}`);
  }

  await nav.close(); srv.close();
  console.log(`\nriviere_page.test.js : ${n} verifications, ${echecs} echec(s)`);
  if (echecs) process.exit(1);
})().catch((e) => { console.log('  RATE essai interrompu : ' + (e && e.message)); process.exit(1); });
