"""Petworld : la ferme et son enseigne.

Les deux dessins arrivent avec un vrai canal alpha — pas de damier a retirer,
contrairement a la premiere enseigne rouge. On ne detoure donc PAS : detourer
ce qui est deja detoure ne peut que manger un contour.

---- POURQUOI ON RECADRE SUR UNE BOITE SEUILLEE ----

Les objets du Nexus sont ancres PAR LES PIEDS : la page les dessine a
`y - haut`. Une seule rangee de pixels a alpha 1 sous la cloture — un reste de
degrade du generateur — decalerait la ferme vers le haut et elle flotterait
au-dessus du dallage. `boite` ignore tout ce qui est sous le seuil.
"""
import planches as P

CIBLES = [
    ('/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/f2.png',
     'img/nexus/tiles/obj_petworld.webp'),
    ('/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/f1.png',
     'img/nexus/tiles/obj_petworld_sign.webp'),
]

for source, sortie in CIBLES:
    from PIL import Image
    im = Image.open(source).convert('RGBA')
    im = im.crop(P.boite(im, 24))
    P.ecrit(im, sortie)
    print('%-40s %s  ratio %.3f' % (sortie, im.size, im.size[0] / im.size[1]))
