/*
 * Verification du moteur d'arcade.
 *
 * ---- la regle qui a decide de la forme de ce fichier ----
 *
 * AUCUN nombre du jeu n'est recopie ici. Pas un seul. Les degats du poing se
 * demandent a `Arcade.COUPS.poing.degats`, la portee du pied a la table, la
 * hauteur d'une garde basse a `Arcade.CORPS`. Un essai qui ecrirait « le poing
 * enleve 3 » aurait deux effets, tous les deux mauvais : il tomberait a chaque
 * reglage d'equilibrage — donc on le corrigerait sans le lire — et il ne
 * verifierait rien d'autre que sa propre copie. Ce qu'on veut savoir, c'est
 * que le moteur applique CE QU'IL ANNONCE, quoi qu'il annonce.
 *
 * Les seuls nombres ecrits ici sont ceux de l'enonce du jeu, pas ceux du
 * reglage : « une manche dure entre 20 et 45 secondes », « il faut gagner deux
 * manches ». Ce sont des exigences, pas des valeurs derivees.
 *
 * ---- l'autre regle : isoler ----
 *
 * Un essai qui lance un combat complet et regarde ce qui en sort mesure du
 * bruit. Chaque cas ci-dessous PLACE les deux combattants, met l'autre hors de
 * portee quand il ne doit pas intervenir, vide les projectiles, et ne fait
 * durer les choses que le temps de la fenetre qu'il observe. Les positions et
 * les points de vie sont poses a la main dans l'etat : c'est le seul moyen
 * d'observer une regle a la fois, et l'etat est justement fait pour etre lu et
 * ecrit par ce qui pilote le moteur.
 */
'use strict';
const assert = require('assert');
const A = require('./arcade.js');

const DT = 1 / 60;                 // la trame du dessin
let cas = 0, rates = 0;

function test(nom, fn) {
  cas++;
  try { fn(); console.log('OK   ' + nom); }
  catch (e) { rates++; console.log('RATE ' + nom + ' : ' + (e && e.message)); }
}

// ------------------------------------------------------------- outillage

/* Un combat pret a se battre : l'annonce « ROUND 1 » est passee. */
function neuf(graine) {
  const c = new A.Combat({ graine: graine === undefined ? 1 : graine, skins: ['andy', 'pepe'] });
  passeGel(c);
  return c;
}
function passeGel(c) {
  let n = 0;
  while (c.etat.gel > 0 && n++ < 5000) c.pas(DT);
}
/* Poser les deux combattants a un ecart choisi, de part et d'autre du milieu. */
function duo(c, ecart) {
  const f = c.etat.combattants;
  f[0].x = A.CENTRE - ecart / 2; f[0].face = 1;
  f[1].x = A.CENTRE + ecart / 2; f[1].face = -1;
}
/* Chacun contre son mur : personne ne peut toucher personne. */
function loin(c) {
  const f = c.etat.combattants;
  f[0].x = A.ARENE.murG; f[1].x = A.ARENE.murD;
}
/* Avance de n trames avec des touches tenues, et rend tous les evenements. */
function joue(c, n, e0, e1) {
  let evs = [];
  for (let i = 0; i < n; i++) {
    c.entree(0, e0 || {});
    c.entree(1, e1 || {});
    evs = evs.concat(c.pas(DT));
  }
  return evs;
}
/* Marteler, c'est relacher entre deux appuis : le moteur ne voit que les
   fronts montants, une touche tenue ne part qu'une fois. */
function martele(c, n, touche, cote, base) {
  let evs = [];
  for (let i = 0; i < n; i++) {
    const e = {};
    if (base) for (const k in base) e[k] = base[k];
    e[touche] = (i % 2 === 0);
    c.entree(cote || 0, e);
    c.entree(1 - (cote || 0), {});
    evs = evs.concat(c.pas(DT));
  }
  return evs;
}
/* Ce que le dessin verrait : les champs du contrat, et rien d'autre. */
function photo(c) {
  return JSON.stringify(c.etat.combattants.map((f) => [f.x, f.y, f.face, f.pv, f.jauge, f.anim, f.t, f.bloque]));
}
/* Le code sans ses commentaires : sinon la phrase qui EXPLIQUE qu'on n'appelle
   pas Math.random ferait tomber le cas qui verifie qu'on ne l'appelle pas. */
function sansCommentaires(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function touches(evs) { return evs.filter((e) => e.type === 'touche'); }
function du(evs, type) { return evs.filter((e) => e.type === type); }

/* Faire toucher UN coup au sol, du cote 0 vers le cote 1, sans rien autour. */
function unCoup(c, cle, defense) {
  duo(c, A.COUPS[cle].portee - 20);
  const bouton = (cle === 'pied') ? 'pied' : 'poing';
  const e0 = {}; e0[bouton] = true;
  const k = A.COUPS[cle];
  const trames = Math.ceil((k.depart + k.actif + 0.2) / DT) + 8;
  return touches(joue(c, trames, e0, defense || {}));
}

// =====================================================================
//                          LE CONTRAT D API
// =====================================================================

test('l arene expose larg, murG, murD, sol', () => {
  ['larg', 'murG', 'murD', 'sol'].forEach((k) => assert.strictEqual(typeof A.ARENE[k], 'number', 'champ ' + k));
  assert.ok(A.ARENE.murG < A.ARENE.murD, 'le mur gauche est a gauche');
  assert.ok(A.ARENE.murD <= A.ARENE.larg, 'les murs tiennent dans l arene');
});

test('la table des coups porte les quatre coups et tous leurs champs', () => {
  ['poing', 'pied', 'saute', 'special'].forEach((nom) => {
    const k = A.COUPS[nom];
    assert.ok(k, 'coup ' + nom);
    ['degats', 'depart', 'actif', 'fin', 'portee', 'haut', 'bas', 'recul', 'gel', 'super']
      .forEach((ch) => assert.strictEqual(typeof k[ch], 'number', nom + '.' + ch));
  });
  assert.ok(A.COUPS.special.cout > 0, 'le special a un cout');
});

test('MANCHES et DUREE sont ceux du jeu', () => {
  assert.strictEqual(A.MANCHES, 2, 'deux manches a gagner');
  assert.strictEqual(A.DUREE, 60, 'soixante secondes');
});

test('l etat porte tous les champs annonces', () => {
  const e = new A.Combat({ graine: 1 }).etat;
  ['temps', 'manche', 'scores', 'fini', 'vainqueur', 'message', 'gel', 'combattants', 'projectiles']
    .forEach((k) => assert.ok(k in e, 'champ ' + k));
  assert.strictEqual(e.temps, A.DUREE);
  assert.strictEqual(e.manche, 1);
  assert.deepStrictEqual(e.scores, [0, 0]);
  assert.strictEqual(e.fini, false);
  assert.strictEqual(e.vainqueur, null);
  assert.strictEqual(e.message, 'ROUND 1');
  assert.ok(e.gel > 0, 'l annonce fige le jeu');
  assert.strictEqual(e.projectiles.length, 0);
});

test('un combattant porte tous les champs annonces', () => {
  const f = new A.Combat({ graine: 1, skins: ['andy', 'pepe'] }).etat.combattants;
  assert.strictEqual(f.length, 2);
  f.forEach((c, i) => {
    assert.strictEqual(typeof c.skin, 'string');
    ['x', 'y', 'face', 'pv', 'pvMax', 'jauge', 't'].forEach((k) => assert.strictEqual(typeof c[k], 'number', 'champ ' + k));
    assert.strictEqual(typeof c.anim, 'string');
    assert.strictEqual(typeof c.bloque, 'boolean');
    assert.strictEqual(c.pv, c.pvMax);
    assert.strictEqual(c.y, A.ARENE.sol);
    assert.strictEqual(c.anim, 'idle');
    assert.strictEqual(c.t, 0);
    assert.strictEqual(c.face, i === 0 ? 1 : -1, 'chacun regarde l autre');
  });
  assert.strictEqual(f[0].skin, 'andy');
  assert.strictEqual(f[1].skin, 'pepe');
});

test('les combattants demarrent dans l arene et se font face', () => {
  const f = neuf().etat.combattants;
  assert.ok(f[0].x >= A.ARENE.murG && f[0].x <= A.ARENE.murD);
  assert.ok(f[1].x >= A.ARENE.murG && f[1].x <= A.ARENE.murD);
  assert.ok(f[1].x - f[0].x >= A.CORPS.larg, 'ils ne se chevauchent pas au depart');
});

test('pas() rend toujours un tableau', () => {
  const c = neuf();
  assert.ok(Array.isArray(c.pas(DT)));
  assert.ok(Array.isArray(c.pas(0)), 'meme avec un pas nul');
});

// =====================================================================
//                            LA PHYSIQUE
// =====================================================================

test('le saut monte puis retombe', () => {
  const c = neuf(); loin(c);
  joue(c, 1, { saut: true });
  const y1 = c.etat.combattants[0].y;
  assert.ok(y1 > A.ARENE.sol, 'on a quitte le sol');
  joue(c, 8, { saut: true });
  assert.ok(c.etat.combattants[0].y > y1, 'on monte encore');
  const haut = c.etat.combattants[0].y;
  joue(c, 40, { saut: true });
  assert.ok(c.etat.combattants[0].y < haut, 'la gravite ramene');
});

test('le retour au sol est exact', () => {
  const c = neuf(); loin(c);
  joue(c, 120, { saut: true });
  assert.strictEqual(c.etat.combattants[0].y, A.ARENE.sol, 'y revient exactement au sol');
});

test('on ne passe jamais sous le sol', () => {
  const c = neuf(); loin(c);
  for (let i = 0; i < 200; i++) {
    joue(c, 1, { saut: i % 40 === 0 });
    assert.ok(c.etat.combattants[0].y >= A.ARENE.sol, 'y negatif a la trame ' + i);
  }
});

test('le saut a une duree finie et prevue par la physique', () => {
  const c = neuf(); loin(c);
  const attendu = 2 * A.PHYS.saut / A.PHYS.gravite;      // temps de vol theorique
  let n = 0;
  joue(c, 1, { saut: true });
  while (c.etat.combattants[0].y > A.ARENE.sol && n < 600) { joue(c, 1, {}); n++; }
  const vol = (n + 1) * DT;
  assert.ok(Math.abs(vol - attendu) < 3 * DT, 'vol ' + vol.toFixed(3) + ' pour ' + attendu.toFixed(3));
});

test('le sommet du saut laisse le corps a portee des coups d en bas', () => {
  const c = neuf(); loin(c);
  const sommet = A.PHYS.saut * A.PHYS.saut / (2 * A.PHYS.gravite);
  assert.ok(sommet < A.CORPS.haut, 'sauter n est pas une planque');
});

test('le mur de gauche est infranchissable', () => {
  const c = neuf(); loin(c);
  joue(c, 600, { x: -1 });
  assert.ok(c.etat.combattants[0].x >= A.ARENE.murG, 'sorti a gauche');
  assert.strictEqual(c.etat.combattants[0].x, A.ARENE.murG, 'colle au mur');
});

test('le mur de droite est infranchissable', () => {
  const c = neuf(); loin(c);
  joue(c, 600, {}, { x: 1 });
  assert.strictEqual(c.etat.combattants[1].x, A.ARENE.murD, 'colle au mur');
});

test('un pas geant ne fait pas traverser un mur', () => {
  const c = neuf(); loin(c);
  const t0 = c.etat.temps;
  c.entree(0, { x: -1 }); c.pas(10);
  assert.ok(c.etat.combattants[0].x >= A.ARENE.murG, 'un pas de dix secondes a fait sortir de l arene');
  assert.ok(t0 - c.etat.temps <= A.PHYS.dtMax + 1e-9, 'le pas de temps n est pas borne');
});

test('les deux combattants ne se traversent pas', () => {
  const c = neuf();
  duo(c, 200);
  joue(c, 300, { x: 1 }, { x: -1 });
  const f = c.etat.combattants;
  assert.ok(f[1].x - f[0].x >= A.CORPS.larg - 1e-6, 'ecart ' + (f[1].x - f[0].x));
  assert.ok(f[0].x < f[1].x, 'le cote 0 est reste a gauche');
});

test('deux combattants ne se traversent pas non plus en sautant', () => {
  const c = neuf();
  duo(c, 120);
  for (let i = 0; i < 200; i++) {
    joue(c, 1, { x: 1, saut: i % 45 === 0 }, { x: -1 });
    const f = c.etat.combattants;
    assert.ok(f[1].x - f[0].x >= A.CORPS.larg - 1e-6, 'traverse a la trame ' + i);
  }
});

test('un combattant pousse dans un coin ne fait pas sortir l autre', () => {
  const c = neuf();
  const f = c.etat.combattants;
  f[0].x = A.ARENE.murG; f[1].x = A.ARENE.murG + 10;
  joue(c, 120, { x: 1 }, { x: -1 });
  assert.ok(f[0].x >= A.ARENE.murG, 'cote 0 sorti');
  assert.ok(f[1].x >= A.ARENE.murG, 'cote 1 sorti');
  assert.ok(Math.abs(f[1].x - f[0].x) >= A.CORPS.larg - 1e-6, 'ils se chevauchent dans le coin');
});

test('avancer va plus vite que reculer', () => {
  const c = neuf(); loin(c);
  const f = c.etat.combattants;
  f[0].x = A.CENTRE; f[1].x = A.ARENE.murD;
  const depart = f[0].x;
  joue(c, 30, { x: 1 });
  const avant = f[0].x - depart;
  f[0].x = A.CENTRE;
  joue(c, 30, { x: -1 });
  const arriere = depart - f[0].x;
  assert.ok(avant > arriere, 'avance ' + avant.toFixed(1) + ' recul ' + arriere.toFixed(1));
});

test('on ne peut pas avancer en gardant', () => {
  const c = neuf(); loin(c);
  const f = c.etat.combattants;
  f[0].x = A.CENTRE;
  joue(c, 60, { x: 1, garde: true });
  assert.strictEqual(f[0].x, A.CENTRE, 'la garde doit clouer sur place');
});

test('on ne se deplace pas accroupi', () => {
  const c = neuf(); loin(c);
  const f = c.etat.combattants;
  f[0].x = A.CENTRE;
  joue(c, 60, { x: 1, bas: true });
  assert.strictEqual(f[0].x, A.CENTRE, 's accroupir doit clouer sur place');
});

test('on se retourne vers l adversaire', () => {
  const c = neuf(); loin(c);
  const f = c.etat.combattants;
  f[0].face = -1;                              // il regarde le mur
  joue(c, 1, {}, {});
  assert.strictEqual(f[0].face, 1, 'un combattant libre doit se retourner vers l autre');
  f[1].face = 1;
  joue(c, 1, {}, {});
  assert.strictEqual(f[1].face, -1);
});

test('on ne se retourne pas au milieu d un coup', () => {
  const c = neuf(); loin(c);
  const f = c.etat.combattants;
  joue(c, 1, { pied: true }, {});
  assert.strictEqual(f[0].anim, 'pied');
  f[0].face = -1;
  joue(c, 3, { pied: true }, {});
  assert.strictEqual(f[0].face, -1, 'un coup qui change de sens en cours de route toucherait derriere lui');
});

test('la direction du saut est figee au decollage', () => {
  const c = neuf(); loin(c);
  const f = c.etat.combattants;
  f[0].x = A.CENTRE;
  joue(c, 1, { saut: true, x: 0 });
  const x0 = f[0].x;
  joue(c, 20, { x: 1 });                     // on pousse a droite EN L AIR
  assert.ok(f[0].y > A.ARENE.sol, 'toujours en l air');
  assert.strictEqual(f[0].x, x0, 'un saut ne se pilote pas en vol');
});

// =====================================================================
//                        LES COUPS ET LEURS DEGATS
// =====================================================================

['poing', 'pied'].forEach((cle) => {
  test('le ' + cle + ' enleve exactement ce que la table annonce', () => {
    const c = neuf();
    const t = unCoup(c, cle);
    assert.strictEqual(t.length, 1, 'une seule touche, vu ' + t.length);
    assert.strictEqual(t[0].coup, cle);
    assert.strictEqual(t[0].cible, 1);
    assert.strictEqual(t[0].bloque, false);
    assert.strictEqual(t[0].degats, A.COUPS[cle].degats);
    assert.strictEqual(c.etat.combattants[1].pv, A.PV_MAX - A.COUPS[cle].degats);
  });
});

test('le coup saute enleve ce que la table annonce', () => {
  const c = neuf();
  duo(c, A.COUPS.saute.portee - 40);
  joue(c, 1, { saut: true });
  const t = touches(joue(c, 30, { poing: true }));
  assert.strictEqual(t.length, 1, 'une seule touche, vu ' + t.length);
  assert.strictEqual(t[0].coup, 'saute');
  assert.strictEqual(t[0].degats, A.COUPS.saute.degats);
});

test('le special enleve ce que la table annonce', () => {
  const c = neuf();
  duo(c, 260);
  c.etat.combattants[0].jauge = A.COUPS.special.cout;
  const t = touches(joue(c, 120, { poing: true, pied: true }));
  assert.strictEqual(t.length, 1, 'une seule touche, vu ' + t.length);
  assert.strictEqual(t[0].coup, 'special');
  assert.strictEqual(t[0].degats, A.COUPS.special.degats);
});

test('le poing est rapide et faible, le pied lent et fort', () => {
  assert.ok(A.COUPS.poing.depart < A.COUPS.pied.depart, 'le poing sort plus vite');
  assert.ok(A.COUPS.poing.degats < A.COUPS.pied.degats, 'le poing fait moins mal');
  assert.ok(A.COUPS.poing.portee < A.COUPS.pied.portee, 'le pied porte plus loin');
  const totalPoing = A.COUPS.poing.depart + A.COUPS.poing.actif + A.COUPS.poing.fin;
  const totalPied = A.COUPS.pied.depart + A.COUPS.pied.actif + A.COUPS.pied.fin;
  assert.ok(totalPoing < totalPied, 'le poing se range plus vite');
});

test('le poing rend la main a l adversaire avant de la rendre a soi', () => {
  /* C'est LA regle anti-martelage, et elle est entierement dans la table :
     celui qui encaisse se libere apres `gel`, celui qui frappe apres
     `actif + fin`. Si le second etait plus court, marteler serait sans
     risque. */
  assert.ok(A.COUPS.poing.actif + A.COUPS.poing.fin > A.COUPS.poing.gel,
    'le poing rend la main trop vite a son lanceur');
  assert.ok(A.COUPS.pied.actif + A.COUPS.pied.fin < A.COUPS.pied.gel,
    'le pied ne recompense pas celui qui le place');
});

test('une attaque ne touche qu une fois par utilisation', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  /* La fenetre active du pied dure plusieurs trames et la cible reste dedans :
     sans le drapeau « deja touche », le coup enleverait ses degats a chaque
     trame de la fenetre. */
  const trames = Math.ceil(A.COUPS.pied.actif / DT);
  assert.ok(trames >= 2, 'la fenetre active doit couvrir plusieurs trames pour que ce cas prouve quelque chose');
  const t = touches(joue(c, 60, { pied: true }));
  assert.strictEqual(t.length, 1, 'le pied a touche ' + t.length + ' fois');
});

test('une touche maintenue ne relance pas le coup', () => {
  const c = neuf();
  duo(c, A.COUPS.poing.portee - 30);
  const t = touches(joue(c, 240, { poing: true }));
  assert.strictEqual(t.length, 1, 'une touche tenue quatre secondes a sorti ' + t.length + ' coups');
});

test('marteler la touche relance le coup', () => {
  const c = neuf();
  duo(c, A.CORPS.larg);
  /* En avancant : chaque coup qui passe ecarte la cible, donc marteler sur
     place ne porte qu'une fois — c'est le cas suivant qui le prouve. */
  const t = touches(martele(c, 240, 'poing', 0, { x: 1 }));
  assert.ok(t.length > 1, 'relacher et rappuyer doit relancer le coup');
});

test('marteler sans avancer finit par ne plus porter', () => {
  const c = neuf();
  duo(c, A.CORPS.larg);
  const t = touches(martele(c, 240, 'poing'));
  assert.ok(t.length >= 1, 'le premier coup doit passer');
  assert.ok(t.length <= 3, 'quatre secondes de martelage immobile ont place ' + t.length + ' coups');
  assert.ok(Math.abs(c.etat.combattants[1].x - c.etat.combattants[0].x) > A.COUPS.poing.portee,
    'le recul doit avoir sorti la cible de portee');
});

test('un coup ne touche pas hors de portee', () => {
  const c = neuf();
  duo(c, A.COUPS.poing.portee + 20);
  const t = touches(joue(c, 60, { poing: true }));
  assert.strictEqual(t.length, 0, 'le poing a touche au-dela de sa portee');
});

test('un coup ne touche pas au-dessus de sa tranche', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  const f = c.etat.combattants;
  const altitude = A.COUPS.pied.haut + 10;
  assert.ok(altitude < A.PHYS.saut * A.PHYS.saut / (2 * A.PHYS.gravite),
    'un saut doit pouvoir monter jusque la, sinon la regle ne sert a rien dans le jeu');
  /* On maintient la cible en l air : ce cas mesure la hauteur du coup, pas la
     chute de la cible. */
  let evs = [];
  for (let i = 0; i < 40; i++) { f[1].y = altitude; evs = evs.concat(joue(c, 1, { pied: true }, {})); }
  assert.strictEqual(touches(evs).length, 0, 'le pied a touche au-dessus de sa tranche');
});

test('le pied atteint une distance ou le poing ne va pas', () => {
  const ecart = (A.COUPS.poing.portee + A.COUPS.pied.portee) / 2;
  const a = neuf(); duo(a, ecart);
  assert.strictEqual(touches(joue(a, 60, { poing: true })).length, 0, 'le poing ne devrait pas porter si loin');
  const b = neuf(); duo(b, ecart);
  assert.strictEqual(touches(joue(b, 60, { pied: true })).length, 1, 'le pied devrait porter');
});

test('un coup ne touche pas dans le dos', () => {
  const c = neuf();
  const f = c.etat.combattants;
  duo(c, A.COUPS.pied.portee - 20);
  /* On force le cote 0 a regarder le mur. Il ne se retournera pas : il est
     occupe a frapper des la premiere trame. */
  c.entree(0, { pied: true }); c.entree(1, {});
  c.pas(DT);
  f[0].face = -1;
  const t = touches(joue(c, 40, { pied: true }));
  assert.strictEqual(t.length, 0, 'le pied a touche derriere lui');
});

test('l evenement touche dit qui, combien et avec quoi', () => {
  const c = neuf();
  const t = unCoup(c, 'pied');
  assert.deepStrictEqual(Object.keys(t[0]).sort(), ['bloque', 'cible', 'coup', 'degats', 'type']);
  assert.strictEqual(t[0].type, 'touche');
});

test('on ne frappe pas un corps deja a terre', () => {
  const c = neuf();
  duo(c, A.COUPS.poing.portee - 20);
  /* Le poing est lance, puis la cible tombe AVANT que le coup ne pique : le
     verdict, lui, n est rendu qu a la fin de la trame. C est exactement la
     situation ou un projectile en vol arriverait sur un corps que le corps a
     corps vient de mettre a zero. */
  const avant = Math.round(A.COUPS.poing.depart / DT) - 1;
  assert.ok(avant >= 1, 'la sortie du poing doit couvrir plusieurs trames');
  joue(c, avant, { poing: true }, {});
  assert.strictEqual(c.etat.combattants[0].anim, 'poing', 'le poing doit etre en route');
  c.etat.combattants[1].pv = 0;
  const evs = joue(c, 1, { poing: true }, {});
  assert.strictEqual(touches(evs).length, 0, 'on a frappe un corps a terre');
  assert.strictEqual(du(evs, 'ko').length, 1, 'et le K.O. devait etre prononce dans cette trame');
});

test('les points de vie ne descendent pas sous zero', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  c.etat.combattants[1].pv = 1;
  martele(c, 60, 'pied');
  assert.strictEqual(c.etat.combattants[1].pv, 0);
});

test('un coup pousse la cible en arriere', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  const x0 = c.etat.combattants[1].x;
  joue(c, 60, { pied: true });
  assert.ok(c.etat.combattants[1].x > x0 + A.COUPS.pied.recul / 2,
    'recul de ' + (c.etat.combattants[1].x - x0).toFixed(1) + ' pour ' + A.COUPS.pied.recul + ' annonce');
});

test('le recul ne fait pas sortir de l arene', () => {
  const c = neuf();
  const f = c.etat.combattants;
  f[1].x = A.ARENE.murD; f[0].x = A.ARENE.murD - (A.COUPS.pied.portee - 20);
  joue(c, 120, { pied: true });
  assert.ok(f[1].x <= A.ARENE.murD, 'pousse hors de l arene');
});

// =====================================================================
//                              LA GARDE
// =====================================================================

test('la garde reduit les degats du pied', () => {
  const nu = neuf(), gd = neuf();
  const sansGarde = unCoup(nu, 'pied')[0].degats;
  const t = unCoup(gd, 'pied', { garde: true });
  assert.strictEqual(t.length, 1, 'le coup doit toucher la garde');
  assert.strictEqual(t[0].bloque, true, 'il devait etre bloque');
  assert.ok(t[0].degats < sansGarde, 'bloque ' + t[0].degats + ' contre ' + sansGarde + ' a nu');
  assert.strictEqual(t[0].degats, Math.round(A.COUPS.pied.degats * A.GARDE.reduit), 'la part qui passe');
  assert.strictEqual(gd.etat.combattants[1].pv, A.PV_MAX - t[0].degats);
});

test('la garde annule presque tout : le poing bloque ne passe rien', () => {
  const c = neuf();
  const t = unCoup(c, 'poing', { garde: true });
  assert.strictEqual(t[0].bloque, true);
  assert.strictEqual(t[0].degats, Math.round(A.COUPS.poing.degats * A.GARDE.reduit));
  assert.ok(t[0].degats < A.COUPS.poing.degats, 'la garde doit reduire');
});

test('la garde reduit aussi le recul', () => {
  const nu = neuf(), gd = neuf();
  duo(nu, A.COUPS.pied.portee - 20); duo(gd, A.COUPS.pied.portee - 20);
  const x0 = nu.etat.combattants[1].x;
  joue(nu, 60, { pied: true }, {});
  joue(gd, 60, { pied: true }, { garde: true });
  const nuRecul = nu.etat.combattants[1].x - x0;
  const gdRecul = gd.etat.combattants[1].x - x0;
  assert.ok(gdRecul > 0, 'la garde ne colle pas au sol');
  assert.ok(gdRecul < nuRecul, 'bloque ' + gdRecul.toFixed(1) + ' a nu ' + nuRecul.toFixed(1));
});

test('un coup saute ne survit pas a l atterrissage', () => {
  const c = neuf(); loin(c);
  const j = c.etat.combattants[0];
  joue(c, 1, { saut: true }, {});
  /* On attend d etre en train de redescendre, pres du sol : le coup lance la
     depasse forcement l atterrissage. S il survivait, il deviendrait un coup
     AU SOL imblocable, ce qui est justement ce qui distingue le coup saute. */
  let precedent = j.y;
  let n = 0;
  while (!(j.y < 40 && j.y < precedent) && n++ < 200) { precedent = j.y; joue(c, 1, {}, {}); }
  assert.ok(j.y > A.ARENE.sol, 'il fallait attraper la descente');
  joue(c, 2, { poing: true }, {});
  assert.strictEqual(j.anim, 'saute', 'le coup saute doit sortir');
  let vuAuSol = false;
  for (let i = 0; i < 60; i++) {
    joue(c, 1, {}, {});
    if (j.y === A.ARENE.sol) vuAuSol = true;
    assert.ok(!(j.anim === 'saute' && j.y === A.ARENE.sol), 'le coup saute continue au sol a la trame ' + i);
  }
  assert.ok(vuAuSol, 'il fallait atterrir pour que ce cas prouve quelque chose');
});

test('la garde haute ne bloque PAS un coup saute', () => {
  const c = neuf();
  duo(c, A.COUPS.saute.portee - 40);
  joue(c, 1, { saut: true }, { garde: true });
  const t = touches(joue(c, 30, { poing: true }, { garde: true }));
  assert.strictEqual(t.length, 1, 'le coup saute doit toucher');
  assert.strictEqual(t[0].coup, 'saute');
  assert.strictEqual(t[0].bloque, false, 'la garde haute a bloque un coup saute');
  assert.strictEqual(t[0].degats, A.COUPS.saute.degats, 'plein tarif');
});

test('l accroupi ne bloque pas non plus un coup saute', () => {
  const c = neuf();
  duo(c, A.COUPS.saute.portee - 40);
  joue(c, 1, { saut: true }, { garde: true, bas: true });
  const t = touches(joue(c, 30, { poing: true }, { garde: true, bas: true }));
  assert.strictEqual(t.length, 1, 'le coup saute doit toucher un accroupi');
  assert.strictEqual(t[0].bloque, false, 'un accroupi a bloque un coup saute');
});

test('le coup saute passe au-dessus de toute garde par construction', () => {
  /* C'est ce que dit la table, et c'est pour ca qu'aucun code ne connait le
     nom du coup saute : il monte plus haut que le corps entier, donc plus
     haut que la plus haute des gardes. */
  assert.ok(A.COUPS.saute.haut > A.CORPS.haut, 'le coup saute doit depasser la garde debout');
  assert.ok(A.COUPS.saute.haut > A.CORPS.accroupi, 'et la garde basse');
});

test('la garde basse arrete le pied', () => {
  const c = neuf();
  const t = unCoup(c, 'pied', { garde: true, bas: true });
  assert.strictEqual(t.length, 1);
  assert.strictEqual(t[0].bloque, true, 'un pied bas doit se bloquer accroupi');
});

test('la garde basse ne couvre pas le poing haut', () => {
  const c = neuf();
  const t = unCoup(c, 'poing', { garde: true, bas: true });
  assert.strictEqual(t.length, 1, 'le poing doit toucher un accroupi');
  assert.strictEqual(t[0].bloque, false, 'un accroupi a bloque un poing haut');
  assert.strictEqual(t[0].degats, A.COUPS.poing.degats);
});

test('s accroupir sans garder ne bloque rien', () => {
  const c = neuf();
  const t = unCoup(c, 'pied', { bas: true });
  assert.strictEqual(t[0].bloque, false, 's accroupir n est pas garder');
  assert.strictEqual(t[0].degats, A.COUPS.pied.degats);
});

test('on ne garde pas en l air', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  joue(c, 1, {}, { saut: true, garde: true });
  const t = touches(joue(c, 40, { pied: true }, { garde: true }));
  assert.strictEqual(t.length, 1, 'le pied doit toucher le sauteur');
  assert.strictEqual(t[0].bloque, false, 'garde efficace en l air');
});

test('le drapeau bloque suit l encaissement en garde', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  assert.strictEqual(c.etat.combattants[1].bloque, false, 'au repos');
  let vu = false;
  for (let i = 0; i < 60; i++) {
    joue(c, 1, { pied: true }, { garde: true });
    if (c.etat.combattants[1].bloque) vu = true;
  }
  assert.ok(vu, 'bloque n a jamais ete vrai');
  joue(c, 60, {}, { garde: true });
  assert.strictEqual(c.etat.combattants[1].bloque, false, 'bloque doit retomber');
});

test('un coup encaisse a nu ne leve pas le drapeau bloque', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  let vu = false;
  for (let i = 0; i < 60; i++) { joue(c, 1, { pied: true }, {}); if (c.etat.combattants[1].bloque) vu = true; }
  assert.strictEqual(vu, false, 'bloque leve sans garde');
});

// =====================================================================
//                            LE GEL DE TOUCHE
// =====================================================================

test('le gel de touche empeche d agir', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  /* On s'arrete PILE a la touche : mesurer le gel apres un nombre de trames
     devine reviendrait a mesurer autre chose des que le reglage bouge. */
  let n = 0;
  while (touches(joue(c, 1, { pied: true }, {})).length === 0) {
    assert.ok(n++ < 60, 'le pied n a jamais touche');
  }
  /* Toute la duree du gel, la cible appuie sur poing. On la RECOLLE a portee
     a chaque trame : sans ca, le recul suffirait a expliquer l absence de
     riposte et ce cas ne mesurerait plus le gel. */
  const trames = Math.floor(A.COUPS.pied.gel / DT) - 2;
  let evs = [];
  for (let i = 0; i < trames; i++) {
    duo(c, A.COUPS.poing.portee - 20);
    /* Elle MARTELE : une touche tenue ne repartirait pas toute seule apres le
       gel d impact, et l absence de riposte ne prouverait alors rien. */
    evs = evs.concat(joue(c, 1, {}, { poing: i % 2 === 0 }));
    assert.strictEqual(c.etat.combattants[1].anim, 'touche', 'la cible a change d etat a la trame ' + i);
  }
  assert.strictEqual(touches(evs).filter((e) => e.cible === 0).length, 0, 'la cible a riposte pendant son gel');
  assert.ok(trames * DT > A.COUPS.poing.depart + 2 * DT, 'la fenetre doit laisser le temps d un poing pour prouver quelque chose');
});

test('le gel de touche finit par rendre la main', () => {
  const c = neuf();
  duo(c, A.COUPS.poing.portee - 20);
  joue(c, 40, { poing: true }, {});
  duo(c, A.COUPS.poing.portee - 20);           // on recolle apres le recul
  const t = touches(joue(c, 60, {}, { poing: true }));
  assert.strictEqual(t.length, 1, 'la cible doit pouvoir riposter apres son gel');
  assert.strictEqual(t[0].cible, 0);
});

test('encaisser interrompt son propre coup', () => {
  const c = neuf();
  duo(c, A.COUPS.poing.portee - 20);      // a portee des DEUX coups
  /* Le cote 1 lance un pied (0,15 s de sortie) ; le cote 0 lui met un poing
     (0,05 s) dans l intervalle. Le pied ne doit jamais sortir. */
  const evs = joue(c, 60, { poing: true }, { pied: true });
  const t = touches(evs);
  assert.ok(t.length >= 1, 'le poing doit passer');
  assert.strictEqual(t[0].cible, 1, 'le poing arrive le premier');
  assert.strictEqual(t.filter((e) => e.coup === 'pied').length, 0, 'le pied interrompu est sorti quand meme');
});

// =====================================================================
//                        LA JAUGE ET LE SPECIAL
// =====================================================================

test('la jauge se remplit quand on touche', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  assert.strictEqual(c.etat.combattants[0].jauge, 0);
  joue(c, 60, { pied: true }, {});
  assert.strictEqual(c.etat.combattants[0].jauge, A.COUPS.pied.super, 'l attaquant charge');
});

test('la jauge se remplit aussi pour celui qui encaisse', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  joue(c, 60, { pied: true }, {});
  const j = c.etat.combattants[1].jauge;
  assert.ok(j > 0, 'celui qui prend doit charger aussi');
  assert.ok(j < c.etat.combattants[0].jauge, 'mais moins que celui qui place');
});

test('la jauge ne depasse pas son maximum', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  c.etat.combattants[0].jauge = A.JAUGE_MAX - 1;
  joue(c, 60, { pied: true }, {});
  assert.strictEqual(c.etat.combattants[0].jauge, A.JAUGE_MAX);
});

test('le special ne part pas sans la jauge', () => {
  const c = neuf();
  duo(c, 260);
  c.etat.combattants[0].jauge = A.COUPS.special.cout - 1;
  const evs = joue(c, 30, { poing: true, pied: true }, {});
  assert.strictEqual(du(evs, 'special').length, 0, 'un special est parti sans la jauge');
  assert.strictEqual(c.etat.projectiles.length, 0, 'un projectile est parti sans la jauge');
  assert.strictEqual(c.etat.combattants[0].jauge, A.COUPS.special.cout - 1, 'la jauge a bouge');
  assert.notStrictEqual(c.etat.combattants[0].anim, 'special');
});

test('le special coute sa jauge et s annonce', () => {
  const c = neuf();
  duo(c, 260);
  c.etat.combattants[0].jauge = A.JAUGE_MAX;
  const evs = joue(c, 30, { poing: true, pied: true }, {});
  const sp = du(evs, 'special');
  assert.strictEqual(sp.length, 1, 'un evenement special attendu');
  assert.strictEqual(sp[0].cote, 0);
  assert.strictEqual(c.etat.combattants[0].jauge, A.JAUGE_MAX - A.COUPS.special.cout, 'la jauge doit se vider');
});

test('le special lache un projectile devant son lanceur', () => {
  const c = neuf();
  duo(c, 400);
  const f = c.etat.combattants;
  f[0].jauge = A.JAUGE_MAX;
  joue(c, Math.ceil(A.COUPS.special.depart / DT) + 3, { poing: true, pied: true }, {});
  assert.strictEqual(c.etat.projectiles.length, 1, 'un projectile attendu');
  const p = c.etat.projectiles[0];
  ['x', 'y', 'vx', 'cote'].forEach((k) => assert.ok(k in p, 'champ ' + k));
  assert.strictEqual(p.cote, 0);
  assert.ok(p.vx > 0, 'il part vers la droite comme son lanceur');
  assert.ok(p.x > f[0].x, 'il nait devant, pas dans le ventre');
});

test('le projectile avance a chaque pas', () => {
  const c = neuf();
  duo(c, 400);
  c.etat.combattants[0].jauge = A.JAUGE_MAX;
  joue(c, Math.ceil(A.COUPS.special.depart / DT) + 3, { poing: true, pied: true }, {});
  const x0 = c.etat.projectiles[0].x;
  joue(c, 5, {}, {});
  assert.ok(c.etat.projectiles.length === 1 && c.etat.projectiles[0].x > x0, 'le projectile doit avancer');
});

test('le projectile disparait au mur', () => {
  const c = neuf();
  const f = c.etat.combattants;
  duo(c, 400);
  f[0].jauge = A.JAUGE_MAX;
  joue(c, Math.ceil(A.COUPS.special.depart / DT) + 3, { poing: true, pied: true }, {});
  assert.strictEqual(c.etat.projectiles.length, 1);
  /* On sort la cible du chemin : ce cas mesure le mur, pas l impact. */
  f[1].x = A.ARENE.murG;
  const evs = joue(c, 240, {}, {});
  assert.strictEqual(c.etat.projectiles.length, 0, 'le projectile a survecu au mur');
  assert.strictEqual(touches(evs).length, 0, 'il ne devait toucher personne');
});

test('le projectile disparait a l impact', () => {
  const c = neuf();
  duo(c, 400);
  c.etat.combattants[0].jauge = A.JAUGE_MAX;
  const evs = joue(c, 240, { poing: true, pied: true }, {});
  const t = touches(evs);
  assert.strictEqual(t.length, 1, 'une seule touche attendue, vu ' + t.length);
  assert.strictEqual(t[0].coup, 'special');
  assert.strictEqual(c.etat.projectiles.length, 0, 'le projectile a traverse sa cible');
});

test('le projectile ne touche pas son lanceur', () => {
  const c = neuf();
  const f = c.etat.combattants;
  duo(c, 400);
  f[0].jauge = A.JAUGE_MAX;
  joue(c, Math.ceil(A.COUPS.special.depart / DT) + 3, { poing: true, pied: true }, {});
  f[1].x = A.ARENE.murD;
  f[0].x = c.etat.projectiles[0].x;            // on se met DANS son propre tir
  const evs = joue(c, 10, {}, {});
  assert.strictEqual(touches(evs).filter((e) => e.cible === 0).length, 0, 'on s est tire dessus');
  assert.strictEqual(f[0].pv, A.PV_MAX);
});

test('un projectile debout se bloque', () => {
  const c = neuf();
  duo(c, 400);
  c.etat.combattants[0].jauge = A.JAUGE_MAX;
  const t = touches(joue(c, 240, { poing: true, pied: true }, { garde: true }));
  assert.strictEqual(t.length, 1, 'le projectile doit arriver');
  assert.strictEqual(t[0].bloque, true, 'le projectile n a pas ete bloque');
  assert.ok(t[0].degats < A.COUPS.special.degats, 'la garde doit reduire');
});

test('un accroupi passe sous le projectile', () => {
  const c = neuf();
  duo(c, 400);
  c.etat.combattants[0].jauge = A.JAUGE_MAX;
  const evs = joue(c, 240, { poing: true, pied: true }, { bas: true });
  assert.strictEqual(touches(evs).length, 0, 'le projectile a touche un accroupi');
  assert.strictEqual(c.etat.combattants[1].pv, A.PV_MAX);
  assert.ok(A.COUPS.special.bas > A.CORPS.accroupi, 'et la table doit le dire');
  assert.ok(A.COUPS.special.haut <= A.CORPS.haut, 'tout en restant sous une garde debout');
});

test('les projectiles disparaissent a la fin de la manche', () => {
  const c = neuf();
  duo(c, 400);
  c.etat.combattants[0].jauge = A.JAUGE_MAX;
  joue(c, Math.ceil(A.COUPS.special.depart / DT) + 3, { poing: true, pied: true }, {});
  assert.strictEqual(c.etat.projectiles.length, 1);
  c.etat.combattants[1].pv = 0;
  joue(c, 1, {}, {});
  assert.strictEqual(c.etat.projectiles.length, 0, 'un projectile a survecu au K.O.');
});

// =====================================================================
//                       LES MANCHES ET LE COMBAT
// =====================================================================

/* Avance jusqu a ce que la condition soit vraie, sans toucher aux touches. */
function attend(c, cond, quoi, max) {
  let n = 0;
  while (!cond() && n++ < (max || 8000)) { c.entree(0, {}); c.entree(1, {}); c.pas(DT); }
  assert.ok(cond(), 'jamais vu : ' + quoi);
}
/* Le cote 0 met le cote 1 au tapis d un seul poing. */
function ko(c) {
  duo(c, A.COUPS.poing.portee - 20);
  c.etat.combattants[1].pv = A.COUPS.poing.degats;
  return martele(c, 40, 'poing', 0, { x: 1 });
}

test('la pendule ne tourne pas pendant l annonce', () => {
  const c = new A.Combat({ graine: 1 });
  assert.ok(c.etat.gel > 0);
  joue(c, 30, { x: 1 }, { x: -1 });
  assert.strictEqual(c.etat.temps, A.DUREE, 'la pendule a tourne pendant l annonce');
});

test('rien ne bouge pendant un gel', () => {
  const c = new A.Combat({ graine: 1 });
  const f = c.etat.combattants;
  const x0 = f[0].x, x1 = f[1].x;
  joue(c, 30, { x: 1, saut: true }, { x: -1 });
  assert.strictEqual(f[0].x, x0, 'le cote 0 a bouge pendant le gel');
  assert.strictEqual(f[1].x, x1, 'le cote 1 a bouge pendant le gel');
  assert.strictEqual(f[0].y, A.ARENE.sol, 'on a saute pendant le gel');
  assert.strictEqual(f[0].t, 0, 'l animation a tourne pendant le gel');
});

test('la pendule tourne une fois l annonce passee', () => {
  const c = neuf();
  joue(c, 60, {}, {});
  assert.ok(c.etat.temps < A.DUREE, 'la pendule est bloquee');
  assert.ok(Math.abs((A.DUREE - c.etat.temps) - 1) < 0.05, 'une seconde de trames doit couter une seconde');
});

test('le K.O. arrete la manche', () => {
  const c = neuf();
  const evs = ko(c);
  const kos = du(evs, 'ko');
  assert.strictEqual(kos.length, 1, 'un evenement ko attendu');
  assert.strictEqual(kos[0].perdant, 1);
  assert.strictEqual(c.etat.combattants[1].pv, 0);
  const m = du(evs, 'manche');
  assert.strictEqual(m.length, 1, 'un evenement manche attendu');
  assert.strictEqual(m[0].gagnant, 0);
  assert.deepStrictEqual(m[0].scores, [1, 0]);
  assert.deepStrictEqual(c.etat.scores, [1, 0]);
  assert.ok(c.etat.gel > 0, 'le K.O. doit figer le jeu');
});

test('apres un K.O. la pendule et les corps s arretent', () => {
  const c = neuf();
  ko(c);
  const t0 = c.etat.temps, x0 = c.etat.combattants[0].x;
  joue(c, 30, { x: 1 }, { x: -1 });
  assert.strictEqual(c.etat.temps, t0, 'la pendule a tourne apres le K.O.');
  assert.strictEqual(c.etat.combattants[0].x, x0, 'on a bouge apres le K.O.');
});

test('le perdant est a terre et pas le gagnant', () => {
  const c = neuf();
  ko(c);
  assert.strictEqual(c.etat.combattants[1].anim, 'ko');
  assert.notStrictEqual(c.etat.combattants[0].anim, 'ko');
});

test('un seul evenement manche par manche', () => {
  const c = neuf();
  let evs = ko(c);
  evs = evs.concat(joue(c, 120, {}, {}));
  assert.strictEqual(du(evs, 'manche').length, 1, 'la manche a ete comptee plusieurs fois');
});

test('la manche 2 remet les PV a plein', () => {
  const c = neuf();
  ko(c);
  attend(c, () => c.etat.manche === 2, 'la manche 2');
  const f = c.etat.combattants;
  assert.strictEqual(f[0].pv, f[0].pvMax);
  assert.strictEqual(f[1].pv, f[1].pvMax);
  assert.strictEqual(c.etat.temps, A.DUREE, 'la pendule repart a plein');
  assert.strictEqual(c.etat.message, 'ROUND 2');
  assert.ok(c.etat.gel > 0, 'la manche 2 s annonce');
  assert.deepStrictEqual(c.etat.scores, [1, 0], 'les scores restent');
  assert.strictEqual(c.etat.fini, false);
});

test('la manche 2 replace les combattants et efface les etats', () => {
  const c = neuf();
  const neuve = new A.Combat({ graine: 1 }).etat.combattants;
  ko(c);
  attend(c, () => c.etat.manche === 2, 'la manche 2');
  const f = c.etat.combattants;
  assert.strictEqual(f[0].x, neuve[0].x, 'le cote 0 revient a sa place');
  assert.strictEqual(f[1].x, neuve[1].x, 'le cote 1 revient a sa place');
  assert.strictEqual(f[0].face, 1);
  assert.strictEqual(f[1].face, -1);
  assert.strictEqual(f[1].anim, 'idle', 'le K.O. doit etre efface');
  assert.strictEqual(f[1].bloque, false);
});

test('la jauge, elle, survit a la manche', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  joue(c, 60, { pied: true }, {});
  const j = c.etat.combattants[0].jauge;
  assert.ok(j > 0, 'il faut de la jauge pour que ce cas mesure quelque chose');
  ko(c);
  attend(c, () => c.etat.manche === 2, 'la manche 2');
  assert.ok(c.etat.combattants[0].jauge >= j, 'la jauge a ete effacee entre deux manches');
});

test('deux manches gagnees terminent le combat', () => {
  const c = neuf();
  let evs = ko(c);
  attend(c, () => c.etat.manche === 2, 'la manche 2');
  passeGel(c);
  evs = evs.concat(ko(c));
  assert.deepStrictEqual(c.etat.scores, [A.MANCHES, 0]);
  assert.strictEqual(c.etat.fini, true, 'le combat devait etre fini');
  assert.strictEqual(c.etat.vainqueur, 0);
  const fin = du(evs, 'fin');
  assert.strictEqual(fin.length, 1, 'un evenement fin attendu');
  assert.strictEqual(fin[0].vainqueur, 0);
});

test('rien ne se passe apres la fin du combat', () => {
  const c = neuf();
  ko(c);
  attend(c, () => c.etat.manche === 2, 'la manche 2');
  passeGel(c);
  ko(c);
  const avant = photo(c);
  const evs = joue(c, 600, { x: 1, poing: true }, { x: -1, pied: true });
  assert.strictEqual(evs.length, 0, 'des evenements apres la fin');
  assert.strictEqual(c.etat.manche, A.MANCHES, 'une manche de trop a demarre');
  assert.strictEqual(photo(c), avant, 'les corps bougent encore');
});

test('le temps ecoule donne la manche a celui qui a le plus de PV', () => {
  const c = neuf();
  loin(c);
  const f = c.etat.combattants;
  f[0].pv = 40; f[1].pv = 70;
  let evs = [];
  let n = 0;
  while (du(evs, 'manche').length === 0 && n++ < 5000) evs = evs.concat(joue(c, 1, {}, {}));
  const m = du(evs, 'manche')[0];
  assert.ok(m, 'la manche doit finir au temps ecoule');
  assert.strictEqual(du(evs, 'ko').length, 0, 'personne ne devait tomber');
  assert.strictEqual(c.etat.temps, 0);
  assert.strictEqual(m.gagnant, 1, 'celui qui a le plus de PV gagne');
  assert.deepStrictEqual(c.etat.scores, [0, 1]);
  assert.strictEqual(c.etat.message, 'TEMPS');
});

test('egalite de PV au temps ecoule : personne ne marque', () => {
  const c = neuf();
  loin(c);
  let evs = [];
  let n = 0;
  while (du(evs, 'manche').length === 0 && n++ < 5000) evs = evs.concat(joue(c, 1, {}, {}));
  const m = du(evs, 'manche')[0];
  assert.ok(m, 'la manche doit finir au temps ecoule');
  assert.strictEqual(m.gagnant, null, 'une egalite ne fait pas de gagnant');
  assert.deepStrictEqual(c.etat.scores, [0, 0]);
  assert.strictEqual(c.etat.fini, false, 'le combat continue');
  attend(c, () => c.etat.manche === 2, 'la manche suivante');
});

test('un combat de manches nulles finit quand meme', () => {
  const c = neuf();
  loin(c);
  let n = 0;
  while (!c.etat.fini && n++ < 60000) { loin(c); joue(c, 1, {}, {}); }
  assert.ok(c.etat.fini, 'un combat sans coup n a jamais fini');
  assert.ok(c.etat.manche <= A.MANCHES_MAX, 'trop de manches : ' + c.etat.manche);
  assert.strictEqual(c.etat.vainqueur, null, 'personne n a gagne un combat sans coup');
});

// =====================================================================
//                          LES ANIMATIONS
// =====================================================================

test('l animation suit ce qu on tient au clavier', () => {
  const cas = [
    [{}, 'idle'],
    [{ x: 1 }, 'marche'],
    [{ x: -1 }, 'recule'],
    [{ bas: true }, 'accroupi'],
    [{ garde: true }, 'garde'],
  ];
  cas.forEach((p) => {
    const c = neuf(); loin(c);
    joue(c, 3, p[0], {});
    assert.strictEqual(c.etat.combattants[0].anim, p[1], JSON.stringify(p[0]));
  });
});

test('l animation nomme le coup en cours', () => {
  const c = neuf(); loin(c);
  joue(c, 2, { poing: true }, {});
  assert.strictEqual(c.etat.combattants[0].anim, 'poing');
  const b = neuf(); loin(b);
  joue(b, 2, { pied: true }, {});
  assert.strictEqual(b.etat.combattants[0].anim, 'pied');
});

test('l animation du saut et du coup saute', () => {
  const c = neuf(); loin(c);
  joue(c, 3, { saut: true }, {});
  assert.strictEqual(c.etat.combattants[0].anim, 'saut');
  joue(c, 2, { poing: true }, {});
  assert.strictEqual(c.etat.combattants[0].anim, 'saute', 'un coup en l air est un coup saute');
});

test('l animation du special', () => {
  const c = neuf(); loin(c);
  c.etat.combattants[0].jauge = A.JAUGE_MAX;
  joue(c, 2, { poing: true, pied: true }, {});
  assert.strictEqual(c.etat.combattants[0].anim, 'special');
});

test('l animation de celui qui encaisse', () => {
  const c = neuf();
  duo(c, A.COUPS.pied.portee - 20);
  let n = 0;
  while (touches(joue(c, 1, { pied: true }, {})).length === 0) assert.ok(n++ < 60, 'le pied n a jamais touche');
  assert.strictEqual(c.etat.combattants[1].anim, 'touche');
  assert.strictEqual(c.etat.combattants[1].t, 0, 'l animation de touche part de zero');
});

test('le compteur d animation repart de zero a chaque changement', () => {
  const c = neuf(); loin(c);
  joue(c, 10, {}, {});
  const f = c.etat.combattants[0];
  assert.ok(f.t > 0, 'le compteur doit avancer');
  joue(c, 1, { x: 1 }, {});
  assert.strictEqual(f.anim, 'marche');
  assert.strictEqual(f.t, 0, 'le compteur doit repartir de zero');
  joue(c, 3, { x: 1 }, {});
  assert.ok(Math.abs(f.t - 3 * DT) < 1e-9, 'puis suivre le temps');
});

test('le compteur repart aussi quand le meme coup revient', () => {
  const c = neuf(); loin(c);
  const f = c.etat.combattants[0];
  const evs = martele(c, 120, 'poing');
  assert.strictEqual(du(evs, 'touche').length, 0, 'personne ne doit se toucher ici');
  /* On attrape le compteur a la premiere trame de chaque poing : il doit
     valoir zero a chaque fois, jamais un reste du poing precedent. */
  let departs = 0;
  let precedent = f.anim;
  for (let i = 0; i < 120; i++) {
    joue(c, 1, { poing: i % 2 === 0 }, {});
    if (f.anim === 'poing' && precedent !== 'poing') { departs++; assert.strictEqual(f.t, 0, 'reprise ' + departs); }
    precedent = f.anim;
  }
  assert.ok(departs >= 2, 'il faut plusieurs poings pour que ce cas prouve quelque chose');
});

// =====================================================================
//                          L ORDINATEUR
// =====================================================================

function combatIA(graine, joueur, maxSecondes) {
  const c = new A.Combat({ graine: graine });
  const max = 60 * (maxSecondes || 400);
  for (let i = 0; i < max && !c.etat.fini; i++) {
    if (joueur) joueur(c, i); else c.ia(0);
    c.ia(1);
    c.pas(DT);
  }
  return c;
}

test('l ordinateur n est pas un mur immobile', () => {
  const c = new A.Combat({ graine: 4 });
  const x0 = c.etat.combattants[1].x;
  let bouge = false, frappe = false, portes = 0;
  for (let i = 0; i < 60 * 20; i++) {
    c.entree(0, {});
    c.ia(1);
    /* On compte les touches AU VOL : regarder les points de vie a la fin ne
       dirait rien, une manche gagnee les a deja remis a plein. */
    c.pas(DT).forEach((e) => { if (e.type === 'touche' && e.cible === 0) portes++; });
    if (Math.abs(c.etat.combattants[1].x - x0) > 20) bouge = true;
    if (['poing', 'pied', 'saute', 'special'].indexOf(c.etat.combattants[1].anim) >= 0) frappe = true;
  }
  assert.ok(bouge, 'l ordinateur n a pas bouge');
  assert.ok(frappe, 'l ordinateur n a jamais frappe');
  assert.ok(portes > 5, 'l ordinateur n a place que ' + portes + ' coups sur un adversaire passif');
});

test('l ordinateur gagne parfois et perd parfois', () => {
  const gagne = [0, 0, 0];
  for (let g = 1; g <= 12; g++) {
    const c = combatIA(g);
    assert.ok(c.etat.fini, 'combat de graine ' + g + ' jamais fini');
    gagne[c.etat.vainqueur === null ? 2 : c.etat.vainqueur]++;
  }
  assert.ok(gagne[0] > 0, 'l ordinateur n est jamais battu');
  assert.ok(gagne[1] > 0, 'l ordinateur ne gagne jamais');
});

test('l ordinateur ne garde pas parfaitement', () => {
  let bloques = 0, nus = 0;
  for (let g = 1; g <= 4; g++) {
    const c = new A.Combat({ graine: g });
    for (let i = 0; i < 60 * 120 && !c.etat.fini; i++) {
      c.ia(0); c.ia(1);
      c.pas(DT).forEach((e) => { if (e.type === 'touche') { if (e.bloque) bloques++; else nus++; } });
    }
  }
  assert.ok(bloques > 0, 'personne ne garde jamais');
  assert.ok(nus > 0, 'la garde est parfaite : rien ne passe jamais');
});

/* Le rythme d attaque de l ordinateur, a distance MAINTENUE : ce qu on mesure
   est sa cadence, pas son placement. */
function cadenceIA(marteleur, secondes) {
  let attaques = 0;
  for (let g = 1; g <= 4; g++) {
    const c = new A.Combat({ graine: g });
    let precedent = '';
    for (let i = 0; i < 60 * secondes; i++) {
      const f = c.etat.combattants;
      const ecart = A.COUPS.poing.portee - 20;
      f[0].x = A.CENTRE - ecart / 2; f[1].x = A.CENTRE + ecart / 2;
      f[0].pv = f[0].pvMax; f[1].pv = f[1].pvMax;   // personne ne tombe : on mesure une cadence
      c.entree(0, marteleur ? { poing: i % 2 === 0 } : {});
      c.ia(1);
      c.pas(DT);
      const a = f[1].anim;
      if (['poing', 'pied', 'saute', 'special'].indexOf(a) >= 0 && a !== precedent) attaques++;
      precedent = a;
    }
  }
  return attaques;
}

test('l ordinateur enchaine ses coups', () => {
  const secondes = 20;
  const cycle = A.COUPS.poing.depart + A.COUPS.poing.actif + A.COUPS.poing.fin;
  const plafond = 4 * secondes / cycle;         // ce que la cadence du poing autorise
  const lance = cadenceIA(false, secondes);
  /* Un ordinateur qui garderait sa touche enfoncee d une decision a l autre
     n en sortirait qu une sur deux : le moteur ne voit que les fronts
     montants. Un tiers du plafond est deja bien en dessous de ce qu il fait,
     mais bien au-dessus de ce qu il ferait sans relacher. */
  assert.ok(lance > plafond / 3, lance + ' coups lances pour un plafond de ' + plafond.toFixed(0));
});

test('l ordinateur riposte meme sous le feu', () => {
  const libre = cadenceIA(false, 20);
  const sousLeFeu = cadenceIA(true, 20);
  assert.ok(sousLeFeu > libre / 4,
    'sous le feu ' + sousLeFeu + ' coups contre ' + libre + ' au calme : il subit sans repondre');
});

test('l ordinateur varie avec la graine', () => {
  const a = combatIA(11, null, 20), b = combatIA(12, null, 20);
  assert.notStrictEqual(JSON.stringify(a.etat), JSON.stringify(b.etat), 'deux graines, un seul combat');
});

test('une manche contre l ordinateur dure entre 20 et 45 secondes', () => {
  const durees = [];
  for (let g = 1; g <= 40; g++) {
    const c = new A.Combat({ graine: g });
    let fini = null;
    for (let i = 0; i < 60 * 200 && fini === null; i++) {
      c.ia(0); c.ia(1);
      c.pas(DT).forEach((e) => { if (e.type === 'manche' && fini === null) fini = A.DUREE - c.etat.temps; });
    }
    assert.ok(fini !== null, 'la manche de graine ' + g + ' n a pas fini');
    assert.ok(fini >= 20 && fini <= 45, 'manche de graine ' + g + ' : ' + fini.toFixed(1) + ' s');
    durees.push(fini);
  }
  const moy = durees.reduce((a, b) => a + b, 0) / durees.length;
  assert.ok(moy >= 20 && moy <= 45, 'duree moyenne ' + moy.toFixed(1) + ' s');
});

test('marteler une touche ne suffit pas a gagner', () => {
  let gagnes = 0;
  for (let g = 1; g <= 12; g++) {
    const c = combatIA(g, (c2, i) => c2.entree(0, { poing: i % 2 === 0, x: 1 }));
    assert.ok(c.etat.fini, 'combat jamais fini');
    if (c.etat.vainqueur === 0) gagnes++;
  }
  assert.strictEqual(gagnes, 0, 'le martelage a gagne ' + gagnes + ' combats sur 12');
});

test('un joueur qui garde et place ses coups gagne', () => {
  /* Ce joueur ne lit que l'etat public — ce que le dessin montre a l'ecran :
     la distance, et l'animation de l'adversaire. Il garde quand l'autre
     frappe, avance sinon, et place son pied a sa portee. */
  function tacticien(c, i) {
    const f = c.etat.combattants, moi = f[0], lui = f[1];
    const d = Math.abs(lui.x - moi.x);
    const frappe = ['poing', 'pied', 'saute', 'special'].indexOf(lui.anim) >= 0;
    if (frappe && d < A.COUPS.pied.portee + 20) return c.entree(0, { garde: true });
    if (d > A.COUPS.pied.portee - 10) return c.entree(0, { x: 1 });
    return c.entree(0, { pied: i % 2 === 0 });
  }
  let gagnes = 0;
  for (let g = 1; g <= 8; g++) {
    const c = combatIA(g, tacticien);
    assert.ok(c.etat.fini, 'combat jamais fini');
    if (c.etat.vainqueur === 0) gagnes++;
  }
  assert.ok(gagnes > 0, 'un jeu ou le joueur ne peut pas gagner n en est pas un');
});

// =====================================================================
//                          LE DETERMINISME
// =====================================================================

test('meme graine et memes entrees : meme combat au bout de 600 pas', () => {
  function tourne() {
    const c = new A.Combat({ graine: 12345, skins: ['andy', 'pepe'] });
    for (let i = 0; i < 600; i++) {
      c.entree(0, { x: (i % 90 < 45) ? 1 : -1, poing: i % 17 === 0, pied: i % 29 === 0, saut: i % 53 === 0, garde: i % 31 < 4 });
      c.ia(1);
      c.pas(DT);
    }
    return c.etat;
  }
  const a = tourne(), b = tourne();
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b), 'deux simulations identiques ont diverge');
  assert.ok(a.combattants[0].pv < A.PV_MAX || a.combattants[1].pv < A.PV_MAX,
    'il faut que quelque chose se soit passe pour que ce cas prouve quelque chose');
});

test('les evenements aussi sont identiques', () => {
  function tourne() {
    const c = new A.Combat({ graine: 777 });
    let evs = [];
    for (let i = 0; i < 600; i++) { c.ia(0); c.ia(1); evs = evs.concat(c.pas(DT)); }
    return evs;
  }
  const a = tourne(), b = tourne();
  assert.ok(a.length > 0, 'sans evenement, ce cas ne prouve rien');
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});

test('une graine differente donne un combat different', () => {
  function tourne(g) {
    const c = new A.Combat({ graine: g });
    for (let i = 0; i < 600; i++) { c.ia(0); c.ia(1); c.pas(DT); }
    return JSON.stringify(c.etat);
  }
  assert.notStrictEqual(tourne(1), tourne(2));
});

test('le moteur ne touche ni a l horloge ni au hasard du navigateur', () => {
  const src = sansCommentaires(require('fs').readFileSync(__dirname + '/arcade.js', 'utf8'));
  /* Un seul Date.now() ou Math.random() suffirait a rendre un combat
     irreproductible — et a faire diverger deux navigateurs sur le meme
     replay. On le verifie sur le texte, parce que c'est la seule facon de
     s'en assurer pour TOUS les chemins, y compris ceux que ces essais ne
     visitent pas. */
  assert.strictEqual(/Math\.random/.test(src), false, 'Math.random dans le moteur');
  assert.strictEqual(/Date\.now|new Date/.test(src), false, 'une horloge dans le moteur');
  assert.strictEqual(/document\.|window\.addEventListener|canvas/.test(src), false, 'du DOM dans le moteur');
  assert.strictEqual(/require\(|import /.test(src), false, 'une dependance dans le moteur');
});

test('le moteur s expose au navigateur comme au module', () => {
  const src = require('fs').readFileSync(__dirname + '/arcade.js', 'utf8');
  assert.ok(/module\.exports = Arcade/.test(src), 'export node');
  assert.ok(/window\.Arcade = Arcade/.test(src), 'export navigateur');
  assert.ok(/^\(function \(\)/m.test(src), 'le tout dans une fonction fermee');
});

// =====================================================================

console.log('');
console.log(rates ? ('RATE : ' + rates + ' cas sur ' + cas) : ('OK : ' + cas + ' cas'));
process.exit(rates ? 1 : 0);
