"""La porte rouge, et son enseigne.

Les deux dessins arrivent en JPEG avec le damier de transparence DESSINE
dedans : il faut le retirer, pas se fier a un canal alpha qui n'existe pas.
`detoure` propage depuis les BORDS — un damier pris au piege entre les
maillons de la chaine ne touche aucun bord, et c'est la passe des poches
enfermees qui s'en occupe.

---- POURQUOI ON RECADRE SUR UNE BOITE SEUILLEE ----

Les objets du Nexus sont ancres PAR LES PIEDS : la page les dessine a
`y - haut`. Une seule rangee de pixels a alpha 1 sous le socle — un reste de
bavure JPEG que `detoure` n'a pas juge assez pur pour l'effacer — decalerait
le portail vers le haut et il flotterait au-dessus du dallage. `boite` ignore
donc tout ce qui est sous le seuil.
"""
import planches as P

CIBLES = [
    ('/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/p2.jpg',
     'img/nexus/tiles/obj_portal_pvp.webp'),
    ('/tmp/claude-0/-home-user/118d9ef2-eea7-5e85-9073-c9373d1a7fd3/scratchpad/p1.jpg',
     'img/nexus/tiles/obj_portal_pvp_sign.webp'),
]

for source, sortie in CIBLES:
    im = P.detoure(source)
    im = im.crop(P.boite(im, 24))
    P.ecrit(im, sortie)
    print('%-42s %s  ratio %.3f' % (sortie, im.size, im.size[0] / im.size[1]))
