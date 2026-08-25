'use strict';
/*
 * « CONNECT WALLET » NE DOIT ETRE ECRIT QU UNE FOIS PAR ECRAN.
 *
 * ---- CE QUI S EST PASSE ----
 *
 * Une capture, prise d un telephone : l accueil ouvrait sur « CONNECT WALLET /
 * SIGN UP — EMAIL » dans la barre du haut puis, trois centimetres plus bas,
 * « CONNECT WALLET / SIGN UP WITH EMAIL » dans la colonne. Les memes mots, les
 * memes gestionnaires, deux fois a l ecran en meme temps.
 *
 * La barre du haut est COLLANTE : ce n etait donc pas un accident de defilement
 * — les deux paires se voyaient ensemble quelle que soit la position dans la
 * page, sur telephone comme sur ecran large.
 *
 * ---- POURQUOI CET ESSAI PLUTOT QU UN COUP D OEIL ----
 *
 * Ces boutons se posent a cinq endroits differents dans les deux pages, et
 * chacun avait une bonne raison le jour ou il a ete ajoute. C est exactement
 * le genre de doublon qui revient : quelqu un ajoutera une carte d appel dans
 * six mois, et personne ne comptera. La page portait deja ce constat pour
 * l ADRESSE une fois connecte ; il valait tout autant pour les BOUTONS avant
 * de l etre, c est-a-dire exactement quand ils comptent.
 *
 * ---- CE QU IL COMPTE, ET CE QU IL NE COMPTE PAS ----
 *
 * Il compte les elements VISIBLES qui portent un LIBELLE de connexion. Une
 * zone cliquable transparente posee sur un bouton PEINT dans une image n en
 * est pas un : elle n ecrit rien, elle rend cliquable ce qui est deja dessine.
 * La retirer laisserait un bouton peint qui ne fait rien — pire qu un doublon.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let n = 0, echecs = 0;
const ok = (c, m) => { if (c) { n++; console.log('  ok   ' + m); }
                       else { echecs++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} [${a} vs ${b}]`);

const SITE = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript',
                '.json': 'application/json', '.webp': 'image/webp',
                '.png': 'image/png', '.css': 'text/css', '.mp4': 'video/mp4' };

(async () => {
  const s = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const nav = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* Les deux tailles qui comptent : le telephone d ou vient la capture, et
     l ecran large ou la colonne se range a gauche au lieu de dessous. Le
     defaut se voyait aux DEUX, mais on ne l avait remarque qu au premier. */
  const ECRANS = [{ nom: 'telephone', w: 390, h: 844 },
                  { nom: 'ecran large', w: 1400, h: 900 }];

  for (const page of ['index.html', 'games.html']) {
    console.log(`\n-- ${page} --`);
    for (const e of ECRANS) {
      const ctx = await nav.newContext({ viewport: { width: e.w, height: e.h } });
      const p = await ctx.newPage();
      await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
      await p.goto(`http://127.0.0.1:${s.address().port}/${page}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      const vus = await p.evaluate(() => {
        const dedans = [...document.querySelectorAll('.cx-wallet, .cx-mail')];
        return dedans.map((b) => {
          const r = b.getBoundingClientRect();
          const st = getComputedStyle(b);
          return {
            mot: (b.textContent || '').trim(),
            /* Visible veut dire : dessine, et d une taille non nulle. Un
               bouton `hidden` ou `display:none` ne trompe personne. */
            vu: st.display !== 'none' && st.visibility !== 'hidden'
                && r.width > 0 && r.height > 0,
          };
        });
      });
      /* ---- ON COMPTE PAR METHODE, PAS PAR BOUTON ----
       * « CONNECT WALLET » et « SIGN UP — EMAIL » cote a cote ne sont PAS un
       * doublon : ce sont les deux facons d entrer, offertes une fois chacune.
       * Le premier jet de cet essai les comptait comme deux appels et
       * declarait la page fautive alors qu elle etait juste — une regle qui
       * se trompe sur le cas normal ne protege de rien, elle se fait
       * desactiver.
       * Ce qui doit etre unique, c est chaque PORTE : une entree par
       * portefeuille, une par courriel. */
      const parlants = vus.filter((x) => x.vu && /connect|sign\s*up|wallet|email/i.test(x.mot));
      const parPorte = {
        portefeuille: parlants.filter((x) => /wallet/i.test(x.mot)),
        courriel: parlants.filter((x) => /email|sign\s*up/i.test(x.mot)),
      };
      for (const porte of Object.keys(parPorte)) {
        const l = parPorte[porte];
        eq(l.length, 1,
           `${e.nom} : l entree par ${porte} est ecrite UNE fois — `
           + (l.length ? l.map((x) => `« ${x.mot} »`).join(' + ') : 'aucune'));
      }
      /* Zero est l autre facon de se tromper : un essai qui n exige qu un
         maximum passerait sur une page sans aucune porte d entree. */
      ok(parlants.length >= 2,
         `${e.nom} : et les deux portes sont la — la page reste ouvrable`);
      const muets = vus.filter((x) => x.vu && !x.mot.trim()).length;
      if (muets) {
        console.log(`   (${muets} zone(s) cliquable(s) sans libelle : des boutons PEINTS`
                    + ' dans une image, rendus cliquables — ils n ecrivent rien)');
      }
      await ctx.close();
    }
  }

  /* ================== LA SESSION PAR PORTEFEUILLE ==================
   *
   * ---- LE DEFAUT, SIGNALE AVEC UNE CAPTURE ----
   * On connecte son portefeuille, on change de page — ou l on recharge — et
   * « CONNECT WALLET » revient, alors que la pastille de solde affiche les
   * jetons juste a cote. Deux mecanismes savaient, chacun la moitie :
   * `swogecx.js` ne restaurait QUE le courriel, et la bulle de solde
   * connaissait le portefeuille sans le dire a personne. `swogeAuth` valait
   * « wallet » depuis le premier jour, et personne ne le relisait.
   */
  console.log('\n-- la session par portefeuille se retrouve toute seule --');
  {
    const ADR = '0x' + 'ab'.repeat(20);
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    /* Un portefeuille d essai, pose AVANT que la page ne s execute. Il repond
       a `eth_accounts` — la question qui ne demande rien — et REFUSE
       `eth_requestAccounts` : si la page ouvrait une demande d autorisation a
       chaque chargement, ce serait une bien pire panne que celle qu on
       repare, et l essai doit le voir. */
    await ctx.addInitScript(() => {
      try { localStorage.setItem('swogeAuth', 'wallet'); } catch (e) {}
      window.__demande = 0;
      window.ethereum = {
        request: (o) => {
          const m = o && o.method;
          if (m === 'eth_requestAccounts') { window.__demande++; return Promise.reject(new Error('jamais')); }
          if (m === 'eth_accounts') return Promise.resolve(['0x' + 'ab'.repeat(20)]);
          if (m === 'eth_chainId') return Promise.resolve('0x1237');
          if (m === 'eth_getBalance') return Promise.resolve('0x6f05b59d3b20000');
          if (m === 'eth_call') return Promise.resolve('0x' + (10n ** 21n).toString(16).padStart(64, '0'));
          return Promise.resolve(null);
        },
        on: () => {},
      };
    });
    const p = await ctx.newPage();
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${s.address().port}/games.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    const etat = await p.evaluate(() => ({
      compte: !document.getElementById('cxCompte').hidden,
      adresse: (document.getElementById('cxAdr') || {}).textContent,
      boutons: [...document.querySelectorAll('.cx-wallet, .cx-mail')]
        .filter((b) => { const r = b.getBoundingClientRect();
                         return getComputedStyle(b).display !== 'none' && r.width > 0; })
        .map((b) => (b.textContent || '').trim()).filter(Boolean),
      demandes: window.__demande,
    }));
    ok(etat.compte, 'la page retrouve le portefeuille sans qu on reclique');
    eq(etat.adresse, '0xabab…abab', 'et elle affiche SON adresse, pas une autre');
    eq(etat.boutons.length, 0,
       `plus aucun appel a se connecter quand on l est deja${etat.boutons.length ? ' — ' + etat.boutons.join(' + ') : ''}`);
    eq(etat.demandes, 0,
       'et AUCUNE fenetre d autorisation n a ete ouverte : `eth_accounts` demande'
       + ' ce qui est deja accorde, `eth_requestAccounts` ouvrirait une fenetre a'
       + ' chaque chargement de page');

    /* ================== ET LES PASTILLES DE LA BARRE ==================
     * Elles viennent de deux scripts partages par dix-sept pages SOMBRES, qui
     * injectent leur propre feuille : solde dore sur brun, bulle vert neon,
     * rond brun cercle d or. Sur une page claire, quatre taches. La page les
     * habille sans toucher au script — c est elle qui est claire, pas le
     * widget qui est faux. */
    const pastilles = await p.evaluate(() => {
      const bar = document.querySelector('.sw-haut') || document.body;
      const fait = (cls, html) => { const e = document.createElement('span');
        e.className = cls; e.innerHTML = html; bar.appendChild(e); return e; };
      const l = {
        swbal: fait('swbal', '<span class="pt"></span>164.9k<em>$SWOGE</em>'),
        swusd: fait('swusd on', '≈ $4.87'),
        swstk: fait('swstk', '<b>4680.91</b>'),
        swppl: fait('swppl', '<span class="swdot"></span><i>2</i>'),
        swpb: fait('swpb', '👤'),
      };
      const clair = (c) => { const v = (c.match(/\d+/g) || []).map(Number);
        return v.length >= 3 ? (v[0] + v[1] + v[2]) / 3 : null; };
      const out = {};
      for (const k of Object.keys(l)) {
        const st = getComputedStyle(l[k]);
        out[k] = { fond: clair(st.backgroundColor), texte: clair(st.color) };
      }
      return out;
    });
    for (const k of ['swbal', 'swusd', 'swppl', 'swpb']) {
      ok(pastilles[k].fond > 200 && pastilles[k].texte < 140,
         `« ${k} » : fond clair et texte sombre (${Math.round(pastilles[k].fond)} sur `
         + `${Math.round(pastilles[k].texte)}) — elle etait doree sur brun`);
    }
    /* ---- LA BULLE DE STAKING PASSE AU BLANC ELLE AUSSI ----
     * Elle etait restee verte, au motif qu'elle est la seule qui se CLIQUE et
     * qu'elle devait se distinguer. Le proprietaire a tranche l'inverse :
     * toutes blanches. Cet essai verifiait donc une regle qui n'est plus la
     * sienne — on ne le supprime pas, on le retourne, pour que le retour au
     * vert ne repasse pas en silence. Elle garde son cadenas, et c'est lui qui
     * la distingue maintenant. */
    ok(pastilles.swstk.fond > 200 && pastilles.swstk.texte < 140,
       `« swstk » : fond clair et texte sombre (${Math.round(pastilles.swstk.fond)}`
       + ` sur ${Math.round(pastilles.swstk.texte)}) — comme les trois autres`);
    await ctx.close();
  }

  /* ================== LA PORTE QU ON OUVRE EST CELLE QUI SIGNE ==================
   *
   * « Je me connecte a mon mail sur l accueil, je vais sur SWOGE World ou le
   * casino, et ca me deconnecte. » Ce n etait pas une deconnexion : on n avait
   * jamais ete connecte AU JEU.
   *
   * `swogecx.js` le disait lui-meme — « entrer ici veut dire le portefeuille
   * est connu, pas la partie est ouverte ». Il apprend une adresse ; il ne
   * signe rien. Le serveur, lui, n accepte qu un jeton signe range sous
   * `swogeSession`. Les pages de jeu le cherchent, ne le trouvent pas, et
   * redemandent — ce qui se lit exactement comme une deconnexion.
   *
   * On ne reecrit pas la signature ici : `stakebubble.js` porte deja « la meme
   * porte que celle des pages de jeu, exactement le meme message signe ». Un
   * second chemin vers une session serait un second chemin vers l argent.
   */
  console.log('\n-- le bouton de connexion ouvre la porte qui SIGNE --');
  for (const page of ['index.html', 'games.html']) {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${s.address().port}/${page}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1800);
    ok(await p.evaluate(() => typeof (window.swogeConnexion || {}).ouvre === 'function'),
       `${page} : la porte qui signe est disponible sur la page`);
    await p.locator('.cx-mail').first().click();
    await p.waitForTimeout(700);
    const ouvert = await p.evaluate(() => ({
      signe: !!document.querySelector('.swcon-ov'),
      apprend: !(document.getElementById('cxVoile') || {}).hidden,
    }));
    ok(ouvert.signe,
       `${page} : c est le formulaire qui SIGNE qui s ouvre — celui qui range`
       + ' `swogeSession`, le seul jeton que le serveur accepte');
    ok(!ouvert.apprend,
       `${page} : et non celui qui se contente d apprendre une adresse, qui`
       + ' laissait arriver au jeu sans session');
    await ctx.close();
  }
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('swogeSession', 'jeton-d-essai'); } catch (e) {}
    });
    const p = await ctx.newPage();
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.route('**/nexus.html', (r) => r.fulfill({ status: 200,
      contentType: 'text/html', body: '<html><body>LE MONDE</body></html>' }));
    await p.goto(`http://127.0.0.1:${s.address().port}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    ok(await p.evaluate(() => window.swogeConnecte()),
       'le jeton signe suffit a dire qu on est entre : c est la seule chose que le'
       + ' serveur accepte, et la seule qui vaille d une page a l autre');
    await p.click('#gxMonde');
    await p.waitForTimeout(900);
    eq(new URL(p.url()).pathname.split('/').pop(), 'nexus.html',
       'et la marque emmene au monde sans redemander quoi que ce soit');
    await ctx.close();
  }

  /* ================== LA MARQUE MENE AU MONDE ==================
   *
   * « SWOGE WORLD » portait `href="#"` : on cliquait le nom du jeu, en haut a
   * gauche, et rien n arrivait. Connecte, elle doit ouvrir le monde ; sinon
   * elle doit demander de qui il s agit — plutot que d envoyer vers une page
   * de jeu qui reposerait la question en arrivant.
   *
   * LES DEUX ETATS SONT ESSAYES. Un seul passerait tout seul : un lien qui
   * mene toujours au jeu passe le premier, un lien mort passe le second.
   */
  console.log('\n-- la marque mene au monde, ou demande d abord --');
  for (const page of ['index.html', 'games.html']) {
    /* ---- PAS CONNECTE : ON DEMANDE, ON NE NAVIGUE PAS ---- */
    {
      const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
      const p = await ctx.newPage();
      await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
      await p.goto(`http://127.0.0.1:${s.address().port}/${page}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      await p.click('#gxMonde');
      await p.waitForTimeout(600);
      const ou = new URL(p.url()).pathname.split('/').pop();
      eq(ou, page, `${page} : sans compte, la marque ne quitte PAS la page`);
      ok(await p.evaluate(() => !!document.querySelector('.swcon-ov')
                              || !(document.getElementById('cxVoile') || {}).hidden),
         `${page} : elle demande de qui il s agit, la ou l on est`);
      await ctx.close();
    }
    /* ---- CONNECTE : ON ENTRE ---- */
    {
      const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
      /* Le tiroir de `stakebubble.js`, pose avant que la page ne s execute :
         c est LUI que la question interroge en premier, et c est le cas du
         navigateur de Telegram — connecte sans qu aucune extension existe. */
      await ctx.addInitScript(() => {
        addEventListener('DOMContentLoaded', () => {
          const d = document.createElement('div'); d.className = 'swp';
          const t = document.createElement('div'); t.className = 'swp-t';
          d.appendChild(t); document.body.appendChild(d);
        });
      });
      const p = await ctx.newPage();
      await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
      await p.route('**/nexus.html', (r) => r.fulfill({ status: 200,
        contentType: 'text/html', body: '<html><body>LE MONDE</body></html>' }));
      await p.goto(`http://127.0.0.1:${s.address().port}/${page}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      await p.click('#gxMonde');
      await p.waitForTimeout(900);
      eq(new URL(p.url()).pathname.split('/').pop(), 'nexus.html',
         `${page} : connecte, elle ouvre le monde`);
      await ctx.close();
    }
  }
  /* Et le bouton du bandeau promet la meme chose : il doit faire la meme
     chose. Deux promesses identiques qui divergent sont pires que l une des
     deux morte. */
  {
    const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage();
    await p.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${s.address().port}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    await p.click('#gxMonde2');
    await p.waitForTimeout(600);
    ok(await p.evaluate(() => !!document.querySelector('.swcon-ov')
                            || !(document.getElementById('cxVoile') || {}).hidden),
       '« ENTER SWOGE WORLD » passe par le meme chemin que la marque');
    await ctx.close();
  }

  await nav.close(); s.close();
  console.log(`\nconnexion_unique.test.js : ${n} verifications, ${echecs} echec(s)`);
  process.exit(echecs ? 1 : 0);
})();
