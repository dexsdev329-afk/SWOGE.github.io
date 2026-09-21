'use strict';
/* ============================================================================
 * SWOGE RECON : LA PAGE MONTRE D OU VIENT CHAQUE LIGNE, ET CE QU ELLE REFUSE
 *
 * Le module serveur (`recon.js`, dans l autre depot) porte les gardes. La
 * page, elle, a deux devoirs et ils se mesurent ici :
 *
 *   1. NE JAMAIS MONTRER PLUS QUE CE QUE LE SERVEUR A ENVOYE. Pas de champ
 *      reconstitue a l affichage, pas d adresse recomposee, pas de
 *      « probablement ». Chaque fait garde son URL et son niveau.
 *   2. DIRE SES BORDS AVANT QU ON TAPE, pas apres la deception. Un outil qui
 *      n annonce que ce qu il trouve laisse croire qu il trouve tout.
 *
 * Et le point ou une page de ce genre derape en silence : une personne
 * dessinee comme une machine. Un nom dans un graphe d infrastructure doit se
 * voir comme une exception — forme differente, couleur differente, calque
 * qu on eteint d un clic. C est mesure, pas espere.
 *
 * Le releve d essai n est pas invente : il est la SORTIE REELLE de
 * `recon.js` contre un faux internet (voir `recon.test.js`, bloc 9). Si la
 * forme du releve change cote serveur sans que la page suive, les essais qui
 * lisent ces champs tombent ici.
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
            '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon',
            '.mp4': 'video/mp4' };

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

  /* Chaque appel a /recon est note : la page ne doit parler QU A cette route,
     et n envoyer que ce qu on a tape. */
  const APPELS = [];
  const ouvre = async (chemin, o) => {
    const page = await nav.newPage({ viewport: { width: 1200, height: 1000 } });
    await page.route(/vitrine\.json/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route(/\/recon\//, (r) => {
      APPELS.push(r.request().url());
      const rep = (o && o.reponse) || RELEVE;
      r.fulfill({ status: (o && o.code) || 200, contentType: 'application/json', body: JSON.stringify(rep) });
    });
    await page.goto('http://127.0.0.1:' + port + '/swoge_recon.html' + (chemin || ''), { waitUntil: 'domcontentloaded' });
    return page;
  };

  console.log('\n-- 1. la page dit ce qu elle fait, et ce qu elle ne fait pas --');
  {
    const html = fs.readFileSync(path.join(SITE, 'swoge_recon.html'), 'utf8');
    ok(/<title>[^<]*domain[^<]*<\/title>/i.test(html), 'le titre parle de domaine, pas d une personne');
    ok(/name="description"[^>]*cannot be searched by a person/i.test(html),
       'et la description le dit des les resultats de recherche');

    const page = await ouvre('');
    /* La garde est lue AVANT le premier essai : elle est dans la page au
       chargement, pas affichee apres un refus. */
    const garde = await page.textContent('.garde');
    ok(/cannot be searched/i.test(garde), 'la garde est posee avant qu on tape quoi que ce soit');
    ok(/name|e-mail|phone|handle/i.test(garde), 'et elle nomme ce qui n entre pas');

    /* UN seul champ, et il demande un domaine. Un deuxieme champ « nom » ou
       « email » serait la porte qu on a passe tout ce travail a fermer. */
    const champs = await page.$$eval('input, textarea, select',
      (e) => e.map((x) => (x.getAttribute('aria-label') || x.placeholder || x.name || x.type)));
    eq(champs.length, 1, 'la page n a QU UN champ de saisie');
    ok(/domain/i.test(champs[0]), 'et il demande un domaine [' + champs[0] + ']');
    await page.close();
  }

  console.log('\n-- 2. une adresse mail collee est renvoyee vers son domaine --');
  {
    const page = await ouvre('');
    APPELS.length = 0;
    await page.fill('#dom', 'jean.dupont@acme.io');
    await page.click('#go');
    await page.waitForTimeout(150);
    const s = await page.textContent('#state');
    ok(/e-mail/i.test(s) && /domain/i.test(s), 'la page explique, elle ne se contente pas de refuser [' + s.slice(0, 70) + ']');
    eq(APPELS.length, 0, 'et RIEN n est parti au serveur : l adresse ne quitte pas le navigateur');
    eq(await page.isHidden('#out'), true, 'aucun releve n est montre');
    await page.close();
  }

  console.log('\n-- 3. un releve complet se peint --');
  let page = null;
  {
    page = await ouvre('');
    APPELS.length = 0;
    await page.fill('#dom', 'acme.io');
    await page.click('#go');
    await page.waitForSelector('#out:not([hidden])');
    eq(APPELS.length, 1, 'un seul appel');
    ok(APPELS[0].endsWith('/recon/acme.io'), 'a /recon, avec ce qu on a tape et rien d autre');

    const org = await page.textContent('#orgBox');
    ok(org.includes('Acme'), 'l organisation est nommee');
    ok(org.includes('LOW'), 'avec son niveau');
    ok(/brand name, not a legal entity/i.test(org), 'et la raison de ce niveau, en clair');

    const infra = await page.textContent('#infraBox');
    ok(infra.includes('8.8.8.8'), 'l adresse IP');
    ok(infra.includes('Google LLC'), 'le reseau qui la porte');
    ok(infra.includes('aspmx.l.google.com'), 'les serveurs de courrier');
    ok(infra.includes('Registrar SAS'), 'le registraire');
    ok(infra.includes('2014-03-02'), 'la date de creation');

    /* Le point le plus facile a bacler : un titulaire masque affiche comme
       un vide se lit « pas cherche ». */
    ok(/redacted/i.test(infra), 'le titulaire masque est montre comme masque');
    ok(/Absence of a name is not a hidden name/i.test(infra), 'et la page dit ce que ce masque veut dire');

    const subs = await page.textContent('#subBox');
    ok(subs.includes('staging.acme.io') && subs.includes('vpn.acme.io'), 'les sous-domaines certifies');
    ok(subs.includes('SOURCE NOT VERIFIED'), 'marques NOT VERIFIED : un certificat n est pas une machine qui repond');
    ok(/does not mean a machine answers there today/i.test(subs), 'et la page explique la difference');
  }

  console.log('\n-- 4. chaque contact part avec sa source, son niveau, sa date --');
  {
    const lignes = await page.$$eval('#contactsBox tbody tr', (tr) => tr.map((x) => x.textContent));
    ok(lignes.length >= 5, 'les contacts publies sont listes [' + lignes.length + ']');
    ok(lignes.some((l) => l.includes('security@acme.io') && l.includes('HIGH')), 'le security.txt vaut HIGH');
    ok(lignes.some((l) => l.includes('hello@acme.io') && l.includes('LOW')), 'l accueil vaut LOW');
    ok(lignes.some((l) => l.includes('+33145678900') && /business phone/i.test(l)), 'le telephone est un telephone d entreprise');
    ok(lignes.some((l) => /named mailbox/i.test(l)), 'une adresse nominative se signale comme telle');
    ok(lignes.some((l) => /role mailbox/i.test(l)), 'une boite de role aussi');
    ok(!lignes.some((l) => l.includes('gmail')), 'aucune adresse chez un fournisseur grand public');

    const liens = await page.$$eval('#contactsBox a', (a) => a.map((x) => x.href));
    ok(liens.length >= 5, 'chaque ligne porte le lien de sa source [' + liens.length + ']');
    ok(liens.every((h) => h.startsWith('https://acme.io')), 'et ces liens pointent la ou le fait a ete lu');
    const badges = await page.$$eval('#contactsBox .tag.ok', (e) => e.length);
    ok(badges >= 5, 'et chacune porte SOURCE VERIFIED [' + badges + ']');
  }

  console.log('\n-- 5. une personne n est pas montree comme une machine --');
  {
    const fiches = await page.$$eval('#gensBox .qui', (e) => e.map((x) => x.textContent));
    eq(fiches.length, 2, 'les deux personnes nommees par le site ont une fiche');

    const marc = fiches.find((f) => f.includes('Marc Lefevre'));
    ok(marc.includes('Directeur de la publication'), 'sa fonction, telle qu ecrite sur la page');
    ok(marc.includes('DOMAIN OWNER'), 'et lui SEUL est dit proprietaire : les mentions legales le declarent');

    const jane = fiches.find((f) => f.includes('Jane Doe'));
    ok(jane.includes('PUBLICLY ASSOCIATED WITH DOMAIN'), 'Jane est associee au domaine');
    ok(!jane.includes('DOMAIN OWNER'), 'et JAMAIS presentee comme proprietaire');
    ok(jane.includes('MEDIUM'), 'son niveau est MEDIUM');
    ok(jane.includes('jane.doe@acme.io'), 'son adresse professionnelle, celle que le site a imprimee');
    /* Les comptes imprimes a cote de son nom. Chacun est un lien, chacun
       porte en infobulle ce qu il veut dire — et le compte social dit qu il
       ne devient pas le sien parce qu il est imprime la. */
    const cptes = await page.$$eval('#gensBox .qui',
      (e) => e.map((x) => ({ nom: x.querySelector('.nom').textContent,
        liens: [...x.querySelectorAll('a[target]')].map((a) => a.href),
        titres: [...x.querySelectorAll('a.tag')].map((a) => a.title) })));
    const cj = cptes.find((x) => x.nom === 'Jane Doe');
    ok(cj.liens.includes('https://www.linkedin.com/in/jane-doe'), 'son annuaire professionnel');
    ok(cj.liens.includes('https://x.com/janedoe'), 'et son compte X, publie a cote');
    ok(cj.titres.some((t) => /professional profile/i.test(t)), 'l un se dit profil professionnel');
    ok(cj.titres.some((t) => /does not make it this person/i.test(t)),
       'l autre dit qu etre imprime la n en fait pas le sien');
    const cm = cptes.find((x) => x.nom === 'Marc Lefevre');
    eq(cm.titres.length, 0, 'Marc n en a aucun : la page n en invente pas');

    /* L infobulle du lien porte la preuve — ou son absence. */
    const preuve = await page.$eval('#gensBox .tag.assoc', (e) => e.getAttribute('title'));
    ok(/does not establish ownership/i.test(preuve), 'et l etiquette dit qu elle n etablit pas la propriete');

    /* Le mot « owner » n apparait nulle part pour quelqu un qui ne l est pas.
       On ne compte pas les occurrences a l aveugle — il y en a trois, et
       toutes parlent de Marc : sa fiche, son noeud, son arete. On verifie
       QUI elles designent. */
    const porteurs = await page.$$eval('#gensBox .qui',
      (e) => e.filter((x) => x.textContent.includes('DOMAIN OWNER'))
              .map((x) => x.querySelector('.nom').textContent));
    eq(porteurs.join(','), 'Marc Lefevre', 'une seule fiche porte OWNER, et c est celle du directeur de publication');
    const aretesOwner = await page.$eval('#gr',
      (s) => [...s.querySelectorAll('line title')].filter((t) => t.textContent.includes('DOMAIN OWNER')).length);
    eq(aretesOwner, 1, 'et une seule arete du graphe le dit');
  }

  console.log('\n-- 6. le graphe : les gens sont dessines a part --');
  {
    const g = await page.$eval('#gr', (s) => ({
      rects: s.querySelectorAll('rect').length,
      cercles: s.querySelectorAll('circle').length,
      traits: s.querySelectorAll('line').length,
      titres: [...s.querySelectorAll('line title')].map((t) => t.textContent),
    }));
    ok(g.traits > 8, 'le graphe a de quoi etre lu [' + g.traits + ' traits]');
    eq(g.rects, 2, 'deux rectangles : les deux personnes, et elles seules');
    ok(g.cercles > 8, 'les machines sont des cercles [' + g.cercles + ']');
    /* Une source n est pas forcement une URL : « DNS A/AAAA record » en est
       une, et meilleure qu un lien — c est ce que le domaine repond au monde
       entier. Ce qui compte, c est qu aucune arete n en soit depourvue. */
    ok(g.titres.every((t) => /https?:\/\//.test(t) || /DNS [A-Z/]+ record/.test(t)),
       'CHAQUE trait porte la source qui le documente : une URL, ou l enregistrement DNS');
    ok(g.titres.some((t) => /DNS A\/AAAA record/.test(t)), 'dont les resolutions, qui n ont pas d URL');
    ok(g.titres.some((t) => /PUBLICLY ASSOCIATED WITH DOMAIN/.test(t)), 'et la relation exacte, pas une conclusion');

    /* Pas de bibliotheque tierce : une page qui explique d ou vient chaque
       octet ne va pas charger un moteur de graphe chez un inconnu. */
    const html = fs.readFileSync(path.join(SITE, 'swoge_recon.html'), 'utf8');
    const externes = (html.match(/<script[^>]+src=["']https?:\/\/(?!fonts\.)/gi) || []);
    eq(externes.length, 0, 'aucun script tiers n est charge pour dessiner quinze traits');
  }

  console.log('\n-- 7. eteindre un calque l eteint PARTOUT --');
  {
    /* Un bouton « masquer » qui ne masque qu une moitie est pire que pas de
       bouton : il donne le sentiment d avoir retire ce qui est encore la. */
    await page.click('.calque[data-c="contacts"]');
    await page.waitForTimeout(80);
    eq(await page.isHidden('#sGens'), true, 'les fiches de personnes disparaissent');
    eq(await page.isHidden('#sContacts'), true, 'les contacts aussi');
    const rects = await page.$eval('#gr', (s) => s.querySelectorAll('rect').length);
    eq(rects, 0, 'et AUCUNE personne ne reste dans le graphe');
    const restants = await page.$eval('#gr', (s) => s.querySelectorAll('circle').length);
    ok(restants > 4, 'les machines, elles, restent [' + restants + ']');

    await page.click('.calque[data-c="contacts"]');
    await page.waitForTimeout(80);
    eq(await page.isHidden('#sGens'), false, 'rallumer les remet');
    eq(await page.$eval('#gr', (s) => s.querySelectorAll('rect').length), 2, 'dans le graphe aussi');
    eq(APPELS.length, 1, 'et rien n a ete redemande au serveur : le releve etait deja la');
  }

  console.log('\n-- 8. les sources et les bords sont montres avec le reste --');
  {
    const src = await page.textContent('#sourcesBox');
    ok(src.includes('rdap.org') && src.includes('crt.sh') && src.includes('acme.io'),
       'les trois hotes interroges sont listes');
    ok(/the site refused us, and we did not try again/i.test(src),
       'la page qui nous a refuses le dit, et dit qu on n a pas insiste');
    ok(/disallowed by robots\.txt/i.test(src), 'et celle que robots.txt interdit dit pourquoi elle est absente');

    const bords = await page.$$eval('#bordsBox li', (e) => e.map((x) => x.textContent));
    ok(bords.length >= 6, 'les limites sont listees [' + bords.length + ']');
    ok(bords.some((b) => /never guessed|guessed/i.test(b)), 'aucune adresse devinee');
    ok(bords.some((b) => /leaked or private database/i.test(b)), 'aucune base fuitee');
    ok(bords.some((b) => /anti-bot/i.test(b)), 'aucun contournement');
    ok(bords.some((b) => /cannot look up someone/i.test(b)),
       'et aucun pistage par pseudo : on ne peut pas chercher les comptes de quelqu un');
    ok(!(await page.isHidden('#bordsBox')), 'et ce bloc n est pas replie : il fait partie du resultat');
    await page.close();
  }

  console.log('\n-- 9. un lien partage porte son domaine --');
  {
    const p = await ouvre('?d=acme.io');
    await p.waitForSelector('#out:not([hidden])');
    eq(await p.inputValue('#dom'), 'acme.io', 'le champ est rempli');
    ok((await p.textContent('#state')).includes('acme.io'), 'et le releve part tout seul');
    await p.close();
  }

  console.log('\n-- 10. un refus du serveur ne laisse pas un vieux releve a l ecran --');
  {
    const p = await ouvre('');
    await p.fill('#dom', 'acme.io');
    await p.click('#go');
    await p.waitForSelector('#out:not([hidden])');
    await p.unroute(/\/recon\//);
    await p.route(/\/recon\//, (r) => r.fulfill({ status: 429, contentType: 'application/json',
      body: JSON.stringify({ erreur: 'too many domain reports, wait a minute' }) }));
    await p.fill('#dom', 'autre.io');
    await p.click('#go');
    await p.waitForTimeout(200);
    eq(await p.isHidden('#out'), true, 'le releve precedent est retire — il ne parle pas du domaine demande');
    ok((await p.textContent('#state')).includes('too many'), 'et la raison est montree telle quelle');
    await p.close();
  }

  await nav.close();
  await new Promise((s) => srv.close(s));
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });

/* ---- LE RELEVE D ESSAI ----
 * Sortie reelle de `recon.js` contre le faux internet de `recon.test.js`
 * (bloc 9), recopiee telle quelle. Elle n est pas ecrite a la main : un
 * releve invente finirait par decrire une forme que le serveur n envoie
 * plus, et les essais passeraient sur une page cassee. */
const RELEVE = {
 "domaine": "acme.io",
 "date": "2026-09-21",
 "ms": 812,
 "joignable": true,
 "organisation": {
  "nom": "Acme — build things",
  "source": "https://acme.io/",
  "verifie": true,
  "confiance": "LOW",
  "pourquoi": "taken from the site’s own title, which is a brand name, not a legal entity",
  "vu": "2026-09-21"
 },
 "infra": {
  "dns": {
   "a": [
    "8.8.8.8"
   ],
   "aaaa": [],
   "mx": [
    {
     "hote": "aspmx.l.google.com",
     "prio": 1
    }
   ],
   "ns": [
    "ns1.registrar.net"
   ],
   "txt": [
    "v=spf1 include:_spf.google.com ~all"
   ],
   "spf": "v=spf1 include:_spf.google.com ~all",
   "dmarc": "v=DMARC1; p=reject",
   "hebergeurMail": "google.com"
  },
  "rdap": {
   "source": "https://rdap.org/domain/acme.io",
   "trouve": true,
   "registraire": "Registrar SAS",
   "cree": "2014-03-02",
   "expire": "2027-03-02",
   "modifie": null,
   "etats": [
    "client transfer prohibited"
   ],
   "serveursNoms": [],
   "titulaire": null,
   "titulaireMasque": true
  },
  "certs": {
   "source": "https://crt.sh/?q=%25.acme.io&output=json",
   "trouve": true,
   "sousDomaines": [
    "staging.acme.io",
    "vpn.acme.io",
    "www.acme.io"
   ],
   "total": 3,
   "emetteurs": [
    {
     "nom": "Let's Encrypt",
     "n": 2
    },
    {
     "nom": "DigiCert Inc",
     "n": 1
    }
   ]
  },
  "reseaux": [
   {
    "ip": "8.8.8.8",
    "trouve": true,
    "source": "https://rdap.org/ip/8.8.8.8",
    "reseau": "GOGL",
    "plage": "8.8.8.0 – 8.8.8.255",
    "pays": "US",
    "operateur": "Google LLC",
    "asn": null
   }
  ],
  "titulaireMasque": true
 },
 "securityTxt": {
  "source": "https://acme.io/.well-known/security.txt",
  "contacts": [
   "mailto:security@acme.io"
  ],
  "politique": null,
  "expire": "2027-01-01T00:00:00Z",
  "langues": null
 },
 "contacts": [
  {
   "type": "email",
   "valeur": "hello@acme.io",
   "nominatif": false,
   "source": "https://acme.io/",
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "LOW",
   "pourquoi": "found on the site, but not on a page meant for contact",
   "extrait": "Acme — build things hello@acme.io Tom Clark, Chief Executive Officer"
  },
  {
   "type": "email",
   "valeur": "security@acme.io",
   "nominatif": false,
   "source": "https://acme.io/.well-known/security.txt",
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "published in the domain’s security.txt (RFC 9116)",
   "extrait": "mailto:security@acme.io"
  },
  {
   "type": "email",
   "valeur": "presse@acme.io",
   "nominatif": false,
   "source": "https://acme.io/mentions-legales",
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "published on the organisation’s own legal notice",
   "extrait": "Directeur de la publication : Marc Lefevre presse@acme.io 01 45 67 89 00"
  },
  {
   "type": "phone",
   "valeur": "+33145678900",
   "nominatif": false,
   "source": "https://acme.io/mentions-legales",
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "published on the organisation’s own legal notice",
   "extrait": "tel: +33145678900"
  },
  {
   "type": "email",
   "valeur": "contact@acme.io",
   "nominatif": false,
   "source": "https://acme.io/contact",
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "published on the organisation’s own contact page",
   "extrait": "mailto: contact@acme.io"
  },
  {
   "type": "email",
   "valeur": "jane.doe@acme.io",
   "nominatif": true,
   "source": "https://acme.io/contact",
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "published on the organisation’s own contact page",
   "extrait": "nous ecrire Jane Doe, Chief Technology Officer — jane.doe@acme.io LinkedIn X ecrivez-nous sur […]"
  }
 ],
 "personnes": [
  {
   "prenom": "Marc",
   "nom": "Lefevre",
   "complet": "Marc Lefevre",
   "fonction": "Directeur de la publication",
   "mail": "presse@acme.io",
   "profils": [],
   "extrait": "Directeur de la publication : Marc Lefevre presse@acme.io 01 45 67 89 00",
   "source": "https://acme.io/mentions-legales",
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "HIGH",
   "pourquoi": "published on the organisation’s own legal notice",
   "lien": "DOMAIN OWNER",
   "preuve": "named as publisher on the legal notice of this domain"
  },
  {
   "prenom": "Jane",
   "nom": "Doe",
   "complet": "Jane Doe",
   "fonction": "Chief Technology Officer",
   "mail": "jane.doe@acme.io",
   "profils": [
    {
     "url": "https://www.linkedin.com/in/jane-doe",
     "genre": "pro"
    },
    {
     "url": "https://x.com/janedoe",
     "genre": "social"
    }
   ],
   "extrait": "nous ecrire Jane Doe, Chief Technology Officer — jane.doe@acme.io LinkedIn X ecrivez-nous sur […]",
   "source": "https://acme.io/contact",
   "vu": "2026-09-21",
   "verifie": true,
   "confiance": "MEDIUM",
   "pourquoi": "name, role and address printed together in the same block",
   "lien": "PUBLICLY ASSOCIATED WITH DOMAIN",
   "preuve": "the organisation published this person on one of its own pages; this does not establish ownership"
  }
 ],
 "pages": [
  {
   "chemin": "/",
   "role": "autre",
   "code": 200,
   "octets": 95
  },
  {
   "chemin": "/.well-known/security.txt",
   "role": "securite",
   "code": 200,
   "octets": 63
  },
  {
   "chemin": "/mentions-legales",
   "role": "legal",
   "code": 200,
   "octets": 115
  },
  {
   "chemin": "/contact",
   "role": "contact",
   "code": 200,
   "octets": 250
  },
  {
   "chemin": "/about",
   "role": "equipe",
   "code": 404,
   "refus": false,
   "erreur": null
  },
  {
   "chemin": "/about-us",
   "role": "equipe",
   "code": 404,
   "refus": false,
   "erreur": null
  },
  {
   "chemin": "/a-propos",
   "role": "equipe",
   "saute": "disallowed by robots.txt"
  },
  {
   "chemin": "/team",
   "role": "equipe",
   "code": 403,
   "refus": true,
   "erreur": null
  },
  {
   "chemin": "/equipe",
   "role": "equipe",
   "code": 404,
   "refus": false,
   "erreur": null
  }
 ],
 "sources": [
  {
   "url": "https://rdap.org/domain/acme.io",
   "ok": true,
   "role": "rdap"
  },
  {
   "url": "https://crt.sh/?q=%25.acme.io&output=json",
   "ok": true,
   "role": "certs"
  },
  {
   "url": "https://acme.io/",
   "code": 200,
   "ok": true,
   "refus": false,
   "ms": 0,
   "role": "autre"
  },
  {
   "url": "https://acme.io/.well-known/security.txt",
   "code": 200,
   "ok": true,
   "refus": false,
   "ms": 0,
   "role": "securite"
  },
  {
   "url": "https://acme.io/mentions-legales",
   "code": 200,
   "ok": true,
   "refus": false,
   "ms": 0,
   "role": "legal"
  },
  {
   "url": "https://acme.io/contact",
   "code": 200,
   "ok": true,
   "refus": false,
   "ms": 0,
   "role": "contact"
  },
  {
   "url": "https://acme.io/about",
   "code": 404,
   "ok": false,
   "refus": false,
   "ms": 0,
   "role": "equipe"
  },
  {
   "url": "https://acme.io/about-us",
   "code": 404,
   "ok": false,
   "refus": false,
   "ms": 0,
   "role": "equipe"
  },
  {
   "url": "https://acme.io/team",
   "code": 403,
   "ok": false,
   "refus": true,
   "ms": 0,
   "role": "equipe"
  },
  {
   "url": "https://acme.io/equipe",
   "code": 404,
   "ok": false,
   "refus": false,
   "ms": 0,
   "role": "equipe"
  }
 ],
 "robots": {
  "lu": true,
  "interdits": [
   "/a-propos"
  ]
 },
 "limites": [
  "Entry point is a domain or an IP. This tool cannot be searched by a person’s name, e-mail, phone or handle.",
  "E-mail addresses are only read where the organisation printed them. None is ever guessed or built from a name.",
  "Consumer mailbox providers (gmail, outlook, proton…) are dropped at extraction: a personal address is never collected.",
  "Accounts are only read where the organisation printed them next to a person’s name. This tool cannot look up someone’s accounts from a name or a handle — there is no way to search it by a person.",
  "Sources are public by design: DNS, the domain registry (RDAP), certificate transparency logs, and the domain’s own pages.",
  "No leaked or private database is ever queried. No login, paywall or anti-bot protection is ever bypassed.",
  "robots.txt is obeyed, the crawler identifies itself, and a 401/403/429 is recorded as a refusal — never retried in disguise.",
  "A person is shown as PUBLICLY ASSOCIATED WITH DOMAIN unless a public act names them as owner."
 ],
 "graphe": {
  "noeuds": [
   {
    "id": "domain:acme.io",
    "type": "domaine",
    "nom": "acme.io",
    "filtre": "infrastructure",
    "humain": false
   },
   {
    "id": "ip:8.8.8.8",
    "type": "ip",
    "nom": "8.8.8.8",
    "filtre": "infrastructure",
    "humain": false
   },
   {
    "id": "net:GOGL",
    "type": "reseau",
    "nom": "GOGL",
    "filtre": "infrastructure",
    "humain": false,
    "pays": "US",
    "operateur": "Google LLC",
    "plage": "8.8.8.0 – 8.8.8.255"
   },
   {
    "id": "mx:aspmx.l.google.com",
    "type": "mx",
    "nom": "aspmx.l.google.com",
    "filtre": "infrastructure",
    "humain": false,
    "prio": 1
   },
   {
    "id": "sub:staging.acme.io",
    "type": "sousdomaine",
    "nom": "staging.acme.io",
    "filtre": "infrastructure",
    "humain": false,
    "verifie": false
   },
   {
    "id": "sub:vpn.acme.io",
    "type": "sousdomaine",
    "nom": "vpn.acme.io",
    "filtre": "infrastructure",
    "humain": false,
    "verifie": false
   },
   {
    "id": "sub:www.acme.io",
    "type": "sousdomaine",
    "nom": "www.acme.io",
    "filtre": "infrastructure",
    "humain": false,
    "verifie": false
   },
   {
    "id": "ca:Let's Encrypt",
    "type": "certificat",
    "nom": "Let's Encrypt",
    "filtre": "infrastructure",
    "humain": false,
    "n": 2
   },
   {
    "id": "ca:DigiCert Inc",
    "type": "certificat",
    "nom": "DigiCert Inc",
    "filtre": "infrastructure",
    "humain": false,
    "n": 1
   },
   {
    "id": "org:Acme — build things",
    "type": "organisation",
    "nom": "Acme — build things",
    "filtre": "organization",
    "humain": false,
    "confiance": "LOW",
    "source": "https://acme.io/"
   },
   {
    "id": "email:hello@acme.io",
    "type": "email",
    "nom": "hello@acme.io",
    "filtre": "contacts",
    "humain": false,
    "nominatif": false,
    "confiance": "LOW",
    "verifie": true,
    "source": "https://acme.io/"
   },
   {
    "id": "email:security@acme.io",
    "type": "email",
    "nom": "security@acme.io",
    "filtre": "contacts",
    "humain": false,
    "nominatif": false,
    "confiance": "HIGH",
    "verifie": true,
    "source": "https://acme.io/.well-known/security.txt"
   },
   {
    "id": "email:presse@acme.io",
    "type": "email",
    "nom": "presse@acme.io",
    "filtre": "contacts",
    "humain": false,
    "nominatif": false,
    "confiance": "HIGH",
    "verifie": true,
    "source": "https://acme.io/mentions-legales"
   },
   {
    "id": "phone:+33145678900",
    "type": "telephone",
    "nom": "+33145678900",
    "filtre": "contacts",
    "humain": false,
    "nominatif": false,
    "confiance": "HIGH",
    "verifie": true,
    "source": "https://acme.io/mentions-legales"
   },
   {
    "id": "email:contact@acme.io",
    "type": "email",
    "nom": "contact@acme.io",
    "filtre": "contacts",
    "humain": false,
    "nominatif": false,
    "confiance": "MEDIUM",
    "verifie": true,
    "source": "https://acme.io/contact"
   },
   {
    "id": "email:jane.doe@acme.io",
    "type": "email",
    "nom": "jane.doe@acme.io",
    "filtre": "contacts",
    "humain": false,
    "nominatif": true,
    "confiance": "MEDIUM",
    "verifie": true,
    "source": "https://acme.io/contact"
   },
   {
    "id": "person:Marc Lefevre",
    "type": "personne",
    "nom": "Marc Lefevre",
    "filtre": "contacts",
    "humain": true,
    "fonction": "Directeur de la publication",
    "profils": [],
    "confiance": "HIGH",
    "source": "https://acme.io/mentions-legales",
    "lien": "DOMAIN OWNER",
    "preuve": "named as publisher on the legal notice of this domain",
    "verifie": true
   },
   {
    "id": "person:Jane Doe",
    "type": "personne",
    "nom": "Jane Doe",
    "filtre": "contacts",
    "humain": true,
    "fonction": "Chief Technology Officer",
    "profils": [
     {
      "url": "https://www.linkedin.com/in/jane-doe",
      "genre": "pro"
     },
     {
      "url": "https://x.com/janedoe",
      "genre": "social"
     }
    ],
    "confiance": "MEDIUM",
    "source": "https://acme.io/contact",
    "lien": "PUBLICLY ASSOCIATED WITH DOMAIN",
    "preuve": "the organisation published this person on one of its own pages; this does not establish ownership",
    "verifie": true
   }
  ],
  "aretes": [
   {
    "de": "domain:acme.io",
    "vers": "ip:8.8.8.8",
    "relation": "RESOLVES TO",
    "source": "DNS A/AAAA record",
    "confiance": "HIGH"
   },
   {
    "de": "ip:8.8.8.8",
    "vers": "net:GOGL",
    "relation": "ANNOUNCED IN",
    "source": "https://rdap.org/ip/8.8.8.8",
    "confiance": "HIGH"
   },
   {
    "de": "domain:acme.io",
    "vers": "mx:aspmx.l.google.com",
    "relation": "MAIL HANDLED BY",
    "source": "DNS MX record",
    "confiance": "HIGH"
   },
   {
    "de": "domain:acme.io",
    "vers": "sub:staging.acme.io",
    "relation": "CERTIFICATE ISSUED FOR",
    "source": "https://crt.sh/?q=%25.acme.io&output=json",
    "confiance": "LOW"
   },
   {
    "de": "domain:acme.io",
    "vers": "sub:vpn.acme.io",
    "relation": "CERTIFICATE ISSUED FOR",
    "source": "https://crt.sh/?q=%25.acme.io&output=json",
    "confiance": "LOW"
   },
   {
    "de": "domain:acme.io",
    "vers": "sub:www.acme.io",
    "relation": "CERTIFICATE ISSUED FOR",
    "source": "https://crt.sh/?q=%25.acme.io&output=json",
    "confiance": "LOW"
   },
   {
    "de": "domain:acme.io",
    "vers": "ca:Let's Encrypt",
    "relation": "CERTIFIED BY",
    "source": "https://crt.sh/?q=%25.acme.io&output=json",
    "confiance": "HIGH"
   },
   {
    "de": "domain:acme.io",
    "vers": "ca:DigiCert Inc",
    "relation": "CERTIFIED BY",
    "source": "https://crt.sh/?q=%25.acme.io&output=json",
    "confiance": "HIGH"
   },
   {
    "de": "org:Acme — build things",
    "vers": "domain:acme.io",
    "relation": "PUBLICLY ASSOCIATED WITH DOMAIN",
    "source": "https://acme.io/",
    "confiance": "LOW"
   },
   {
    "de": "domain:acme.io",
    "vers": "email:hello@acme.io",
    "relation": "PUBLISHED ON THIS DOMAIN",
    "source": "https://acme.io/",
    "confiance": "LOW"
   },
   {
    "de": "domain:acme.io",
    "vers": "email:security@acme.io",
    "relation": "PUBLISHED ON THIS DOMAIN",
    "source": "https://acme.io/.well-known/security.txt",
    "confiance": "HIGH"
   },
   {
    "de": "domain:acme.io",
    "vers": "email:presse@acme.io",
    "relation": "PUBLISHED ON THIS DOMAIN",
    "source": "https://acme.io/mentions-legales",
    "confiance": "HIGH"
   },
   {
    "de": "domain:acme.io",
    "vers": "phone:+33145678900",
    "relation": "PUBLISHED ON THIS DOMAIN",
    "source": "https://acme.io/mentions-legales",
    "confiance": "HIGH"
   },
   {
    "de": "domain:acme.io",
    "vers": "email:contact@acme.io",
    "relation": "PUBLISHED ON THIS DOMAIN",
    "source": "https://acme.io/contact",
    "confiance": "MEDIUM"
   },
   {
    "de": "domain:acme.io",
    "vers": "email:jane.doe@acme.io",
    "relation": "PUBLISHED ON THIS DOMAIN",
    "source": "https://acme.io/contact",
    "confiance": "MEDIUM"
   },
   {
    "de": "person:Marc Lefevre",
    "vers": "domain:acme.io",
    "relation": "DOMAIN OWNER",
    "source": "https://acme.io/mentions-legales",
    "confiance": "HIGH"
   },
   {
    "de": "person:Marc Lefevre",
    "vers": "email:presse@acme.io",
    "relation": "PROFESSIONAL EMAIL",
    "source": "https://acme.io/mentions-legales",
    "confiance": "MEDIUM"
   },
   {
    "de": "person:Jane Doe",
    "vers": "domain:acme.io",
    "relation": "PUBLICLY ASSOCIATED WITH DOMAIN",
    "source": "https://acme.io/contact",
    "confiance": "MEDIUM"
   },
   {
    "de": "person:Jane Doe",
    "vers": "email:jane.doe@acme.io",
    "relation": "PROFESSIONAL EMAIL",
    "source": "https://acme.io/contact",
    "confiance": "MEDIUM"
   }
  ],
  "filtres": [
   "infrastructure",
   "organization",
   "contacts"
  ]
 }
};
