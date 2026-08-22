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
BORD = 5            # le fondu applique contre un trait de coupe interieur


def note(masque, cx, cy):
    """Combien de dessin les traits de coupe traversent. C'est le seul juge
    d'une grille : la bonne est celle dont les traits tombent dans le vide."""
    return (sum(int(masque[:, x].sum()) for x in cx)
            + sum(int(masque[y, :].sum()) for y in cy))


def main():
    if len(sys.argv) < 5:
        print('usage: decoupe_fx_zone.py <source.png> <nom> <colonnes> <lignes>')
        print('  ex : decoupe_fx_zone.py bloc/meute.png meute 2 3')
        return 1
    source, nom = sys.argv[1], sys.argv[2]
    cols, lignes = int(sys.argv[3]), int(sys.argv[4])
    if cols * lignes != 6:
        print('il faut six cases, pas %d.' % (cols * lignes)); return 1
    sortie = 'img/nexus/effets/fam_%s.webp' % nom

    im = Image.open(source).convert('RGBA')
    print('source : %s %dx%d' % (source, im.width, im.height))

    # ---- LE DAMIER DESSINE ----
    # Un generateur sur deux rend la transparence en la PEIGNANT : l'image
    # arrive opaque, avec le damier gris et blanc en dur. On le voit tout de
    # suite — pas un seul pixel transparent — et on decompose plutot que de
    # detourer : un effet n'a pas de contour, et un alpha binaire le
    # transformerait en autocollant. Voir `detoure_effet`.
    if np.array(im)[:, :, 3].min() == 255:
        print('       fond peint (aucune transparence) -> detoure_effet')
        im = P.detoure_effet(im)

    a = np.array(im)
    m = a[:, :, 3] > SEUIL

    # ---- LA GRILLE SE DONNE, ELLE NE SE DEVINE PAS ----
    # J'ai essaye de la lire — bandes vides, puis recherche de creux. Les deux
    # se trompent : le halo d'un effet deborde de sa case et remplit les
    # colonnes qui devraient etre vides, et une vallee trouvee au mauvais
    # endroit donne une grille fausse SANS RIEN DIRE. Or la forme se voit d'un
    # coup d'oeil sur la planche. On la passe donc, et le script REND COMPTE
    # de ce que ses coupes traversent : c'est ce chiffre qui dit si on s'est
    # trompe, pas une devinette.
    cx = [round(im.width * i / cols) for i in range(1, cols)]
    cy = [round(im.height * i / lignes) for i in range(1, lignes)]
    score = note(m, cx, cy)
    print('grille %dx%d, coupes x=%s y=%s -> %d px de dessin traverses'
          % (cols, lignes, cx, cy, score))
    if score > 0:
        print('       ATTENTION : les traits tombent dans le dessin.')

    # On coupe au PAS FIXE de la grille lue, jamais sur le contenu.
    cases = []
    for l in range(lignes):
        for c in range(cols):
            x0 = 0 if c == 0 else cx[c - 1]
            x1 = im.width if c == cols - 1 else cx[c]
            y0 = 0 if l == 0 else cy[l - 1]
            y1 = im.height if l == lignes - 1 else cy[l]
            case = im.crop((x0, y0, x1, y1))
            # ---- LE LISERE DU VOISIN ----
            # Le halo d'un effet deborde de sa case : coupee au pas de la
            # grille, chaque case garde contre le trait une lamelle du voisin.
            # Elle ne se voit pas sur la planche et se voit tres bien en jeu —
            # une barre verticale claire au bord de l'effet, qui apparait et
            # disparait d'une image a l'autre.
            # On l'efface EN FONDU sur quelques pixels, et seulement du cote
            # d'un trait interieur : un bord de planche n'a pas de voisin. Ce
            # qu'on perd du halo propre a la case, a cet endroit-la, est de
            # toute facon le plus tenu.
            if BORD > 0:
                al = np.array(case)[:, :, 3].astype(float)
                if c > 0:
                    for k in range(BORD):
                        al[:, k] *= k / float(BORD)
                if c < cols - 1:
                    for k in range(BORD):
                        al[:, case.width - 1 - k] *= k / float(BORD)
                if l > 0:
                    for k in range(BORD):
                        al[k, :] *= k / float(BORD)
                if l < lignes - 1:
                    for k in range(BORD):
                        al[case.height - 1 - k, :] *= k / float(BORD)
                t = np.array(case)
                t[:, :, 3] = np.clip(al, 0, 255).astype(np.uint8)
                case = Image.fromarray(t, 'RGBA')
            cases.append(case)
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
    # ---- ET L ECLAT DU VOISIN QUI A SAUTE LE TRAIT ----
    #
    # Le fondu enleve ce qui est COLLE au trait de coupe. Une braise ou une
    # feuille du voisin, elle, atterrit un peu plus loin dans notre case,
    # detachee et flottant dans le vide — invisible sur la planche, et bien
    # visible en jeu sous la forme d une poussiere qui apparait sans raison a
    # cote de l effet.
    #
    # ICI et pas sur la case brute : tant que le fondu et le recadrage ne sont
    # pas passes, l eclat tient encore au dessin par une trainee tenue le long
    # du bord, `nettoie_isoles` le voit comme un morceau du meme amas et n y
    # touche pas. Mesure sur l abysse : ZERO pixel retire avant, 80 apres.
    #
    # Ce qu il enleve est a la fois MINUSCULE et LOIN : les debris que l effet
    # projette lui-meme sont nombreux mais proches, et ils restent — verifie,
    # zero pixel retire sur les cinq autres cases.
    # ---- ET L ECLAT DU VOISIN QUI A SAUTE LE TRAIT : ON LE GARDE ----
    #
    # Le fondu enleve ce qui est colle au trait de coupe. Une braise du voisin
    # qui atterrit plus loin dans la case, detachee, il ne l'atteint pas.
    # `nettoie_isoles` sait retirer ce genre d'eclat — minuscule et loin du
    # dessin — et je l'ai essaye ici.
    #
    # IL NE FAUT PAS. Ces effets PROJETTENT des debris : des feuilles, des
    # braises, des flocons qui derivent au-dessus de l'anneau. Sur la planche
    # de glace, il emportait 436 et 317 pixels des deux dernieres cases,
    # c'est-a-dire les flocons qui sont le sujet meme de ces deux images. Il
    # n'a aucun moyen de distinguer une poussiere volee au voisin d'un debris
    # que l'effet a lance lui-meme : les deux sont petits, detaches, et loin.
    #
    # Ce qui reste est de l'ordre de quatre-vingts pixels sur une case, visible
    # un dixieme de seconde. C'est moins cher qu'une planche a qui l'on retire
    # son dessin.
    planche = P.bandeau(finales, cote)
    os.makedirs(os.path.dirname(sortie), exist_ok=True)
    P.ecrit(planche, sortie)
    print('ecrit : %s %dx%d (6 cases de %d)'
          % (sortie, planche.width, planche.height, cote))
    return 0


if __name__ == '__main__':
    sys.exit(main())
