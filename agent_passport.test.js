'use strict';
/* ============================================================================
 * L'AGENT PASSPORT — la page montre et VERIFIE ; le serveur decide
 *   1. un passeport public : ses champs en texte, la signature verifiee (dans le
 *      navigateur si WebCrypto sait l'Ed25519, sinon par le serveur, et c'est dit) ;
 *   2. un passeport modifie apres signature : « Not valid » ;
 *   3. le proprietaire : publier par SA session, avec l'avertissement du portefeuille ;
 *   4. un identifiant inconnu ou mal forme ; rien ne deborde a 360 px.
 * Signe par le VRAI passeport.js du serveur : la page et le serveur doivent
 * calculer le meme JSON canonique.
 * ==========================================================================*/
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SITE = __dirname;
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) {}
const SRV = path.join(SITE, '..', 'swoge-pusher-server.github.io', 'passeport.js');
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };

(async () => {
  if (!chromium || !fs.existsSync(SRV)) { console.log('playwright ou passeport.js absent : essai ignore'); return; }
  const P = require(SRV);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'passeport-page-'));
  const ID = '3f9a0c1b2d4e', OWNER = '0xab00000000000000000000000000000000000001';
  const cle = { addr: OWNER, nom: 'research <img src=x onerror=window.pirate=1> bot', debut: 'swg_AbCd', cree: Date.UTC(2026, 8, 29, 9), payeur: 'credit', plafondUsd: 2, depenseUsd: 0.03,
    jour: new Date().toISOString().slice(0, 10), appels: 2, usdTotal: 0.03, comptesDepuis: Date.UTC(2026, 8, 29, 10), derniere: Date.now(), paie: { actif: true, maxAppelUsd: 0.05, hotes: ['api.example.com'] }, passeportPublic: true };
  const cles = { parId: (id) => (id === ID ? { h: 'x', id, c: Object.assign({}, cle) } : null) };
  const S = P.cree({ dossier: dir, cles, audit: () => ({ lignes: [{ seq: 7, h: 'ab'.repeat(32), statut: 'paye' }], chaine: { ok: true } }), api: 'https://api', site: 'https://site' });
  const vu = { verif: 0, publie: [] };
  let mode = 'public';

  const srv = http.createServer((q, r) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': 'text/html' }); r.end(d); }); });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port, nav = await chromium.launch();
  const ouvre = async ({ session, largeur, id } = {}) => {
    const ctx = await nav.newContext({ viewport: { width: largeur || 1000, height: 1000 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + port });
    if (session) await ctx.addInitScript((j) => localStorage.setItem('swogeSession', j), session);
    const page = await ctx.newPage();
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port), async (r) => {
      const u = r.request().url(), H = { 'access-control-allow-origin': '*' };
      if (/\/\.well-known\/swoge-passport\.json$/.test(u)) return r.fulfill({ status: 200, headers: H, contentType: 'application/json', body: JSON.stringify(S.clePublique()) });
      if (/\/agentic\/passport\/verify$/.test(u)) { vu.verif++; return r.fulfill({ status: 200, headers: H, contentType: 'application/json', body: JSON.stringify(S.verifie(JSON.parse(r.request().postData()))) }); }
      if (/\/agentic\/passport\/[0-9a-f]{12}$/.test(u)) {
        const id = u.split('/').pop(), auth = r.request().headers().authorization || null;
        if (id !== ID) return r.fulfill({ status: 404, headers: H, contentType: 'application/json', body: JSON.stringify({ ok: false, raison: 'no public passport with this id' }) });
        const env = S.signe(S.passeport(ID));
        if (mode === 'triche') env.passport.wallet.dailyCap.usd = 1000;
        return r.fulfill({ status: 200, headers: H, contentType: 'application/json', body: JSON.stringify(Object.assign({ ok: true, owned: auth === 'Bearer j.owner' }, env)) });
      }
      if (/\/agentic\/cles\/[0-9a-f]{12}\/passeport$/.test(u)) { const b = JSON.parse(r.request().postData()); vu.publie.push({ auth: r.request().headers().authorization, b, u });
        cle.passeportPublic = b.public; return r.fulfill({ status: 200, headers: H, contentType: 'application/json', body: '{"ok":true}' }); }
      return r.abort();
    });
    await page.goto('http://127.0.0.1:' + port + '/agent_passport.html' + (id ? '?id=' + id : ''), { waitUntil: 'domcontentloaded' });
    return { page, ctx };
  };

  console.log('-- 1. un passeport public --');
  {
    const { page, ctx } = await ouvre({ id: ID });
    await page.waitForSelector('#cartePasseport:not([hidden])');
    const t = await page.textContent('#cartePasseport');
    ok(/research <img src=x onerror=window\.pirate=1> bot/.test(t) && (await page.$('#cartePasseport img')) === null && !(await page.evaluate(() => window.pirate)), 'le nom de l agent est du texte, jamais du HTML');
    ok(t.includes(OWNER) && /dollar credit/.test(t) && /\$2\.00/.test(t) && /\$0\.03/.test(t) && /public/.test(await page.textContent('#pVisibilite')) && /active/.test(await page.textContent('#pEtat')),
       'le proprietaire, le payeur, le plafond et la depense du jour, public et actif');
    ok(/Buy, sell or signnever/.test(t) && /Manage keysnever/.test(t) && /up to \$0\.05 a call, only api\.example\.com/.test(t), 'les permissions : jamais d achat ni de gestion des cles, le plafond par appel et les sites');
    ok(/2 \(\$0\.03 billed\)/.test(t) && /1 paid, 0 free, 0 refused, 0 lost/.test(t) && /line 7, abababababababab… · intact/.test(t), 'l historique mesure et la tete de la chaine d audit');
    await page.click('#verifier');
    await page.waitForFunction(() => /Valid|Not valid|Could not/.test(document.getElementById('statutVerif').textContent));
    const v = await page.textContent('#statutVerif');
    ok(/^✓ Valid — checked (in your browser with SWOGE’s public Ed25519 key|by the SWOGE server \(your browser cannot check Ed25519 itself\))\.$/.test(v),
       'la signature est valide, et la page dit OU elle a ete verifiee [' + (vu.verif ? 'serveur' : 'navigateur') + ']');
    ok(await page.isHidden('#blocProprio'), 'un visiteur ne voit pas les reglages du proprietaire');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'rien ne deborde [' + larg + ']');
    await ctx.close();
  }

  console.log('\n-- 2. un passeport modifie apres signature --');
  {
    mode = 'triche';
    const { page, ctx } = await ouvre({ id: ID });
    await page.waitForSelector('#cartePasseport:not([hidden])');
    await page.click('#verifier');
    await page.waitForFunction(() => /Valid|Not valid|Could not/.test(document.getElementById('statutVerif').textContent));
    ok(/^Not valid: .*changed after SWOGE signed it/.test(await page.textContent('#statutVerif')), 'un plafond gonfle apres signature : « Not valid »');
    mode = 'public';
    await ctx.close();
  }

  console.log('\n-- 3. le proprietaire --');
  {
    cle.passeportPublic = false;
    const { page, ctx } = await ouvre({ id: ID, session: 'j.owner', largeur: 360 });
    await page.waitForSelector('#blocProprio:not([hidden])');
    ok(/private/.test(await page.textContent('#pVisibilite')) && /your wallet address becomes visible to anyone with the link/.test(await page.textContent('#proprioTexte'))
       && (await page.textContent('#basculer')) === 'Make it public', 'prive ; publier dit d abord que le portefeuille deviendra visible');
    await page.click('#basculer');
    await page.waitForFunction(() => /public/.test(document.getElementById('pVisibilite').textContent) && document.getElementById('basculer').textContent === 'Make it private');
    ok(vu.publie.length === 1 && vu.publie[0].auth === 'Bearer j.owner' && vu.publie[0].b.public === true && /\/agentic\/cles\/3f9a0c1b2d4e\/passeport$/.test(vu.publie[0].u),
       'publier passe par la SESSION du proprietaire, et le passeport relu est public');
    const larg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(larg <= 1, 'a 360 px, rien ne deborde [' + larg + ']');
    await ctx.close();
  }

  console.log('\n-- 4. un identifiant inconnu ou mal forme --');
  {
    const { page, ctx } = await ouvre();
    await page.fill('#idPasseport', 'xyz'); await page.click('#voir');
    ok(/12 characters/.test(await page.textContent('#statutCherche')) && await page.isHidden('#cartePasseport'), 'mal forme : rien ne part');
    await page.fill('#idPasseport', '000000000000'); await page.click('#voir');
    await page.waitForFunction(() => /no public passport/.test(document.getElementById('statutCherche').textContent));
    ok(await page.isHidden('#cartePasseport'), 'inconnu ou prive : la meme reponse, rien d affiche');
    await ctx.close();
  }

  fs.rmSync(dir, { recursive: true, force: true });
  await nav.close(); srv.close();
  console.log('\n' + (rates ? 'RATES : ' + rates + '/' + n : 'VERIFICATIONS : ' + n + ' — tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
