#!/usr/bin/env python3
"""
Fabrique les deux versions du white paper a partir des deux sources de contenu.

  whitepaper-src/artifact.html   la version hebergee, avec sa propre chrome
  ../whitepaper.html             la page du site, avec la barre du site

Les DEUX sortent de fr.html et en.html. On ne modifie jamais le fichier
fabrique : on modifie la source de la langue concernee et on relance

    python3 whitepaper-src/build.py

Le meme document porte les DEUX langues dans le DOM, et une regle CSS en cache
une. C'est ce qui donne une seule adresse, une bascule instantanee et le choix
retenu d'une visite a l'autre.

Le piege : les deux versions portent les memes ancres (#s17). Deux elements de
meme identifiant dans une page, c'est du HTML invalide, et le navigateur saute
sur le PREMIER — donc parfois sur celui qui est cache. Les identifiants sont
donc prefixes par la langue, et la bascule traduit l'ancre courante pour garder
le lecteur a sa place.
"""
import re, sys, pathlib

ICI  = pathlib.Path(__file__).resolve().parent      # whitepaper-src/
SITE = ICI.parent

# ---------------------------------------------------------------- les sources
# La source francaise vit dans wp-fr.html ; swoge-whitepaper.html est la
# SORTIE publiee, et l ecraser avec sa propre sortie casserait la
# fabrication suivante.
fr_src = (ICI / 'fr.html').read_text()
en_src = (ICI / 'en.html').read_text()

def morceaux(txt):
    toc = re.search(r'<nav class="toc".*?</nav>', txt, re.S).group(0)
    main = re.search(r'<main.*?</main>', txt, re.S).group(0)
    return toc, main

fr_toc, fr_main = morceaux(fr_src)
en_toc, en_main = morceaux(en_src)

# le francais n'est pas encore marque
fr_toc = fr_toc.replace('<nav class="toc"', '<nav class="toc" data-l="fr"', 1)
if 'data-l' not in fr_main[:40]:
    fr_main = fr_main.replace('<main>', '<main data-l="fr">', 1)

def prefixe(bloc, l):
    """Prefixe les identifiants et les ancres internes par la langue."""
    bloc = re.sub(r'id="(s\d+|resume)"', lambda m: 'id="%s-%s"' % (l, m.group(1)), bloc)
    bloc = re.sub(r'href="#(s\d+|resume)"', lambda m: 'href="#%s-%s"' % (l, m.group(1)), bloc)
    return bloc

fr_toc, fr_main = prefixe(fr_toc, 'fr'), prefixe(fr_main, 'fr')
en_toc, en_main = prefixe(en_toc, 'en'), prefixe(en_main, 'en')

# ---------------------------------------------------------------- le commutateur
CSS_LANGUE = '''
/* ---- la bascule de langue ----
   Sans attribut (script en echec, ou avant qu'il tourne) on est en anglais :
   la regle « pas de fr » couvre les deux cas d'un coup. */
:root:not([data-lang="fr"]) [data-l="fr"]{display:none}
:root[data-lang="fr"] [data-l="en"]{display:none}
.langbtn{display:inline-flex;gap:0;border:1px solid var(--line);border-radius:8px;
  overflow:hidden;font-family:var(--mono);flex:0 0 auto}
.langbtn button{
  appearance:none;border:0;cursor:pointer;padding:6px 11px;
  font-family:inherit;font-size:11.5px;font-weight:700;letter-spacing:.06em;
  color:var(--muted);background:transparent;
}
.langbtn button+button{border-left:1px solid var(--line)}
.langbtn button:hover{color:var(--ink)}
.langbtn button.on{color:var(--ground);background:var(--gold)}
'''

# ATTENTION : les boutons ne portent pas data-l. C est l attribut qui cache le
# contenu de l autre langue — un bouton data-l="fr" se cacherait lui-meme des
# qu on est en anglais, c est-a-dire par defaut. Ils portent data-set.
BOUTONS = ('<div class="langbtn" role="group" aria-label="Language">'
           '<button type="button" data-set="en" aria-pressed="true">EN</button>'
           '<button type="button" data-set="fr" aria-pressed="false">FR</button>'
           '</div>')

# Il tourne AVANT le rendu : autrement on verrait le francais clignoter chez qui
# a choisi l'anglais, ou l'inverse.
JS_TOT = '''<script>
(function(){try{var l=localStorage.getItem("swogeWpLang");
document.documentElement.setAttribute("data-lang",(l==="fr"||l==="en")?l:"en");}
catch(e){document.documentElement.setAttribute("data-lang","en");}})();
</script>'''

JS_TARD = '''<script>
(function(){
  var CLE="swogeWpLang";
  function pose(l,garderLaPlace){
    var avant=document.documentElement.getAttribute("data-lang")||"en";
    document.documentElement.setAttribute("data-lang",l);
    document.documentElement.lang=l;
    try{localStorage.setItem(CLE,l);}catch(e){}
    [].forEach.call(document.querySelectorAll(".langbtn button"),function(b){
      var on=b.getAttribute("data-set")===l;
      b.classList.toggle("on",on); b.setAttribute("aria-pressed",on?"true":"false");
    });
    /* On garde le lecteur ou il etait : #en-s17 devient #fr-s17. Sans ca, changer
       de langue au milieu d'un document de quarante sections renvoie en haut. */
    if(garderLaPlace && avant!==l && location.hash){
      var h=location.hash.replace(/^#(en|fr)-/,"#"+l+"-");
      if(h!==location.hash){ location.replace(h); }
    }
  }
  var d="en";
  try{var s=localStorage.getItem(CLE); if(s==="fr"||s==="en") d=s;}catch(e){}
  pose(d,false);
  document.addEventListener("click",function(e){
    var n=e.target;
    while(n && n!==document){ if(n.tagName==="BUTTON" && n.parentNode &&
      n.parentNode.className==="langbtn"){ pose(n.getAttribute("data-set"),true); return; } n=n.parentNode; }
  });
})();
</script>'''

CORPS = ('<div class="shell">\n' + en_toc + '\n' + fr_toc + '\n'
         + en_main + '\n' + fr_main + '\n</div>\n')

# ================================================================ 1) l artifact
tete_art = fr_src.split('</style>', 1)[0]           # <title> + tout le <style>
tete_art = tete_art.replace('<title>Swole Doge Protocol</title>',
                            '<title>Swole Doge Protocol</title>')
art = (tete_art + CSS_LANGUE + '''
/* le commutateur, pose en haut a droite du document */
.langtop{display:flex;justify-content:flex-end;padding:18px 22px 0;max-width:1180px;margin:0 auto}
@media (min-width:1040px){.langtop{padding:18px 32px 0}}
</style>
''' + JS_TOT + '\n<div class="langtop">' + BOUTONS + '</div>\n' + CORPS + JS_TARD + '\n')
(ICI / 'artifact.html').write_text(art)

# ================================================================ 2) le site
site_src = (ICI / 'chrome-site.html').read_text()
tete_site = site_src.split('</style>', 1)[0]
# la barre du site, jusqu a la fermeture du div
barre = re.search(r'<div class="sitenav">.*?</div>\s*\n', site_src, re.S).group(0)
barre = barre.replace('<a class="buy"', BOUTONS + '\n  <a class="buy"', 1)

site = (tete_site + CSS_LANGUE + '''
.sitenav .langbtn{margin-left:4px}
.sitenav .langbtn button{padding:6px 10px;font-size:11px}
@media (max-width:640px){.sitenav .langbtn{margin-left:auto}}
</style>
</head>
<body>
''' + JS_TOT + '\n' + barre + CORPS + JS_TARD + '\n</body>\n</html>\n')
(SITE / 'whitepaper.html').write_text(site)

print('artifact : %.0f Ko' % (len(art) / 1024))
print('site     : %.0f Ko' % (len(site) / 1024))
