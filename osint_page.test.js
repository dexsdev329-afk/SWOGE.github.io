'use strict';
/* ============================================================================
 * SWOGE OSINT — LA PAGE v2 MONTRE LES FAITS, LE CROISEMENT, ET SES BORDS
 *
 * La page v1 lisait une forme par source (organisation, infra, contacts...).
 * La v2 lit des FAITS — un triplet avec sa source — et en tire quatre vues :
 * les constats (le croisement), les contradictions (jamais tranchees), le
 * graphe (derive des faits), la table des faits. Cet essai reecrit l ancien
 * sur son intention, pas sur ses champs :
 *
 *   1. La page dit ce qu elle fait ET comment elle traite un nom, avant qu on tape.
 *   2. Un nom rend des candidats publics SEPARES ; un domaine, un email passent aussi.
 *   3. Les constats sont en tete, avec leurs pieces et leur gravite.
 *   4. Une personne se dessine autrement qu une machine, dans le graphe.
 *   5. Eteindre un calque l eteint PARTOUT : faits ET graphe.
 *   6. Les exports pointent la meme enquete, jamais une seconde requete.
 *   7. La trace passif/actif est montree : la recherche a-t-elle ete vue.
 *   8. Un refus du serveur ne laisse pas un vieux rapport a l ecran.
 *
 * Le rapport d essai est la SORTIE REELLE du noyau v2 contre un faux
 * internet (voir la generation dans le commit). Un rapport invente finirait
 * par decrire une forme que le serveur n envoie plus.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const http = require('http');

const SITE = __dirname;
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {}

let n = 0, rates = 0;
const ok = (c, m) => { n++; if (c) console.log('  ok   ' + m); else { rates++; console.log('  RATE ' + m); } };
const eq = (a, b, m) => ok(a === b, m + ' [' + JSON.stringify(a) + ']');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
            '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4' };

(async () => {
  if (!chromium) { console.log('playwright absent : essai ignore'); return; }
  const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((s) => srv.listen(0, '127.0.0.1', s));
  const port = srv.address().port;
  const nav = await chromium.launch();

  const APPELS = [];
  const ouvre = async (chemin, o) => {
    const page = await nav.newPage({ viewport: { width: 1200, height: 1000 } });
    await page.route(/vitrine\.json/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route(/\/osint\/v2\//, (r) => {
      APPELS.push(r.request().url());
      const rep = (o && o.reponse) || RELEVE;
      r.fulfill({ status: (o && o.code) || 200, contentType: 'application/json', body: JSON.stringify(rep) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_osint.html' + (chemin || ''), { waitUntil: 'domcontentloaded' });
    return page;
  };

  console.log('\n-- 1. la page dit ce qu elle fait, et ce qu elle refuse --');
  {
    const html = fs.readFileSync(path.join(SITE, 'swoge_osint.html'), 'utf8');
    ok(/name="description"[^>]*separate public candidates/i.test(html), 'la description dit qu un nom rend des candidats separes');
    ok(/<title>[^<]*SWOGE OSINT<\/title>/i.test(html), 'le titre porte OSINT');
    const page = await ouvre('');
    const garde = await page.textContent('.garde');
    ok(/candidates|never a confirmed identity/i.test(garde), 'la garde est posee avant qu on tape');
    ok(/same name is not the same person|leaked database/i.test(garde), 'et elle dit COMMENT un nom est traite : rien n est fusionne');
    const champs = await page.$$eval('input', (e) => e.length);
    eq(champs, 1, 'un seul champ de saisie');
    await page.close();
  }

  console.log('\n-- 2. un nom rend des candidats SEPARES, jamais fusionnes --');
  {
    /* Deux personnes portent « Ada Lovelace » : une entite Wikidata, un
       compte GitHub. Le rapport les garde DISTINCTES — deux lignes PUBLIC
       CANDIDATE de valeurs differentes — et chacune est marquee LOW / non
       verifiee. Porter le meme nom n est pas etre la meme personne, et la
       page le montre sans jamais les fondre. */
    const CANDIDATS = {
      cible: { type: 'personne', valeur: 'Ada Lovelace' }, ms: 140, passif: false, doublonsFondus: 0,
      constats: [], contradictions: [], journal: [{ c: 'wikidata', e: 'Ada Lovelace', etat: 'ok', faits: 2, ms: 90 }],
      connecteursEteints: [], connecteursEcartes: [],
      limites: ['A person’s name returns SEPARATE public candidates (Wikidata, GitHub) — never a confirmed identity. Same name is not the same person, and nothing is merged.'],
      faits: [
        { sujet: { type: 'personne', valeur: 'Ada Lovelace' }, predicat: 'PUBLIC CANDIDATE',
          objet: { type: 'candidat', valeur: 'Ada Lovelace — Q7259' }, confiance: 'LOW', score: 12, verifie: false,
          conteste: false, sources: ['https://www.wikidata.org/wiki/Q7259'], pourquoi: 'Same name is not the same person — unverified.' },
        { sujet: { type: 'candidat', valeur: 'Ada Lovelace — Q7259' }, predicat: 'DESCRIBED AS',
          valeur: 'English mathematician, 1815–1852', confiance: 'LOW', score: 12, verifie: false, conteste: false,
          sources: ['https://www.wikidata.org/wiki/Q7259'] },
        { sujet: { type: 'personne', valeur: 'Ada Lovelace' }, predicat: 'PUBLIC CANDIDATE',
          objet: { type: 'candidat', valeur: '@ada (GitHub)' }, confiance: 'LOW', score: 12, verifie: false,
          conteste: false, sources: ['https://github.com/ada'], pourquoi: 'Same name is not the same person — unverified.' },
      ],
    };
    const page = await ouvre('', { reponse: CANDIDATS });
    await page.fill('#q', 'Ada Lovelace');
    await page.click('#go');
    await page.waitForSelector('#out:not([hidden])');
    ok(/personne/i.test(await page.textContent('#state')), 'le nom est accepte, pas refuse');
    const rows = await page.$$eval('#faitsBox tbody tr', (tr) => tr.map((x) => x.textContent));
    const cands = rows.filter((l) => /PUBLIC CANDIDATE/.test(l));
    eq(cands.length, 2, 'deux candidats, un par source');
    ok(/Q7259/.test(cands.join('|')) && /@ada/.test(cands.join('|')), 'et ils restent distincts : Wikidata ET GitHub, jamais fondus');
    ok(cands.every((l) => /LOW/.test(l)), 'chaque candidat est marque LOW');
    await page.close();
  }

  console.log('\n-- 3. un rapport complet se peint, les constats en tete --');
  let page = null;
  {
    page = await ouvre('');
    APPELS.length = 0;
    await page.fill('#q', 'acme.io');
    await page.click('#go');
    await page.waitForSelector('#out:not([hidden])');
    eq(APPELS.length, 1, 'un seul appel');
    ok(APPELS[0].includes('/osint/v2/acme.io'), 'a /osint/v2, avec ce qu on a tape');

    const constats = await page.$$eval('#constatsBox .constat', (e) => e.map((x) => x.textContent));
    ok(constats.length >= 2, 'les constats sont peints [' + constats.length + ']');
    ok(constats.some((c) => /HIGH/.test(c) && /DMARC/i.test(c)), 'MX sans DMARC est en tete, en HIGH');
    ok(constats.some((c) => /Being named is not owning/i.test(c)), 'et le rappel : etre nomme n est pas posseder');
    /* La gravite se lit a la classe, pas seulement au mot. */
    const haute = await page.$$eval('#constatsBox .constat.g-haute', (e) => e.length);
    ok(haute >= 1, 'la gravite haute a sa couleur [' + haute + ']');
    /* Chaque constat porte ses pieces. */
    ok(await page.$('#constatsBox .piece'), 'et chaque constat montre ses pieces');
  }

  console.log('\n-- 4. les faits, avec source, score, et le conteste signale --');
  {
    const lignes = await page.$$eval('#faitsBox tbody tr', (tr) => tr.map((x) => x.textContent));
    ok(lignes.length >= 10, 'les faits sont en table [' + lignes.length + ']');
    ok(lignes.some((l) => /DMARC/i.test(l) && /HIGH/.test(l)), 'un fait porte son predicat et sa confiance');
    const liens = await page.$$eval('#faitsBox a', (a) => a.map((x) => x.href));
    ok(liens.length > 0 && liens.some((h) => h.includes('acme.io') || h.includes('rdap')), 'et ses sources sont des liens');
    /* Le score doit apparaitre a cote de la confiance. */
    ok(lignes.some((l) => /HIGH\s*\d/.test(l.replace(/\s+/g, ' '))), 'le score numerique accompagne le niveau');
  }

  console.log('\n-- 5. une personne n est pas dessinee comme une machine --');
  {
    const g = await page.$eval('#gr', (s) => ({
      rects: s.querySelectorAll('rect').length,
      cercles: s.querySelectorAll('circle').length,
      titres: [...s.querySelectorAll('line title')].map((t) => t.textContent),
    }));
    eq(g.rects, 2, 'deux rectangles : les deux personnes, et elles seules');
    ok(g.cercles > 4, 'les machines sont des cercles [' + g.cercles + ']');
    ok(g.titres.every((t) => /https?:\/\/|DNS|registry|launchpad|record/i.test(t)),
       'chaque arete porte sa source');
    ok(g.titres.some((t) => /PUBLICLY ASSOCIATED WITH DOMAIN/.test(t)), 'et la relation exacte, pas une conclusion');
    const html = fs.readFileSync(path.join(SITE, 'swoge_osint.html'), 'utf8');
    const externes = (html.match(/<script[^>]+src=["']https?:\/\/(?!fonts\.)/gi) || []);
    eq(externes.length, 0, 'aucun script tiers pour dessiner le graphe');
  }

  console.log('\n-- 6. eteindre un calque l eteint PARTOUT --');
  {
    const avantF = await page.$$eval('#faitsBox tbody tr', (e) => e.length);
    const avantR = await page.$eval('#gr', (s) => s.querySelectorAll('rect').length);
    await page.click('.calque[data-c="contacts"]');
    await page.waitForTimeout(120);
    const apresF = await page.$$eval('#faitsBox tbody tr', (e) => e.length);
    const apresR = await page.$eval('#gr', (s) => s.querySelectorAll('rect').length);
    ok(apresF < avantF, 'eteindre les contacts retire des faits [' + avantF + ' -> ' + apresF + ']');
    eq(apresR, 0, 'et AUCUNE personne ne reste dans le graphe');
    await page.click('.calque[data-c="contacts"]');
    await page.waitForTimeout(120);
    eq(await page.$eval('#gr', (s) => s.querySelectorAll('rect').length), 2, 'rallumer les remet');
    eq(APPELS.length, 1, 'et rien n a ete redemande : le rapport etait deja la');
  }

  console.log('\n-- 7. la trace, et les exports qui ne relancent rien --');
  {
    const tr = await page.textContent('#trace');
    ok(/active|passive/i.test(tr), 'la trace dit si la cible nous a vus [' + tr.trim() + ']');
    const csv = await page.getAttribute('#teleCsv', 'href');
    const pdf = await page.getAttribute('#telePdf', 'href');
    ok(csv.includes('/osint/v2/') && csv.includes('.csv'), 'le lien CSV pointe la meme enquete');
    ok(pdf.includes('.pdf'), 'le lien PDF aussi');
    ok(!(await page.isHidden('#teleCsv')), 'et les boutons d export sont montres');
    eq(APPELS.length, 1, 'preparer les exports n a pas relance l enquete');
  }

  console.log('\n-- 8. les sources et les bords sont montres avec le reste --');
  {
    const src = await page.textContent('#sourcesBox');
    ok(/dns|rdap|certificats|pages/i.test(src), 'le journal des connecteurs est montre');
    const bords = await page.$$eval('#bordsBox li', (e) => e.map((x) => x.textContent));
    ok(bords.length >= 5, 'les limites sont listees [' + bords.length + ']');
    ok(bords.some((b) => /separate public candidates/i.test(b)), 'un nom rend des candidats separes, jamais une identite');
    ok(bords.some((b) => /No password|secret/i.test(b)), 'aucun secret');
    /* Les connecteurs eteints faute de cle sont montres, pas tus. */
    const off = await page.textContent('#offBox');
    ok(/HIBP|key|off/i.test(off), 'et les connecteurs eteints se disent eteints');
    await page.close();
  }

  console.log('\n-- 9. un lien partage porte sa cible --');
  {
    const p = await ouvre('?q=domaine:acme.io');
    await p.waitForSelector('#out:not([hidden])');
    eq(await p.inputValue('#q'), 'acme.io', 'le champ est rempli, sans le prefixe de type');
    ok((await p.textContent('#state')).includes('acme.io'), 'et l enquete part toute seule');
    await p.close();
  }

  console.log('\n-- 10. un refus du serveur ne laisse pas un vieux rapport --');
  {
    const p = await ouvre('');
    await p.fill('#q', 'acme.io');
    await p.click('#go');
    await p.waitForSelector('#out:not([hidden])');
    await p.unroute(/\/osint\/v2\//);
    await p.route(/\/osint\/v2\//, (r) => r.fulfill({ status: 429, contentType: 'application/json',
      body: JSON.stringify({ erreur: 'too many reports, wait a minute' }) }));
    await p.fill('#q', 'autre.io');
    await p.click('#go');
    await p.waitForTimeout(250);
    eq(await p.isHidden('#out'), true, 'le rapport precedent est retire');
    ok((await p.textContent('#state')).includes('too many'), 'et la raison est montree telle quelle');
    await p.close();
  }

  await nav.close();
  await new Promise((s) => srv.close(s));
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });

/* ---- LE RAPPORT D ESSAI ----
 * Sortie reelle du noyau v2 contre un faux internet. Recopiee, pas inventee. */

const RELEVE = {
 "cible": {
  "type": "domaine",
  "valeur": "acme.io"
 },
 "date": "2026-09-21",
 "ms": 1840,
 "faits": [
  {
   "empreinte": "681706e04f366331",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "RESOLVES TO",
   "objet": {
    "type": "ip",
    "valeur": "8.8.8.8"
   },
   "valeur": null,
   "connecteur": "dns",
   "sources": [
    "DNS answer for acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "the domain answers this to every resolver on earth",
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "610dd94285882ec7",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "MAIL HANDLED BY",
   "objet": {
    "type": "domaine",
    "valeur": "aspmx.l.google.com"
   },
   "valeur": null,
   "connecteur": "dns",
   "sources": [
    "DNS answer for acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "c2eb649f90139779",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "MAIL HOSTED BY",
   "objet": null,
   "valeur": "google.com",
   "connecteur": "dns",
   "sources": [
    "DNS answer for acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "069047fd64b8a204",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "NAME SERVER",
   "objet": null,
   "valeur": "ns1.registrar.net",
   "connecteur": "dns",
   "sources": [
    "DNS answer for acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "bc315c8c890ce466",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "DMARC",
   "objet": null,
   "valeur": "none published",
   "connecteur": "dns",
   "sources": [
    "DNS answer for acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "no DMARC record: nothing stops a third party forging mail from this domain",
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "70a0cf57bf60449d",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "PUBLISHES CONTACT",
   "objet": {
    "type": "email",
    "valeur": "security@acme.io"
   },
   "valeur": null,
   "connecteur": "pages",
   "sources": [
    "https://acme.io/.well-known/security.txt"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "published in the domain’s security.txt (RFC 9116)",
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "b2374ef0f36632c7",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "PUBLISHES CONTACT",
   "objet": {
    "type": "email",
    "valeur": "presse@acme.io"
   },
   "valeur": null,
   "connecteur": "pages",
   "sources": [
    "https://acme.io/mentions-legales"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "published on the organisation’s own legal notice",
   "extrait": "Directeur de la publication : Marc Lefevre presse@acme.io",
   "score": 88
  },
  {
   "empreinte": "e0ee897a5732c56a",
   "sujet": {
    "type": "personne",
    "valeur": "Marc Lefevre"
   },
   "predicat": "DOMAIN OWNER",
   "objet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "valeur": null,
   "connecteur": "pages",
   "sources": [
    "https://acme.io/mentions-legales"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "named as publisher on the legal notice of this domain",
   "extrait": "Directeur de la publication : Marc Lefevre presse@acme.io",
   "score": 88
  },
  {
   "empreinte": "bd6530689dc513a4",
   "sujet": {
    "type": "personne",
    "valeur": "Marc Lefevre"
   },
   "predicat": "ROLE IS",
   "objet": null,
   "valeur": "Directeur de la publication",
   "connecteur": "pages",
   "sources": [
    "https://acme.io/mentions-legales"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "df6f4ed90ece873c",
   "sujet": {
    "type": "domaine",
    "valeur": "staging.acme.io"
   },
   "predicat": "MAIL HANDLED BY",
   "objet": {
    "type": "domaine",
    "valeur": "aspmx.l.google.com"
   },
   "valeur": null,
   "connecteur": "dns",
   "sources": [
    "DNS answer for staging.acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "f18a1b5adc86f18d",
   "sujet": {
    "type": "domaine",
    "valeur": "staging.acme.io"
   },
   "predicat": "MAIL HOSTED BY",
   "objet": null,
   "valeur": "google.com",
   "connecteur": "dns",
   "sources": [
    "DNS answer for staging.acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "8e10a7ca09b34c3e",
   "sujet": {
    "type": "domaine",
    "valeur": "staging.acme.io"
   },
   "predicat": "NAME SERVER",
   "objet": null,
   "valeur": "ns1.registrar.net",
   "connecteur": "dns",
   "sources": [
    "DNS answer for staging.acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "9abdddbbda481839",
   "sujet": {
    "type": "domaine",
    "valeur": "staging.acme.io"
   },
   "predicat": "DMARC",
   "objet": null,
   "valeur": "none published",
   "connecteur": "dns",
   "sources": [
    "DNS answer for staging.acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "no DMARC record: nothing stops a third party forging mail from this domain",
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "3876713d3cc3d0a2",
   "sujet": {
    "type": "domaine",
    "valeur": "aspmx.l.google.com"
   },
   "predicat": "MAIL HANDLED BY",
   "objet": {
    "type": "domaine",
    "valeur": "aspmx.l.google.com"
   },
   "valeur": null,
   "connecteur": "dns",
   "sources": [
    "DNS answer for aspmx.l.google.com"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "1cc0bfb1f13fe55a",
   "sujet": {
    "type": "domaine",
    "valeur": "aspmx.l.google.com"
   },
   "predicat": "MAIL HOSTED BY",
   "objet": null,
   "valeur": "google.com",
   "connecteur": "dns",
   "sources": [
    "DNS answer for aspmx.l.google.com"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "4689a1671c5a1ac5",
   "sujet": {
    "type": "domaine",
    "valeur": "aspmx.l.google.com"
   },
   "predicat": "NAME SERVER",
   "objet": null,
   "valeur": "ns1.registrar.net",
   "connecteur": "dns",
   "sources": [
    "DNS answer for aspmx.l.google.com"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "7cdbb5265f790b7c",
   "sujet": {
    "type": "domaine",
    "valeur": "aspmx.l.google.com"
   },
   "predicat": "DMARC",
   "objet": null,
   "valeur": "none published",
   "connecteur": "dns",
   "sources": [
    "DNS answer for aspmx.l.google.com"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "no DMARC record: nothing stops a third party forging mail from this domain",
   "extrait": null,
   "score": 88
  },
  {
   "empreinte": "bf6e9d479549aeb5",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "REGISTRAR IS",
   "objet": null,
   "valeur": "Registrar SAS",
   "connecteur": "rdap",
   "sources": [
    "https://rdap.org/domain/acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 80
  },
  {
   "empreinte": "7d6161f1ffa9d930",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "REGISTERED ON",
   "objet": null,
   "valeur": "2014-03-02",
   "connecteur": "rdap",
   "sources": [
    "https://rdap.org/domain/acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 80
  },
  {
   "empreinte": "3f5358819f44faf3",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "EXPIRES ON",
   "objet": null,
   "valeur": "2027-03-02",
   "connecteur": "rdap",
   "sources": [
    "https://rdap.org/domain/acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 80
  },
  {
   "empreinte": "942bd35171f31d52",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "REGISTRY STATUS",
   "objet": null,
   "valeur": "client transfer prohibited",
   "connecteur": "rdap",
   "sources": [
    "https://rdap.org/domain/acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 80
  },
  {
   "empreinte": "139896b989e377f3",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "REGISTRANT IS",
   "objet": null,
   "valeur": "redacted by the registry",
   "connecteur": "rdap",
   "sources": [
    "https://rdap.org/domain/acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "HIGH",
   "pourquoi": "withheld since the GDPR for most domains. Absence of a name is not a hidden name.",
   "extrait": null,
   "score": 80
  },
  {
   "empreinte": "661303164a7a6bd7",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "CERTIFIED BY",
   "objet": null,
   "valeur": "Let's Encrypt (1)",
   "connecteur": "certificats",
   "sources": [
    "https://crt.sh/?q=%25.acme.io&output=json"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 80
  },
  {
   "empreinte": "1900eb7037c15df8",
   "sujet": {
    "type": "ip",
    "valeur": "8.8.8.8"
   },
   "predicat": "ANNOUNCED IN",
   "objet": {
    "type": "reseau",
    "valeur": "GOGL"
   },
   "valeur": null,
   "connecteur": "reseau",
   "sources": [
    "https://rdap.org/ip/8.8.8.8"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 80
  },
  {
   "empreinte": "d7677456043fb901",
   "sujet": {
    "type": "ip",
    "valeur": "8.8.8.8"
   },
   "predicat": "OPERATED BY",
   "objet": null,
   "valeur": "Google LLC",
   "connecteur": "reseau",
   "sources": [
    "https://rdap.org/ip/8.8.8.8"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "HIGH",
   "pourquoi": null,
   "extrait": null,
   "score": 80
  },
  {
   "empreinte": "9f851daea99f1e60",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "WEB ARCHIVE",
   "objet": null,
   "valeur": "2 archived pages, from 2015 to 2020",
   "connecteur": "archive",
   "sources": [
    "https://web.archive.org/web/*/acme.io"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "a public archive of what this domain showed the world over time",
   "extrait": null,
   "score": 63
  },
  {
   "empreinte": "48da6f64413ed6f1",
   "sujet": {
    "type": "personne",
    "valeur": "Marc Lefevre"
   },
   "predicat": "PROFESSIONAL EMAIL",
   "objet": {
    "type": "email",
    "valeur": "presse@acme.io"
   },
   "valeur": null,
   "connecteur": "pages",
   "sources": [
    "https://acme.io/mentions-legales"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "name, role and address printed within the same window on the page",
   "extrait": null,
   "score": 63
  },
  {
   "empreinte": "9672cbd4e7bb20a6",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "PUBLISHES CONTACT",
   "objet": {
    "type": "email",
    "valeur": "contact@acme.io"
   },
   "valeur": null,
   "connecteur": "pages",
   "sources": [
    "https://acme.io/contact"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "published on the organisation’s own contact page",
   "extrait": "mailto: contact@acme.io",
   "score": 63
  },
  {
   "empreinte": "0c13e29520f2a0fc",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "PUBLISHES CONTACT",
   "objet": {
    "type": "email",
    "valeur": "jane.doe@acme.io"
   },
   "valeur": null,
   "connecteur": "pages",
   "sources": [
    "https://acme.io/contact"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "published on the organisation’s own contact page",
   "extrait": "nous ecrire Jane Doe, Chief Technology Officer — jane.doe@acme.io X",
   "score": 63
  },
  {
   "empreinte": "106e281e9b90789e",
   "sujet": {
    "type": "personne",
    "valeur": "Jane Doe"
   },
   "predicat": "PUBLICLY ASSOCIATED WITH DOMAIN",
   "objet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "valeur": null,
   "connecteur": "pages",
   "sources": [
    "https://acme.io/contact"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "the organisation published this person on one of its own pages; this does not establish ownership",
   "extrait": "nous ecrire Jane Doe, Chief Technology Officer — jane.doe@acme.io X",
   "score": 63
  },
  {
   "empreinte": "042b1717b2d3181a",
   "sujet": {
    "type": "personne",
    "valeur": "Jane Doe"
   },
   "predicat": "ROLE IS",
   "objet": null,
   "valeur": "Chief Technology Officer",
   "connecteur": "pages",
   "sources": [
    "https://acme.io/contact"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": null,
   "extrait": null,
   "score": 63
  },
  {
   "empreinte": "eb5e63bd0960c0ff",
   "sujet": {
    "type": "personne",
    "valeur": "Jane Doe"
   },
   "predicat": "PROFESSIONAL EMAIL",
   "objet": {
    "type": "email",
    "valeur": "jane.doe@acme.io"
   },
   "valeur": null,
   "connecteur": "pages",
   "sources": [
    "https://acme.io/contact"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "name, role and address printed within the same window on the page",
   "extrait": null,
   "score": 63
  },
  {
   "empreinte": "2e330e4b0c295436",
   "sujet": {
    "type": "personne",
    "valeur": "Jane Doe"
   },
   "predicat": "PUBLIC ACCOUNT",
   "objet": null,
   "valeur": "https://x.com/janedoe",
   "connecteur": "pages",
   "sources": [
    "https://acme.io/contact"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "printed on this page next to this name; being printed here does not make it theirs",
   "extrait": null,
   "score": 63
  },
  {
   "empreinte": "3784a39e77ef6c85",
   "sujet": {
    "type": "ip",
    "valeur": "8.8.8.8"
   },
   "predicat": "COUNTRY IS",
   "objet": null,
   "valeur": "US",
   "connecteur": "reseau",
   "sources": [
    "https://rdap.org/ip/8.8.8.8"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "MEDIUM",
   "pourquoi": null,
   "extrait": null,
   "score": 55
  },
  {
   "empreinte": "2ff246433e5495fc",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "PUBLISHES CONTACT",
   "objet": {
    "type": "email",
    "valeur": "hello@acme.io"
   },
   "valeur": null,
   "connecteur": "pages",
   "sources": [
    "https://acme.io/"
   ],
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "LOW",
   "pourquoi": "found on the site, but not on a page meant for contact",
   "extrait": "Acme — build things hello@acme.io",
   "score": 38
  },
  {
   "empreinte": "a7556e16f2914154",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "CERTIFICATE ISSUED FOR",
   "objet": {
    "type": "domaine",
    "valeur": "staging.acme.io"
   },
   "valeur": null,
   "connecteur": "certificats",
   "sources": [
    "https://crt.sh/?q=%25.acme.io&output=json"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "LOW",
   "pourquoi": "from a public certificate log, not confirmed against the host itself",
   "extrait": null,
   "score": 30
  },
  {
   "empreinte": "1d3d03d47f83eaa2",
   "sujet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "predicat": "CERTIFICATE ISSUED FOR",
   "objet": {
    "type": "domaine",
    "valeur": "acme.io"
   },
   "valeur": null,
   "connecteur": "certificats",
   "sources": [
    "https://crt.sh/?q=%25.acme.io&output=json"
   ],
   "vu": "2026-09-21",
   "verifie": false,
   "confiance": "LOW",
   "pourquoi": "from a public certificate log, not confirmed against the host itself",
   "extrait": null,
   "score": 30
  }
 ],
 "contradictions": [],
 "doublonsFondus": 0,
 "entites": [
  {
   "type": "domaine",
   "valeur": "acme.io",
   "profondeur": 0
  },
  {
   "type": "domaine",
   "valeur": "staging.acme.io",
   "profondeur": 1
  },
  {
   "type": "ip",
   "valeur": "8.8.8.8",
   "profondeur": 1
  },
  {
   "type": "domaine",
   "valeur": "aspmx.l.google.com",
   "profondeur": 1
  },
  {
   "type": "email",
   "valeur": "hello@acme.io",
   "profondeur": 1
  },
  {
   "type": "email",
   "valeur": "security@acme.io",
   "profondeur": 1
  },
  {
   "type": "email",
   "valeur": "presse@acme.io",
   "profondeur": 1
  },
  {
   "type": "personne",
   "valeur": "Marc Lefevre",
   "profondeur": 1
  },
  {
   "type": "email",
   "valeur": "contact@acme.io",
   "profondeur": 1
  },
  {
   "type": "email",
   "valeur": "jane.doe@acme.io",
   "profondeur": 1
  },
  {
   "type": "personne",
   "valeur": "Jane Doe",
   "profondeur": 1
  },
  {
   "type": "reseau",
   "valeur": "GOGL",
   "profondeur": 2
  }
 ],
 "journal": [
  {
   "c": "archive",
   "e": "domaine:acme.io",
   "etat": "ok",
   "ms": 5,
   "attenteHote": 0,
   "faits": 1
  },
  {
   "c": "rdap",
   "e": "domaine:acme.io",
   "etat": "ok",
   "ms": 5,
   "attenteHote": 0,
   "faits": 5
  },
  {
   "c": "certificats",
   "e": "domaine:acme.io",
   "etat": "ok",
   "ms": 5,
   "attenteHote": 0,
   "faits": 3
  },
  {
   "c": "dns",
   "e": "domaine:acme.io",
   "etat": "ok",
   "ms": 5,
   "attenteHote": 0,
   "faits": 5
  },
  {
   "c": "pages",
   "e": "domaine:acme.io",
   "etat": "ok",
   "ms": 11,
   "attenteHote": 0,
   "faits": 12
  },
  {
   "c": "dns",
   "e": "domaine:staging.acme.io",
   "etat": "ok",
   "ms": 1,
   "attenteHote": 0,
   "faits": 4
  },
  {
   "c": "dns",
   "e": "domaine:aspmx.l.google.com",
   "etat": "ok",
   "ms": 0,
   "attenteHote": 0,
   "faits": 4
  },
  {
   "c": "pages",
   "e": "domaine:staging.acme.io",
   "etat": "ok",
   "ms": 0,
   "attenteHote": 0,
   "faits": 0
  },
  {
   "c": "rdap",
   "e": "domaine:staging.acme.io",
   "etat": "ok",
   "ms": 1992,
   "attenteHote": 1989,
   "faits": 0
  },
  {
   "c": "pages",
   "e": "domaine:aspmx.l.google.com",
   "etat": "ok",
   "ms": 0,
   "attenteHote": 0,
   "faits": 0
  },
  {
   "c": "archive",
   "e": "domaine:staging.acme.io",
   "etat": "ok",
   "ms": 3990,
   "attenteHote": 3988,
   "faits": 0
  },
  {
   "c": "reseau",
   "e": "ip:8.8.8.8",
   "etat": "ok",
   "ms": 3991,
   "attenteHote": 3988,
   "faits": 3
  },
  {
   "c": "certificats",
   "e": "domaine:staging.acme.io",
   "etat": "ok",
   "ms": 4989,
   "attenteHote": 4988,
   "faits": 0
  },
  {
   "c": "rdap",
   "e": "domaine:aspmx.l.google.com",
   "etat": "ok",
   "ms": 5989,
   "attenteHote": 5988,
   "faits": 0
  },
  {
   "c": "archive",
   "e": "domaine:aspmx.l.google.com",
   "etat": "ok",
   "ms": 5999,
   "attenteHote": 5997,
   "faits": 0
  },
  {
   "c": "certificats",
   "e": "domaine:aspmx.l.google.com",
   "etat": "ok",
   "ms": 9989,
   "attenteHote": 9988,
   "faits": 0
  }
 ],
 "connecteursEteints": [
  {
   "nom": "shodan",
   "pourquoi": "needs SHODAN_API_KEY",
   "cout": "key required (free tier available)"
  },
  {
   "nom": "abuseipdb",
   "pourquoi": "needs ABUSEIPDB_API_KEY",
   "cout": "key required (free tier available)"
  },
  {
   "nom": "fuites",
   "pourquoi": "needs HIBP_API_KEY",
   "cout": "~$4/month, key required"
  }
 ],
 "connecteursEcartes": [],
 "constats": [
  {
   "regle": "mail-usurpable",
   "gravite": "haute",
   "etiquette": "HIGH",
   "dit": "This domain receives mail but publishes no DMARC policy. Anyone can send mail in its name and receiving servers have nothing to check it against.",
   "pieces": [
    {
     "predicat": "DMARC",
     "valeur": "none published",
     "sources": [
      "DNS answer for acme.io"
     ]
    }
   ]
  },
  {
   "regle": "adresse-nominative-publiee",
   "gravite": "basse",
   "etiquette": "LOW",
   "dit": "1 named mailbox is published on this organisation’s own pages. That is their choice to make, and worth knowing if you are the one who published them.",
   "pieces": [
    {
     "predicat": "PUBLISHES CONTACT",
     "valeur": "jane.doe@acme.io",
     "sources": [
      "https://acme.io/contact"
     ]
    }
   ]
  },
  {
   "regle": "nomme-nest-pas-proprietaire",
   "gravite": "info",
   "etiquette": "NOTE",
   "dit": "1 person is named by this organisation on its own pages. Being named is not owning: only a registry entry in clear or a legal notice establishes that, and neither is present here.",
   "pieces": [
    {
     "predicat": "PUBLICLY ASSOCIATED WITH DOMAIN",
     "valeur": "acme.io",
     "sources": [
      "https://acme.io/contact"
     ]
    }
   ]
  }
 ],
 "passif": false,
 "budgetAtteint": false,
 "limites": [
  "A person’s name returns SEPARATE public candidates (Wikidata, GitHub) — never a confirmed identity. Same name is not the same person, and nothing is merged.",
  "E-mail addresses, usernames and phone numbers are selectors: closed questions about them, never an expansion into a person.",
  "No leaked or private database is queried. No login, paywall or anti-bot protection is bypassed. robots.txt is obeyed.",
  "No password, hash or secret is ever fetched, stored or shown — breach checks report presence and data categories only.",
  "Being named on a page is not owning a domain. Sources that disagree are both shown; nothing is picked for you.",
  "Every number carries how many observations it rests on. A past record is a measurement, not a prediction."
 ],
 "graphe": {
  "noeuds": [
   {
    "id": "domaine:acme.io",
    "type": "domaine",
    "nom": "acme.io",
    "filtre": "infrastructure",
    "humain": false,
    "attributs": [
     {
      "quoi": "MAIL HOSTED BY",
      "valeur": "google.com",
      "confiance": "HIGH",
      "sources": [
       "DNS answer for acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "NAME SERVER",
      "valeur": "ns1.registrar.net",
      "confiance": "HIGH",
      "sources": [
       "DNS answer for acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "DMARC",
      "valeur": "none published",
      "confiance": "HIGH",
      "sources": [
       "DNS answer for acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "REGISTRAR IS",
      "valeur": "Registrar SAS",
      "confiance": "HIGH",
      "sources": [
       "https://rdap.org/domain/acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "REGISTERED ON",
      "valeur": "2014-03-02",
      "confiance": "HIGH",
      "sources": [
       "https://rdap.org/domain/acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "EXPIRES ON",
      "valeur": "2027-03-02",
      "confiance": "HIGH",
      "sources": [
       "https://rdap.org/domain/acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "REGISTRY STATUS",
      "valeur": "client transfer prohibited",
      "confiance": "HIGH",
      "sources": [
       "https://rdap.org/domain/acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "REGISTRANT IS",
      "valeur": "redacted by the registry",
      "confiance": "HIGH",
      "sources": [
       "https://rdap.org/domain/acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "CERTIFIED BY",
      "valeur": "Let's Encrypt (1)",
      "confiance": "HIGH",
      "sources": [
       "https://crt.sh/?q=%25.acme.io&output=json"
      ],
      "conteste": false
     },
     {
      "quoi": "WEB ARCHIVE",
      "valeur": "2 archived pages, from 2015 to 2020",
      "confiance": "MEDIUM",
      "sources": [
       "https://web.archive.org/web/*/acme.io"
      ],
      "conteste": false
     }
    ],
    "cible": true
   },
   {
    "id": "ip:8.8.8.8",
    "type": "ip",
    "nom": "8.8.8.8",
    "filtre": "infrastructure",
    "humain": false,
    "attributs": [
     {
      "quoi": "OPERATED BY",
      "valeur": "Google LLC",
      "confiance": "HIGH",
      "sources": [
       "https://rdap.org/ip/8.8.8.8"
      ],
      "conteste": false
     },
     {
      "quoi": "COUNTRY IS",
      "valeur": "US",
      "confiance": "MEDIUM",
      "sources": [
       "https://rdap.org/ip/8.8.8.8"
      ],
      "conteste": false
     }
    ]
   },
   {
    "id": "domaine:aspmx.l.google.com",
    "type": "domaine",
    "nom": "aspmx.l.google.com",
    "filtre": "infrastructure",
    "humain": false,
    "attributs": [
     {
      "quoi": "MAIL HOSTED BY",
      "valeur": "google.com",
      "confiance": "HIGH",
      "sources": [
       "DNS answer for aspmx.l.google.com"
      ],
      "conteste": false
     },
     {
      "quoi": "NAME SERVER",
      "valeur": "ns1.registrar.net",
      "confiance": "HIGH",
      "sources": [
       "DNS answer for aspmx.l.google.com"
      ],
      "conteste": false
     },
     {
      "quoi": "DMARC",
      "valeur": "none published",
      "confiance": "HIGH",
      "sources": [
       "DNS answer for aspmx.l.google.com"
      ],
      "conteste": false
     }
    ]
   },
   {
    "id": "email:security@acme.io",
    "type": "email",
    "nom": "security@acme.io",
    "filtre": "contacts",
    "humain": false,
    "attributs": []
   },
   {
    "id": "email:presse@acme.io",
    "type": "email",
    "nom": "presse@acme.io",
    "filtre": "contacts",
    "humain": false,
    "attributs": []
   },
   {
    "id": "personne:Marc Lefevre",
    "type": "personne",
    "nom": "Marc Lefevre",
    "filtre": "contacts",
    "humain": true,
    "attributs": [
     {
      "quoi": "ROLE IS",
      "valeur": "Directeur de la publication",
      "confiance": "HIGH",
      "sources": [
       "https://acme.io/mentions-legales"
      ],
      "conteste": false
     }
    ]
   },
   {
    "id": "domaine:staging.acme.io",
    "type": "domaine",
    "nom": "staging.acme.io",
    "filtre": "infrastructure",
    "humain": false,
    "attributs": [
     {
      "quoi": "MAIL HOSTED BY",
      "valeur": "google.com",
      "confiance": "HIGH",
      "sources": [
       "DNS answer for staging.acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "NAME SERVER",
      "valeur": "ns1.registrar.net",
      "confiance": "HIGH",
      "sources": [
       "DNS answer for staging.acme.io"
      ],
      "conteste": false
     },
     {
      "quoi": "DMARC",
      "valeur": "none published",
      "confiance": "HIGH",
      "sources": [
       "DNS answer for staging.acme.io"
      ],
      "conteste": false
     }
    ]
   },
   {
    "id": "reseau:GOGL",
    "type": "reseau",
    "nom": "GOGL",
    "filtre": "infrastructure",
    "humain": false,
    "attributs": []
   },
   {
    "id": "email:contact@acme.io",
    "type": "email",
    "nom": "contact@acme.io",
    "filtre": "contacts",
    "humain": false,
    "attributs": []
   },
   {
    "id": "email:jane.doe@acme.io",
    "type": "email",
    "nom": "jane.doe@acme.io",
    "filtre": "contacts",
    "humain": false,
    "attributs": []
   },
   {
    "id": "personne:Jane Doe",
    "type": "personne",
    "nom": "Jane Doe",
    "filtre": "contacts",
    "humain": true,
    "attributs": [
     {
      "quoi": "ROLE IS",
      "valeur": "Chief Technology Officer",
      "confiance": "MEDIUM",
      "sources": [
       "https://acme.io/contact"
      ],
      "conteste": false
     },
     {
      "quoi": "PUBLIC ACCOUNT",
      "valeur": "https://x.com/janedoe",
      "confiance": "MEDIUM",
      "sources": [
       "https://acme.io/contact"
      ],
      "conteste": false
     }
    ]
   },
   {
    "id": "email:hello@acme.io",
    "type": "email",
    "nom": "hello@acme.io",
    "filtre": "contacts",
    "humain": false,
    "attributs": []
   }
  ],
  "aretes": [
   {
    "de": "domaine:acme.io",
    "vers": "ip:8.8.8.8",
    "relation": "RESOLVES TO",
    "source": "DNS answer for acme.io",
    "sources": [
     "DNS answer for acme.io"
    ],
    "confiance": "HIGH",
    "score": 88,
    "conteste": false
   },
   {
    "de": "domaine:acme.io",
    "vers": "domaine:aspmx.l.google.com",
    "relation": "MAIL HANDLED BY",
    "source": "DNS answer for acme.io",
    "sources": [
     "DNS answer for acme.io"
    ],
    "confiance": "HIGH",
    "score": 88,
    "conteste": false
   },
   {
    "de": "domaine:acme.io",
    "vers": "email:security@acme.io",
    "relation": "PUBLISHES CONTACT",
    "source": "https://acme.io/.well-known/security.txt",
    "sources": [
     "https://acme.io/.well-known/security.txt"
    ],
    "confiance": "HIGH",
    "score": 88,
    "conteste": false
   },
   {
    "de": "domaine:acme.io",
    "vers": "email:presse@acme.io",
    "relation": "PUBLISHES CONTACT",
    "source": "https://acme.io/mentions-legales",
    "sources": [
     "https://acme.io/mentions-legales"
    ],
    "confiance": "HIGH",
    "score": 88,
    "conteste": false
   },
   {
    "de": "personne:Marc Lefevre",
    "vers": "domaine:acme.io",
    "relation": "DOMAIN OWNER",
    "source": "https://acme.io/mentions-legales",
    "sources": [
     "https://acme.io/mentions-legales"
    ],
    "confiance": "HIGH",
    "score": 88,
    "conteste": false
   },
   {
    "de": "domaine:staging.acme.io",
    "vers": "domaine:aspmx.l.google.com",
    "relation": "MAIL HANDLED BY",
    "source": "DNS answer for staging.acme.io",
    "sources": [
     "DNS answer for staging.acme.io"
    ],
    "confiance": "HIGH",
    "score": 88,
    "conteste": false
   },
   {
    "de": "domaine:aspmx.l.google.com",
    "vers": "domaine:aspmx.l.google.com",
    "relation": "MAIL HANDLED BY",
    "source": "DNS answer for aspmx.l.google.com",
    "sources": [
     "DNS answer for aspmx.l.google.com"
    ],
    "confiance": "HIGH",
    "score": 88,
    "conteste": false
   },
   {
    "de": "ip:8.8.8.8",
    "vers": "reseau:GOGL",
    "relation": "ANNOUNCED IN",
    "source": "https://rdap.org/ip/8.8.8.8",
    "sources": [
     "https://rdap.org/ip/8.8.8.8"
    ],
    "confiance": "HIGH",
    "score": 80,
    "conteste": false
   },
   {
    "de": "personne:Marc Lefevre",
    "vers": "email:presse@acme.io",
    "relation": "PROFESSIONAL EMAIL",
    "source": "https://acme.io/mentions-legales",
    "sources": [
     "https://acme.io/mentions-legales"
    ],
    "confiance": "MEDIUM",
    "score": 63,
    "conteste": false
   },
   {
    "de": "domaine:acme.io",
    "vers": "email:contact@acme.io",
    "relation": "PUBLISHES CONTACT",
    "source": "https://acme.io/contact",
    "sources": [
     "https://acme.io/contact"
    ],
    "confiance": "MEDIUM",
    "score": 63,
    "conteste": false
   },
   {
    "de": "domaine:acme.io",
    "vers": "email:jane.doe@acme.io",
    "relation": "PUBLISHES CONTACT",
    "source": "https://acme.io/contact",
    "sources": [
     "https://acme.io/contact"
    ],
    "confiance": "MEDIUM",
    "score": 63,
    "conteste": false
   },
   {
    "de": "personne:Jane Doe",
    "vers": "domaine:acme.io",
    "relation": "PUBLICLY ASSOCIATED WITH DOMAIN",
    "source": "https://acme.io/contact",
    "sources": [
     "https://acme.io/contact"
    ],
    "confiance": "MEDIUM",
    "score": 63,
    "conteste": false
   },
   {
    "de": "personne:Jane Doe",
    "vers": "email:jane.doe@acme.io",
    "relation": "PROFESSIONAL EMAIL",
    "source": "https://acme.io/contact",
    "sources": [
     "https://acme.io/contact"
    ],
    "confiance": "MEDIUM",
    "score": 63,
    "conteste": false
   },
   {
    "de": "domaine:acme.io",
    "vers": "email:hello@acme.io",
    "relation": "PUBLISHES CONTACT",
    "source": "https://acme.io/",
    "sources": [
     "https://acme.io/"
    ],
    "confiance": "LOW",
    "score": 38,
    "conteste": false
   },
   {
    "de": "domaine:acme.io",
    "vers": "domaine:staging.acme.io",
    "relation": "CERTIFICATE ISSUED FOR",
    "source": "https://crt.sh/?q=%25.acme.io&output=json",
    "sources": [
     "https://crt.sh/?q=%25.acme.io&output=json"
    ],
    "confiance": "LOW",
    "score": 30,
    "conteste": false
   },
   {
    "de": "domaine:acme.io",
    "vers": "domaine:acme.io",
    "relation": "CERTIFICATE ISSUED FOR",
    "source": "https://crt.sh/?q=%25.acme.io&output=json",
    "sources": [
     "https://crt.sh/?q=%25.acme.io&output=json"
    ],
    "confiance": "LOW",
    "score": 30,
    "conteste": false
   }
  ],
  "filtres": [
   "infrastructure",
   "organization",
   "contacts",
   "chain"
  ]
 }
};
