'use strict';
/*
 * LE JETON DE SESSION NE PART QUE VERS LE SERVEUR.
 *
 * ---- LE DEFAUT (revue du 13/10) ----
 *
 * Presque chaque page lit `?server=` pour que les essais la branchent sur un
 * serveur local. Sans borne, un lien piege sur le VRAI domaine
 * (…/studio.html?server=https://ailleurs) faisait partir le jeton de session
 * (valable 30 jours) vers l hote de son choix : en `Authorization: Bearer`
 * (studio.html : GET /studio/chat/solde, GET /credit, POST /credit/topup) ou
 * dans le `resume` de la socket (stakebubble.js et les vingt pages de jeu).
 * Sur studio.html, « Sign a $5 top-up » faisait meme signer 5 000 USDC vers
 * l adresse de cet hote.
 *
 * ---- CE QUE L ESSAI TIENT ----
 *
 * TOUTES les pages qui lisent `?server=`, pas une liste choisie : la lecture
 * est recopiee de page en page, la prochaine copie sera vue. Chaque page est
 * ouverte avec une session et `?server=` vers un autre hote, en https puis en
 * wss : aucune socket ne s ouvre vers cet hote, et aucune requete n y porte
 * d en-tete Authorization. Une lecture publique (les chiffres de la barre,
 * sans jeton) peut encore y aller : elle ne livre rien.
 *
 * Revue du 14/10 : avec le seul hote `autre-hote.example` (ni « localhost » ni
 * « 127.0.0.1 » dedans), une borne affaiblie passait verte — une regex sans
 * ^…$, ou un test sur le parametre brut au lieu du hostname (mutant sur
 * swolemind.html : 3 requetes avec le jeton, essai vert). L hote piege prend
 * donc aussi les formes qui CONTIENNENT les mots de la borne, et tout hote qui
 * finit par `autre-hote.example` compte.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('server_borne.test.js : playwright absent — essai saute'); process.exit(0); }

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.json':'application/json',
            '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const PIEGE = 'autre-hote.example';
const ADDR = '0x' + '7a'.repeat(20);
const SESSION = 'v1.' + ADDR + '.' + (Math.floor(Date.now() / 1000) + 86400 * 20) + '.sig-test';

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const nav = await chromium.launch();

  /* Les pages qui lisent `?server=` (elles-memes ou par stakebubble.js, qui la lit pour sa socket). */
  const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).filter((f) => {
    const h = fs.readFileSync(path.join(SITE, f), 'utf8');
    return /\.get\(\s*["']server["']\s*\)/.test(h) || /stakebubble(\.min)?\.js/.test(h);
  });
  ok(pages.length > 40, pages.length + ' pages lisent ?server= (elles-memes ou par stakebubble.js)');

  const fautives = [];
  const FORMES = ['https://' + PIEGE, 'wss://' + PIEGE, 'https://localhost.' + PIEGE, 'https://127.0.0.1.' + PIEGE, 'https://' + PIEGE + '/?localhost', 'https://' + PIEGE + '#127.0.0.1'];
  /* Six pages a la fois : six formes sur ~45 pages, sans sextupler la duree. */
  const travaux = [];
  for (const forme of FORMES) for (const f of pages) travaux.push([forme, f]);
  const unePage = async ([forme, f]) => {
    {
      const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addInitScript((j) => { try { localStorage.setItem('swogeSession', j); } catch (e) {} }, SESSION);
      const vers = [];
      /* Rien ne sort de la machine : on note, puis on coupe. */
      await ctx.routeWebSocket(/.*/, (ws) => { vers.push({ ws: true, url: ws.url(), auth: null }); });
      await ctx.route((u) => !u.href.startsWith(base), (r) => { vers.push({ ws: false, url: r.request().url(), auth: r.request().headers().authorization || null }); return r.abort(); });
      const p = await ctx.newPage();
      try {
        await p.goto(base + f + '?server=' + encodeURIComponent(forme), { waitUntil: 'domcontentloaded', timeout: 20000 });
        await p.waitForTimeout(1200);
      } catch (e) { /* une page lente ne dit rien de la borne : on juge ce qui est deja parti */ }
      const hote = (u) => { try { return new URL(u).hostname; } catch (e) { return ''; } };
      const mal = vers.filter((v) => (hote(v.url) === PIEGE || hote(v.url).endsWith('.' + PIEGE)) && (v.ws || v.auth));
      if (mal.length) fautives.push(f + ' (' + forme + ' : ' + [...new Set(mal.map((v) => (v.ws ? 'socket ' : 'Authorization ') + new URL(v.url).pathname))].slice(0, 3).join(', ') + ')');
      await ctx.close();
    }
  };
  await Promise.all(Array.from({ length: 6 }, async () => { while (travaux.length) await unePage(travaux.shift()); }));
  ok(fautives.length === 0, 'aucune page n ouvre de socket vers ' + PIEGE + ' (ni ses ' + (FORMES.length - 2) + ' formes qui contiennent localhost ou 127.0.0.1), ni ne lui envoie le jeton' + (fautives.length ? ' — fautives : ' + fautives.join(' ; ') : ''));

  await nav.close();
  srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'tout passe : ' + n + ' verifications'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
