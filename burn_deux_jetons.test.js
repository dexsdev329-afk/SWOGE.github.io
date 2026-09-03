'use strict';
/* BRULER DEUX JETONS, ET NE PAS MENTIR SUR CE QUE CA FAIT AU $SWOGE.
 *
 * La demande d'origine : « faut pouvoir choisir burn swoge ou burn swogebet,
 * et sur la barre de progression faut prendre en compte que si on burn du
 * swogebet bah ca burn du swoge aussi ».
 *
 * La premiere moitie est une fonctionnalite. La seconde est une CROYANCE, et
 * elle est fausse : verifie sur la chaine, le transfert de $SWOGEBET appelle
 * `onMove` sur le launchpad, qui ne touche que la comptabilite des
 * recompenses. Aucun $SWOGE n'est detruit. Ecrire l'equivalence dans un total
 * aurait donne un chiffre que la chaine dement — le genre de nombre invente
 * que ce site s'interdit.
 *
 * ---- POURQUOI CET ESSAI A CHANGE DE PAGE ----
 *
 * Il visait `burn.html`, qui n'existe plus : le geste vit desormais dans le
 * portefeuille, avec le compteur de ce qui a deja brule. Supprimer l'essai
 * avec la page aurait jete la seule chose qui tenait cette phrase-la. Un
 * essai suit ce qu'il protege ; il ne meurt pas avec le fichier ou ca vivait.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
const SERVEUR = process.env.SWOGE_SERVEUR || '/home/user/swoge-pusher-server.github.io';
const ETHERS = path.join(SERVEUR, 'node_modules/ethers/dist/ethers.umd.min.js');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}
if (!chromium) { console.log('burn_deux_jetons.test.js : playwright absent — essai saute'); process.exit(0); }
if (!fs.existsSync(ETHERS)) {
  console.log('burn_deux_jetons.test.js : ethers introuvable — essai saute'); process.exit(0);
}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4',
            '.json': 'application/json' };
const MOI = '0x00000000000000000000000000000000000a11ce';
const MORTE = '0x000000000000000000000000000000000000dead';
const enMot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');

process.on('unhandledRejection', (e) => {
  console.log('  RATE essai interrompu : ' + (e && e.message ? e.message : e));
  process.exit(1);
});

(async () => {
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const nav = await chromium.launch();
  const p = await nav.newPage({ viewport: { width: 430, height: 1000 } });
  const boum = [];
  p.on('pageerror', (e) => boum.push(String(e).slice(0, 160)));

  await p.addInitScript((moi) => {
    try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
    window.ethereum = {
      isMetaMask: true,
      request: async (a) => {
        if (a.method === 'eth_accounts' || a.method === 'eth_requestAccounts') return [moi];
        if (a.method === 'eth_chainId') return '0x1237';
        if (a.method === 'net_version') return '4663';
        return null;
      },
      on: () => {}, removeListener: () => {},
    };
  }, MOI);

  /* ---- DEUX OFFRES DIFFERENTES, EXPRES ----
   * C'est tout l'objet de l'essai : si la barre mesurait toujours l'offre du
   * $SWOGE, elle ne bougerait pas d'un jeton a l'autre et personne ne le
   * verrait. Ici 0,5 % contre 4 % — un ecart qu'on ne peut pas confondre. */
  const contrats = {};   // adresse -> { sup, mort }
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    if (r.request().method() !== 'POST') return r.abort();
    let q = {}; try { q = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    const un = (m) => {
      if (m.method === 'eth_chainId') return '0x1237';
      if (m.method === 'net_version') return '4663';
      if (m.method === 'eth_blockNumber') return '0x2f7ce78';
      if (m.method === 'eth_getLogs') return [];
      if (m.method === 'eth_gasPrice') return enMot(134102000n);
      if (m.method === 'eth_getBalance') return enMot(5000000000000000n);
      if (m.method === 'eth_call') {
        const o = (m.params && m.params[0]) || {};
        const d = String(o.data || '');
        const a = String(o.to || '').toLowerCase();
        const c = contrats[a] || (contrats[a] = { vu: 0 });
        c.vu++;
        /* Le premier contrat interroge sera le $SWOGE, le second le
           $SWOGEBET : on les distingue par l'adresse, pas par l'ordre. */
        const bet = Object.keys(contrats).length > 1 && a !== Object.keys(contrats)[0];
        if (d.startsWith('0x18160ddd')) return enMot(1000000000000000000000000000n);  // 1 Md
        if (d.startsWith('0x70a08231')) {
          const qui = ('0x' + d.slice(-40)).toLowerCase();
          if (qui === MORTE) return enMot(bet ? 40000000000000000000000000n     // 4 %
                                              : 5000000000000000000000000n);   // 0,5 %
          return enMot(1234000000000000000000n);
        }
        if (d.startsWith('0x313ce567')) return enMot(18n);
        return enMot(0n);
      }
      return null;
    };
    const f = (m) => ({ jsonrpc: '2.0', id: m.id, result: un(m) });
    return r.fulfill({ contentType: 'application/json',
                       body: JSON.stringify(Array.isArray(q) ? q.map(f) : f(q)) });
  });
  await p.route('**/ethers*.umd.min.js', (r) => r.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(ETHERS, 'utf8') }));

  /* ---- ET ON Y ARRIVE PAR L'ADRESSE ----
   * `#ecBruler` est ce que les anciens liens de `burn.html` pointent
   * desormais. L'essai emprunte donc le meme chemin qu'eux : si le fragment
   * cessait d'ouvrir cet ecran, ces liens mentiraient en silence. */
  await p.goto('http://127.0.0.1:' + port + '/swoge_wallet.html#ecBruler',
               { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);

  console.log('\n-- on arrive sur Burn par l adresse --');
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('ecBruler')).display) !== 'none',
     '`#ecBruler` ouvre bien l ecran de brulage — c est ce que les anciens liens de burn.html visent');

  const lire = () => p.evaluate(() => ({
    jeton: document.getElementById('brJeton').value,
    choix: [...document.getElementById('brJeton').options].map((o) => o.value),
    tot: document.getElementById('brTotal').textContent.trim(),
    pct: document.getElementById('brPct').textContent.trim(),
    barre: document.getElementById('brBarre').style.width,
    autreCache: document.getElementById('brAutre').hidden,
    autre: document.getElementById('brAutre').textContent.replace(/\s+/g, ' ').trim(),
  }));

  console.log('\n-- le $SWOGE --');
  const a = await lire();
  console.log('   ' + JSON.stringify(a));
  ok(a.choix.length === 2 && a.choix.indexOf('swoge') >= 0 && a.choix.indexOf('swogebet') >= 0,
     'deux jetons sont proposes, et ce sont les deux que ce projet brule (' + a.choix.join(', ') + ')');
  ok(a.jeton === 'swoge', 'le $SWOGE est choisi au depart');
  ok(/SWOGE/.test(a.tot) && !/SWOGEBET/.test(a.tot), 'le total est en SWOGE : ' + a.tot);
  ok(/of the SWOGE supply/.test(a.pct), 'le pourcentage porte le nom du jeton : ' + a.pct);
  ok(a.barre === '0.5%', 'la barre vaut 5 M sur 1 Md = 0,5 % (' + a.barre + ')');
  ok(a.autreCache === true,
     'aucune phrase sur le lien avec le $SWOGE : la question ne se pose pas quand c est lui qu on brule');

  console.log('\n-- le $SWOGEBET, et ce qu il ne fait PAS --');
  await p.evaluate(() => {
    const s = document.getElementById('brJeton');
    s.value = 'swogebet'; s.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(2000);
  const b = await lire();
  console.log('   ' + JSON.stringify(b));
  ok(/SWOGEBET/.test(b.tot), 'le total passe au SWOGEBET : ' + b.tot);
  ok(/of the SWOGEBET supply/.test(b.pct), 'et le pourcentage se mesure sur SON offre : ' + b.pct);
  ok(b.barre !== a.barre && b.barre === '4%',
     'la barre a bouge — elle ne montre plus celle du SWOGE (' + a.barre + ' → ' + b.barre + ')');
  ok(b.autreCache === false, 'la ligne sur le lien avec le $SWOGE apparait');
  ok(/does not destroy any \$SWOGE/i.test(b.autre),
     'et elle dit que bruler du $SWOGEBET ne detruit AUCUN $SWOGE');
  ok(/supply does not move/i.test(b.autre),
     'et que l offre de $SWOGE ne bouge pas — c est la croyance que cet essai existe pour tenir');
  ok(!/of the SWOGE supply/.test(b.pct),
     'la barre ne pretend rien sur l offre du $SWOGE pendant qu on brule l autre');

  console.log('\n-- et une lecture ratee ne devient pas un zero --');
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    if (r.request().method() !== 'POST') return r.abort();
    return r.fulfill({ status: 500, contentType: 'application/json',
                       body: '{"error":{"code":-32000,"message":"hors ligne"}}' });
  });
  await p.evaluate(() => {
    const s = document.getElementById('brJeton');
    s.value = 'swoge'; s.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(2500);
  const c = await lire();
  console.log('   ' + JSON.stringify({ tot: c.tot, pct: c.pct }));
  ok(/unknown/i.test(c.tot),
     'un total qu on n a pas pu lire s ecrit « inconnu », jamais « 0 » (' + c.tot + ')');
  ok(/unknown, not zero/i.test(c.pct),
     'et la page le DIT : un zero sur un compteur de destruction se lirait comme une verite');

  ok(boum.length === 0, 'aucune exception' + (boum.length ? ' : ' + boum[0] : ''));
  await nav.close();
  srv.close();
  console.log('\nburn_deux_jetons.test.js — ' + n + ' verifications, ' + rates + ' echec(s)');
  process.exit(rates ? 1 : 0);
})();
