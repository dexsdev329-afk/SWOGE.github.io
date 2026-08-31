'use strict';
/*
 * LE MARQUEUR DE CACHE EST L'EMPREINTE DU FICHIER, PAS UNE DATE.
 *
 * ---- CE QUI EST ARRIVE ----
 *
 * Le proprietaire voyait la maison manga sur la place, et pas celle des
 * series. Les deux etaient dans le code, toutes deux commitees, et la page
 * les DESSINAIT toutes les deux — mesure faite, 360x283 a 1100,1557. Le
 * defaut n'etait pas dans le dessin, il etait dans la livraison :
 *
 *   9364efd  la maison manga arrive    marqueur 20260825a   bumpe
 *   a0b84a5  la maison series arrive   marqueur 20260825a   PAS bumpe
 *
 * La maison manga est partie avec un marqueur neuf, donc les navigateurs ont
 * recharge le script. Celle des series est partie sous un marqueur qu'ils
 * avaient deja en cache : ils n'ont jamais redemande le fichier. Le travail
 * etait fait, pousse, correct — et invisible.
 *
 * La meme omission s'est reproduite deux fois de suite ensuite, emportant le
 * portail +18 et une correction de collision. Trois fois le meme oubli, ce
 * n'est plus un oubli : c'est une regle qui n'a pas de gardien.
 *
 * ---- CE QUE CET ESSAI IMPOSE ----
 *
 * Un marqueur ecrit a la main peut toujours etre oublie. Un marqueur DERIVE
 * du contenu ne le peut pas : si le fichier change, son empreinte change, et
 * cet essai tombe tant que la page ne porte pas la nouvelle. Il ne se
 * contente pas de dire « tu as oublie » — il donne la valeur a ecrire.
 *
 * Aucun nom de fichier n'est inscrit ici : on releve les couples
 * (script, marqueur) dans les pages elles-memes. Un sixieme script versionne
 * sera couvert le jour ou il apparait, sans qu'on y pense.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok   ' + m); };

const SITE = __dirname;
const empreinte = (f) =>
  crypto.createHash('md5').update(fs.readFileSync(path.join(SITE, f))).digest('hex').slice(0, 8);

/* ---- ET L'EMPREINTE D'UNE PAGE QUI SE VERSIONNE ELLE-MEME ----
 * Une page dont TOUT le code est ecrit dedans ne porte aucun `script.js?v=`,
 * donc rien ne la protege du cache. Elle porte alors sa propre empreinte.
 * Celle-ci ne peut pas dependre d'elle-meme : on la calcule sur le fichier
 * dont le marqueur a ete remis a blanc. */
const NEUTRE = "var MARQUE_PAGE = '________';";
const RE_PAGE = /var MARQUE_PAGE = '([0-9a-f]{8})';/;
/* ---- ET LE MARQUEUR D'UN MEDIA ----
 * Un film ou une affiche a sa PROPRE adresse : la page peut se remplacer
 * toute seule, un navigateur qui a deja telecharge le fichier ne le redemande
 * pas, et une correction d'image reste invisible. Arrive deux fois ici. Le
 * marqueur est l'empreinte des fichiers CONCATENES, dans l'ordre ou la page
 * les nomme — il change des que l'un d'eux change. */
const RE_FILM = /var MARQUE_FILM = '([0-9a-f]{8})';/;
const FILMS = ['media/wallet_intro.webm', 'media/wallet_intro.mp4',
               'img/wallet/wallet_intro_poster.webp'];
const empreinteFilms = () => {
  const h = crypto.createHash('md5');
  for (const f of FILMS) h.update(fs.readFileSync(path.join(SITE, f)));
  return h.digest('hex').slice(0, 8);
};
const empreintePage = (f) => {
  const src = fs.readFileSync(path.join(SITE, f), 'utf8');
  return crypto.createHash('md5')
               .update(src.replace(RE_PAGE, NEUTRE), 'utf8').digest('hex').slice(0, 8);
};

/* Les couples releves dans les pages, jamais recopies ici. */
const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
const trouves = [];
const autoversionnees = [];
for (const p of pages) {
  const src = fs.readFileSync(path.join(SITE, p), 'utf8');
  for (const m of src.matchAll(/([A-Za-z0-9_]+\.js)\?v=([0-9a-z]+)/g)) {
    trouves.push({ page: p, script: m[1], marque: m[2] });
  }
  const mp = RE_PAGE.exec(src);
  if (mp) autoversionnees.push({ page: p, marque: mp[1] });
}

console.log('-- ce que les pages declarent --');
ok(pages.length > 5, `${pages.length} pages relues`);
/* Sans ce seuil, « tous les marqueurs sont bons » serait vrai d'un site qui
   n'en aurait plus un seul — et l'essai feliciterait le vide le jour ou la
   relecture ci-dessus cesse de trouver quoi que ce soit. */
ok(trouves.length >= 20, `${trouves.length} marqueurs de cache trouves`);
const scripts = [...new Set(trouves.map((t) => t.script))].sort();
ok(scripts.length >= 2, `sur ${scripts.length} scripts : ${scripts.join(', ')}`);

console.log('\n-- chaque marqueur est l empreinte de son fichier --');
for (const s of scripts) {
  const f = path.join(SITE, s);
  if (!fs.existsSync(f)) { ok(false, `${s} : le fichier versionne n'existe pas`); continue; }
  const attendu = empreinte(s);
  const portes = trouves.filter((t) => t.script === s);
  const mauvais = portes.filter((t) => t.marque !== attendu);
  ok(mauvais.length === 0,
     mauvais.length === 0
       ? `${s} : ${portes.length} page(s) portent ${attendu}`
       : `${s} : ${mauvais.length} page(s) portent un marqueur perime — ` +
         `ecrire ${attendu} dans ${[...new Set(mauvais.map((t) => t.page))].join(', ')}`);
}

console.log('\n-- une page qui se versionne elle-meme porte SON empreinte --');
ok(autoversionnees.length > 0,
   `${autoversionnees.length} page(s) portent leur propre empreinte : `
   + autoversionnees.map((a) => a.page).join(', '));
for (const a of autoversionnees) {
  const attendu = empreintePage(a.page);
  ok(a.marque === attendu,
     a.marque === attendu
       ? `${a.page} : ${attendu}`
       : `${a.page} : marqueur perime — ecrire ${attendu} (au lieu de ${a.marque}),`
         + ' dans la page ET dans version.json');
}

console.log('\n-- et le film porte l empreinte de ses fichiers --');
{
  const src = fs.readFileSync(path.join(SITE, 'swoge_wallet.html'), 'utf8');
  const m = RE_FILM.exec(src);
  ok(!!m, 'le portefeuille porte un marqueur de film');
  if (m) {
    const attendu = empreinteFilms();
    ok(m[1] === attendu,
       m[1] === attendu
         ? `le film et son affiche portent ${attendu}`
         : `marqueur du film perime — ecrire ${attendu} (au lieu de ${m[1]})`);
    /* Un marqueur qui ne sert a rien ne protege rien : on verifie qu'il est
       bien COLLE aux adresses, et pas seulement declare. */
    ok(/wallet_intro\.(webm|mp4)'\s*\)\s*\+\s*'\?v='\s*\+\s*MARQUE_FILM/.test(src)
       || /\?v=' \+ MARQUE_FILM/.test(src),
       'et il est bien accroche a l adresse du film, pas seulement declare');
  }
}

console.log('\n-- et le meme script porte la meme marque partout --');
for (const s of scripts) {
  const vues = new Set(trouves.filter((t) => t.script === s).map((t) => t.marque));
  ok(vues.size === 1,
     `${s} : une seule marque en circulation${vues.size === 1 ? '' : ' — ' + [...vues].join(' / ')}`);
}

/* ---- ET LE MAILLON QUI MANQUAIT : LA PAGE ELLE-MEME ----
 *
 * Tout ce qui precede repose sur la PAGE : c'est elle qui porte le marqueur et
 * qui demande donc le bon script. Mais la page, elle, n'est versionnee par
 * rien. Une page gardee en cache porte l'ancien marqueur et redemande
 * l'ancien script : la chaine est neuve sauf son premier maillon.
 * Vu en vrai. Le correctif etait pousse, servi, verifie octet par octet sur le
 * domaine — et un joueur voyait toujours l'ancien jeu, dans le navigateur
 * integre d'une messagerie, qui garde une page bien plus longtemps qu'un
 * navigateur ordinaire.
 * `version.json` porte les empreintes du jour ; la page les redemande au
 * chargement et se recharge une fois si les siennes different. Ce fichier ne
 * doit donc JAMAIS etre perime — sinon il reproduit exactement le defaut qu'il
 * corrige, en silence et avec l'air d'y remedier. */
console.log('\n-- et le fichier des empreintes du jour --');
const FV = path.join(SITE, 'version.json');
if (!fs.existsSync(FV)) {
  ok(false, "version.json est absent : la page ne peut plus savoir qu'elle est perimee");
} else {
  let manifeste = null;
  try { manifeste = JSON.parse(fs.readFileSync(FV, 'utf8')); } catch (e) { manifeste = null; }
  ok(!!manifeste, 'version.json se lit');
  if (manifeste) {
    const attendu = {};
    for (const s of scripts) if (fs.existsSync(path.join(SITE, s))) attendu[s] = empreinte(s);
    /* Une page qui se versionne elle-meme n'est pas une entree orpheline :
       c'est elle que le manifeste sert a perimer. */
    for (const a of autoversionnees) attendu[a.page] = empreintePage(a.page);
    const faux = Object.keys(attendu).filter((s) => manifeste[s] !== attendu[s]);
    ok(faux.length === 0,
       faux.length === 0
         ? `version.json porte les ${Object.keys(attendu).length} empreintes a jour`
         : 'version.json est perime — ecrire ' +
           faux.map((s) => `${s}: ${attendu[s]}`).join(', '));
    /* Une entree pour un script qui n'existe plus ne casse rien, mais elle
       ment sur ce que le site charge, et c'est de ce genre de mensonge que
       viennent les heures perdues. */
    const orphelins = Object.keys(manifeste).filter((s) => !(s in attendu));
    ok(orphelins.length === 0,
       `aucune entree orpheline${orphelins.length ? ' — ' + orphelins.join(', ') : ''}`);
  }
}

/* Le mecanisme ne vaut que s'il est DANS la page : ecrit dans un fichier a
   part, il serait lui-meme sujet au cache qu'il essaie de contourner. On
   verifie donc qu'une page au moins le porte en clair, et laquelle. */
const porteuses = pages.filter((p) =>
  /fetch\('version\.json'/.test(fs.readFileSync(path.join(SITE, p), 'utf8')));
ok(porteuses.length > 0,
   `la verification est ecrite en clair dans ${porteuses.length} page(s) : ${porteuses.join(', ')}`);

console.log(`\ncache_marqueur.test.js : ${n} verifications OK`);
