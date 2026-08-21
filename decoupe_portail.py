# -*- coding: utf-8 -*-
"""La porte du donjon : quatre images d'OUVERTURE, en cases carrees.

---- POURQUOI CARREES ----

La page compte les images en divisant la largeur de la planche par sa
HAUTEUR (`n = naturalWidth / naturalHeight`). Le fichier rendu fait 640x320 :
quatre images de 160 sur 320. La page y aurait lu DEUX images de 320, donc
deux moities de portail, et l'ouverture se serait jouee de travers sans que
rien ne plante.

---- POURQUOI ON GARDE LE SOCLE DE LAVE ----

C'est du SOL incruste dans le dessin, et du sol incruste est normalement une
faute : le meme dessin sert la porte d'aller, la porte de retour du boss et la
porte du sas. Sauf qu'Optimus ne vit que dans la lave, et que les deux autres
sont dans une FONDERIE. Les trois endroits ou cette porte existe sont donc
soit de la lave, soit du metal en fusion — le socle y est juste, et il pose la
porte au sol au lieu de la laisser flotter.

---- ET POURQUOI ON COUPE SUR LES CREUX, PAS AU PAS FIXE ----

Le pas fixe est ce qu'on veut pour une ANIMATION : ses images doivent garder
leur position relative, sinon une flamme qui monte se met a sauter. Mais le
generateur n'a pas espace les quatre portails regulierement — les vides sont a
116 et 246, pas a 160, 320 et 480. Coupe au pas fixe, on tranchait EN PLEIN
MILIEU des portails deux, trois et quatre : chaque case contenait une moitie
de porte et une moitie de la suivante, et l'ouverture jouait huit demi-portes.

C'est la lecon 2 en tete de planches.py, et elle s'applique ici parce que
cette animation-la est SYMETRIQUE : la porte s'ouvre en s'ecartant de son
centre, donc recentrer chaque image ne deplace rien. Le pas fixe aurait ete
obligatoire pour une flamme qui monte.

---- ET POURQUOI `aligne='bas'` ----

La fente grandit jusqu'a la porte pleine. Recadrer chaque image sur sa propre
HAUTEUR ferait grandir la fente jusqu'a remplir sa case des la premiere —
l'ouverture aurait disparu. On garde donc la bande verticale commune, et les
pieds plantes.
"""
import sys
sys.path.insert(0, '.')
from PIL import Image
import planches as P

CIBLE = 320          # la case : aussi haute que le dessin, donc carree

src = Image.open('/tmp/portail_new.png').convert('RGBA')
src = P.detoure(src, seuilClair=200, seuilGris=26)
cases = [src.crop((x0, 0, x1, src.height)) for (x0, x1) in P.bandes(src, 4, 'x')]
cases = [P.nettoie_isoles(P.nettoie(c)) for c in cases]
posees = P.pose(cases, CIBLE, marge=4, aligne='bas')
im = P.planche([posees], CIBLE)
P.ecrit(im, 'img/nexus/tiles/obj_portail.webp')
print('planche', im.width, 'x', im.height, '| cases', im.width // CIBLE)
