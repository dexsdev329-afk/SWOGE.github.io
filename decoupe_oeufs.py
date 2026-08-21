"""Les six oeufs de Petworld.

Une rangee de six, fond blanc — pas de damier cette fois, un aplat. `detoure`
propage depuis les bords et l'enleve sans toucher aux coquilles ; l'aplat n'a
pas de poche enfermee, contrairement au damier de la premiere enseigne.

On coupe aux CREUX et non au pas fixe : les oeufs n'ont ni la meme largeur ni
le meme ecart (celui de feu porte des flammes, celui de terre des feuilles qui
debordent), et une grille reguliere en trancherait la moitie.

Chaque oeuf part dans SON fichier plutot que sur une planche : ce sont des
objets d'inventaire, dessines un par un a des tailles differentes selon
l'endroit — la fiche, le sac, le sol. Une planche obligerait chaque endroit a
connaitre le numero de colonne de chaque oeuf.
"""
import planches as P
from PIL import Image

SC = '/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/'
NOMS = ['normal', 'glace', 'feu', 'terre', 'tenebre', 'legendaire']

im = P.detoure(SC + 'oeufs.png')
cases = P.grille(im, len(NOMS), 1)[0]
for c, nom in zip(cases, NOMS):
    c = P.nettoie(c)
    c = c.crop(P.boite(c, 24))
    chemin = 'img/nexus/objets/oeuf_%s.webp' % nom
    P.ecrit(c, chemin)
    print('%-34s %s' % (chemin.split('/')[-1], c.size))
