#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LES EFFETS DE ZONE DES FAMILIERS : d'une grille rendue par le generateur a la
bande de six que la page sait lire.

    python3 decoupe_fx_zone.py <bloc-notes>/fam_meute_grille.png meute

La planche brute reste au bloc-notes, comme pour les autres decoupes : elle
pese trois fois l'image finale et ne resservira pas.

---- pourquoi une grille et pas une bande ----

On avait demande une bande de six cases. Le generateur rend une SEQUENCE
CONTINUE : il espace les anneaux selon leur taille, pas sur une grille, et au
pic ils se chevauchent. Mesure sur les cinq premieres planches : les cinq
traits de coupe d'une bande reguliere tombaient tous dans du dessin, jusqu'a
140 px de haut sur le trait du milieu. Aucune taille de case ne s'en sortait.

En grille — deux colonnes sur trois lignes, ou l'inverse — chaque case est un
cadre, et le generateur laisse une marge autour. On retrouve alors des
separations franches : zero pixel sur les trois coupes de celle-ci.

---- ce qu'on ne fait PAS : recentrer chaque cadre sur son contenu ----

C'est ecrit dans `reguliere` et ca vaut ici : l'anneau GRANDIT, c'est
l'animation. Recadrer chaque image sur sa matiere donnerait six anneaux de la
meme taille qui battent au lieu de s'ouvrir.

Ce qu'on fait, c'est aligner les CENTRES : le generateur pose ses anneaux a
quelques pixels pres dans leurs cases, et ces quelques pixels se voient a
l'ecran comme un tremblement. On deplace donc chaque case — sans jamais la
redimensionner — pour que les six centres de gravite tombent au meme endroit,
puis on recadre les six sur une boite COMMUNE.
"""
import os
import sys
import numpy as np
from PIL import Image
import planches as P

SEUIL = 40          # ce qu'on considere comme de la matiere
MARGE = 6           # ce qu'on garde autour de la boite commune


def bandes_vides(masque, axe):
    """Les tranches entierement transparentes, dans un axe. Ce sont elles qui
    disent ou le generateur a separe ses cases — plutot que de supposer une
    forme de grille qu'il n'a pas forcement respectee."""
    occ = masque.sum(axis=1 - axe)
    vides, deb = [], None
    for i, v in enumerate(occ):
        if v == 0 and deb is None:
            deb = i
        if v != 0 and deb is not None:
            vides.append((deb, i - 1)); deb = None
    if deb is not None:
        vides.append((deb, len(occ) - 1))
    return vides


def coupures(masque, axe, mini=8):
    """Les milieux des bandes vides INTERIEURES : les traits de coupe."""
    n = masque.shape[1 - axe] if axe == 0 else masque.shape[0]
    n = masque.shape[0] if axe == 0 else masque.shape[1]
    out = []
    for a, b in bandes_vides(masque, axe):
        if a == 0 or b == n - 1:
            continue                      # la marge du bord, pas une coupure
        if b - a + 1 >= mini:
            out.append((a + b) // 2)
    return out


def main():
    if len(sys.argv) < 3:
        print('usage: decoupe_fx_zone.py <source.png> <nom>'); return 1
    source, nom = sys.argv[1], sys.argv[2]
    sortie = 'img/nexus/effets/fam_%s.webp' % nom

    im = Image.open(source).convert('RGBA')
    a = np.array(im)
    m = a[:, :, 3] > SEUIL
    print('source : %s %dx%d' % (source, im.width, im.height))

    cy = coupures(m, 0)        # traits horizontaux -> lignes
    cx = coupures(m, 1)        # traits verticaux   -> colonnes
    cols, lignes = len(cx) + 1, len(cy) + 1
    print('grille lue : %d colonne(s) x %d ligne(s)  (coupes x=%s, y=%s)'
          % (cols, lignes, cx, cy))
    if cols * lignes != 6:
        print('ATTENTION : %d cases au lieu de six — on n ecrit rien.' % (cols * lignes))
        return 1

    # On coupe au PAS FIXE de la grille lue, jamais sur le contenu.
    cases = []
    for l in range(lignes):
        for c in range(cols):
            x0 = 0 if c == 0 else cx[c - 1]
            x1 = im.width if c == cols - 1 else cx[c]
            y0 = 0 if l == 0 else cy[l - 1]
            y1 = im.height if l == lignes - 1 else cy[l]
            cases.append(im.crop((x0, y0, x1, y1)))
    print('lecture ligne par ligne : %d cases' % len(cases))

    # ---- LES CENTRES DE GRAVITE, ET RIEN D'AUTRE ----
    # Pas de mise a l'echelle : la croissance de l'anneau EST l'animation.
    centres = []
    for i, c in enumerate(cases):
        al = np.array(c)[:, :, 3].astype(float)
        poids = al.sum()
        if poids <= 0:
            centres.append((c.width / 2.0, c.height / 2.0)); continue
        gx = float((al.sum(axis=0) * np.arange(c.width)).sum() / poids)
        gy = float((al.sum(axis=1) * np.arange(c.height)).sum() / poids)
        centres.append((gx, gy))
        b = P.boite(c, SEUIL)
        print('  case %d : %dx%d, centre (%.1f, %.1f), boite %s'
              % (i + 1, c.width, c.height, gx, gy, b))

    # Chaque case est repeinte dans une toile commune, son centre pose au meme
    # point. La toile est large : on la recadrera sur la boite commune apres.
    L = max(c.width for c in cases) * 2
    H = max(c.height for c in cases) * 2
    poses = []
    for c, (gx, gy) in zip(cases, centres):
        f = Image.new('RGBA', (L, H), (0, 0, 0, 0))
        f.paste(c, (int(round(L / 2.0 - gx)), int(round(H / 2.0 - gy))))
        poses.append(f)

    # ---- LA BOITE COMMUNE ----
    # L'union des six : chacune garde sa taille, et aucune n'est rognee.
    bs = [P.boite(f, SEUIL) for f in poses]
    x0 = min(b[0] for b in bs if b) - MARGE
    y0 = min(b[1] for b in bs if b) - MARGE
    x1 = max(b[2] for b in bs if b) + MARGE
    y1 = max(b[3] for b in bs if b) + MARGE
    # Une case CARREE : la page pose l'effet dans un carre (`taille` et
    # `taille * ch / cw`), et une boite rectangulaire l'etirerait.
    cote = max(x1 - x0, y1 - y0)
    ccx, ccy = (x0 + x1) // 2, (y0 + y1) // 2
    x0, y0 = ccx - cote // 2, ccy - cote // 2
    print('boite commune : %d x %d' % (cote, cote))

    finales = [f.crop((x0, y0, x0 + cote, y0 + cote)) for f in poses]
    planche = P.bandeau(finales, cote)
    os.makedirs(os.path.dirname(sortie), exist_ok=True)
    P.ecrit(planche, sortie)
    print('ecrit : %s %dx%d (6 cases de %d)'
          % (sortie, planche.width, planche.height, cote))
    return 0


if __name__ == '__main__':
    sys.exit(main())
