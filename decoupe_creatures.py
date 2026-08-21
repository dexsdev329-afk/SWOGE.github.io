# -*- coding: utf-8 -*-
"""Les trois nouvelles planches de creature, decoupees.

Ce que le jeu attend, mesure et non suppose :
  — une planche CARREE, quatre colonnes et quatre lignes de cases carrees
    (`cadreDe(img) = naturalWidth / 4`, et le meme nombre sert de hauteur) ;
  — les lignes dans l'ordre du moteur : DIRS_M = {up:0, down:1, left:2, right:3} ;
  — les pieds plantes : dans un cycle de marche c'est le corps qui monte et
    descend, pas le sol.

Les fichiers rendus font 640x427 : des cases de 160 sur 107, hautes comme le
dessin et non comme la case du jeu. On les recompose en 640x640.

---- LES LIGNES SE COUPENT SUR LES CREUX, PAS AU PAS FIXE ----

Quatre cent vingt-sept ne se divise pas en quatre : chaque bande fait 106,75
pixels, et les personnages debordent de la leur. Coupe au pas fixe, on rogne
les pieds d'une ligne ET l'on ramasse le sommet du crane de la suivante — un
eclat detache qui entre dans la boite de mesure et fait mettre tout le
personnage a l'echelle comme s'il faisait deux fois sa taille.

Les COLONNES, elles, restent au pas fixe : ce sont les quatre images d'une
marche, et les recadrer une par une ferait sauter le personnage d'une image a
l'autre au lieu de le faire marcher.
"""
import sys
sys.path.insert(0, '.')
from PIL import Image
import planches as P

CIBLE = 160          # la case du jeu, comme les vingt-deux autres creatures

SOURCES = [
    ('/tmp/D65-BD2-ED-BD84-4645-BBFA-A8-FC4-DCA767-B.png', 'optimus'),
    ('/tmp/29794138-BB44-4771-95-D7-907512-F4874-A.png',   'hoodrat'),
    ('/tmp/4-A93255-B-A1-AF-4208-A7-CF-0-EC9224856-A7.png','sylvain'),
]

for chemin, cle in SOURCES:
    src = Image.open(chemin).convert('RGBA')
    # Le fond est un blanc PLAT : on le propage depuis les bords. Jeter « tous
    # les gris clairs » mangerait les plaques du robot et le visage pale du
    # bandit — c'est la lecon 5 en tete de planches.py.
    src = P.detoure(src, seuilClair=200, seuilGris=26)

    lignes = []
    for (y0, y1) in P.bandes(src, 4, 'y'):
        rang = src.crop((0, y0, src.width, y1))
        lignes.append(P.reguliere(rang, 4, 1)[0])

    # ---- LES ECLATS ----
    # Un pixel isole colle a un bord entre dans la boite de mesure et fait
    # mettre tout le personnage a l'echelle comme s'il faisait toute la case.
    lignes = [[P.nettoie_isoles(P.nettoie(c)) for c in rang] for rang in lignes]

    # ---- UNE SEULE ECHELLE POUR LES SEIZE CASES ----
    # Sinon le personnage change de taille en se retournant.
    toutes = [c for rang in lignes for c in rang]
    e = P.echelle_commune(toutes, CIBLE, 6)
    posees = [P.pose(rang, CIBLE, marge=6, aligne='bas', e=e) for rang in lignes]

    im = P.planche(posees, CIBLE)
    P.ecrit(im, 'img/nexus/monstres/%s.webp' % cle)
    print('%-9s %sx%s  echelle %.3f' % (cle, im.width, im.height, e))
