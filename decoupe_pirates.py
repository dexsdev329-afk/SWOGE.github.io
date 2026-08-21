# -*- coding: utf-8 -*-
"""Les pirates de la cave, la balise, et le sorcier — decoupes.

Meme pipeline que `decoupe_creatures.py`, et pour les memes raisons. Ce qui
est verifie ICI plutot que suppose :

---- L'ORDRE DES LIGNES ----

Le moteur lit DIRS_M = {up:0, down:1, left:2, right:3}. A l'oeil, les lignes 2
et 3 de ces planches se ressemblent au point qu'on jurerait qu'elles regardent
toutes les deux a gauche — c'est l'erreur qui a ete faite une fois sur Optimus,
en retournant une ligne qui n'avait pas besoin de l'etre.

On MESURE donc : on compare le masque de la ligne 2 a celui de la ligne 3, puis
au meme retourne horizontalement. Le second est plus proche (0,87 contre 0,62
pour le pirate) : les deux lignes SONT deja l'une le miroir de l'autre, donc
gauche et droite existent bien. Un agrandissement confirme le sens — ligne 2 le
nez a gauche, ligne 3 le nez a droite. Rien a retourner.

---- LE FOND ----

Trois des planches n'ont pas de couche alpha : leur damier de transparence est
DESSINE, en pixels clairs. On le propage depuis les BORDS plutot que de jeter
tous les gris clairs — sinon les galons dores du lieutenant et la chemise
rayee blanche du pirate partent avec le fond.

---- UNE SEULE ECHELLE ----

Pour les seize cases d'une creature. Sinon le personnage change de taille en se
retournant.
"""
import sys
sys.path.insert(0, '.')
from PIL import Image
import planches as P

D = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/art/'
CIBLE = 256          # les cases source font ~307 px : on reste pres du natif

CREATURES = [
    ('2.png', 'pirate'),
    ('3.png', 'piratesse'),
    ('4.png', 'lieutenant'),
    ('5.png', 'dreadstump'),
    # Pas encore attribue a une espece : on le decoupe quand meme, pret a
    # servir. Une planche gardee brute se reperd.
    ('1.png', 'sorcier'),
]

for fichier, cle in CREATURES:
    src = Image.open(D + fichier).convert('RGBA')
    src = P.detoure(src, seuilClair=200, seuilGris=26)

    lignes = []
    # Les LIGNES sur les creux — la hauteur ne se divise pas en quatre et les
    # personnages debordent de leur bande. Les COLONNES au pas fixe : ce sont
    # les quatre images d'une marche, et les recadrer une par une ferait sauter
    # le personnage au lieu de le faire marcher.
    for (y0, y1) in P.bandes(src, 4, 'y'):
        rang = src.crop((0, y0, src.width, y1))
        lignes.append(P.reguliere(rang, 4, 1)[0])

    lignes = [[P.nettoie_isoles(P.nettoie(c)) for c in rang] for rang in lignes]

    toutes = [c for rang in lignes for c in rang]
    e = P.echelle_commune(toutes, CIBLE, 8)
    # Les pieds plantes : dans un cycle de marche c'est le corps qui monte et
    # descend, pas le sol.
    posees = [P.pose(rang, CIBLE, marge=8, aligne='bas', e=e) for rang in lignes]
    feuille = P.planche(posees, CIBLE)
    P.ecrit(feuille, 'img/nexus/monstres/%s.webp' % cle)
    print('%-11s %s' % (cle, feuille.size))

# ---- LA BALISE ----
# Trois images cote a cote : dormante, qui s'eveille, allumee. Meme forme que
# le coffre garde (une bande de cases carrees), parce que la page sait deja
# lire ce format-la : `cadre = naturalHeight`.
bal = P.detoure(Image.open(D + '6.png').convert('RGBA'), seuilClair=200, seuilGris=26)
cases = []
for (x0, x1) in P.bandes(bal, 3, 'x'):
    cases.append(P.nettoie_isoles(P.nettoie(bal.crop((x0, 0, x1, bal.height)))))
# UNE echelle pour les trois : la balise ne doit pas grossir en s'allumant.
# Sa lueur deborde, elle, et c'est voulu — la marge la laisse respirer.
e = P.echelle_commune(cases, 256, 10)
posees = P.pose(cases, 256, marge=10, aligne='bas', e=e)
bande = P.bandeau(posees, 256)
P.ecrit(bande, 'img/nexus/tiles/obj_balise.webp')
print('%-11s %s' % ('balise', bande.size))
