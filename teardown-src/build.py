#!/usr/bin/env python3
"""
Le teardown, dans les deux langues, francais par defaut.

Meme machinerie que le white paper — une seule adresse, une bascule instantanee,
le choix retenu. Deux differences assumees :

  · le DEFAUT est le francais. Le white paper vise des partenaires, ce document
    est un outil de travail ;
  · la CLE de memorisation est la meme que celle du white paper. Un choix
    explicite vaut donc pour les deux documents ; en son absence, chacun garde
    sa langue de depart.
"""
import re, pathlib
BAC = pathlib.Path(__file__).resolve().parent
fr = (BAC / 'fr.html').read_text()
en = (BAC / 'en.html').read_text()
src = (BAC / 'chrome.html').read_text()   # ne sert qu a fournir le <style>

def morceaux(t):
    return (re.search(r'<nav class="toc".*?</nav>', t, re.S).group(0),
            re.search(r'<main.*?</main>', t, re.S).group(0))

fr_toc, fr_main = morceaux(fr)
en_toc, en_main = morceaux(en)
en_toc = en_toc.replace('<nav class="toc"', '<nav class="toc" data-l="en"', 1)
en_main = en_main.replace('<main>', '<main data-l="en">', 1)

def prefixe(bloc, l):
    """Les deux versions portent les memes ancres. Deux elements de meme
       identifiant, c'est du HTML invalide, et le navigateur saute sur le
       PREMIER — donc parfois sur celui qui est cache."""
    bloc = re.sub(r'id="([a-z0-9]+)"', lambda m: 'id="%s-%s"' % (l, m.group(1)), bloc)
    return re.sub(r'href="#([a-z0-9]+)"', lambda m: 'href="#%s-%s"' % (l, m.group(1)), bloc)

fr_toc, fr_main = prefixe(fr_toc, 'fr'), prefixe(fr_main, 'fr')
en_toc, en_main = prefixe(en_toc, 'en'), prefixe(en_main, 'en')

CSS = '''
/* ---- la bascule de langue ----
   Sans attribut (script en echec, ou avant qu'il tourne) on est en francais :
   la regle « pas d'anglais » couvre les deux cas d'un coup. */
:root:not([data-lang="en"]) [data-l="en"]{display:none}
:root[data-lang="en"] [data-l="fr"]{display:none}
.langbtn{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;
  font-family:var(--mono);flex:0 0 auto}
.langbtn button{appearance:none;border:0;cursor:pointer;padding:6px 11px;font-family:inherit;
  font-size:11.5px;font-weight:700;letter-spacing:.06em;color:var(--muted);background:transparent}
.langbtn button+button{border-left:1px solid var(--line)}
.langbtn button:hover{color:var(--ink)}
.langbtn button.on{color:var(--ground);background:var(--gold)}
.langtop{display:flex;justify-content:flex-end;padding:18px 22px 0;max-width:1180px;margin:0 auto}
@media (min-width:1060px){.langtop{padding:18px 32px 0}}
'''

# ATTENTION : les boutons ne portent PAS data-l — c'est l'attribut qui cache
# l'autre langue, et un bouton data-l="en" se cacherait lui-meme par defaut.
BTN = ('<div class="langbtn" role="group" aria-label="Langue">'
       '<button type="button" data-set="fr" aria-pressed="true">FR</button>'
       '<button type="button" data-set="en" aria-pressed="false">EN</button></div>')

TOT = '''<script>
(function(){try{var l=localStorage.getItem("swogeWpLang");
document.documentElement.setAttribute("data-lang",(l==="fr"||l==="en")?l:"fr");}
catch(e){document.documentElement.setAttribute("data-lang","fr");}})();
</script>'''

TARD = '''<script>
(function(){
  var CLE="swogeWpLang";
  function pose(l,garderLaPlace){
    var avant=document.documentElement.getAttribute("data-lang")||"fr";
    document.documentElement.setAttribute("data-lang",l);
    document.documentElement.lang=l;
    try{localStorage.setItem(CLE,l);}catch(e){}
    [].forEach.call(document.querySelectorAll(".langbtn button"),function(b){
      var on=b.getAttribute("data-set")===l;
      b.classList.toggle("on",on); b.setAttribute("aria-pressed",on?"true":"false");
    });
    /* #fr-s17 devient #en-s17 : sans ca, changer de langue au milieu de
       trente-deux sections renvoie en haut de page. */
    if(garderLaPlace && avant!==l && location.hash){
      var h=location.hash.replace(/^#(en|fr)-/,"#"+l+"-");
      if(h!==location.hash){ location.replace(h); }
    }
  }
  var d="fr";
  try{var s=localStorage.getItem(CLE); if(s==="fr"||s==="en") d=s;}catch(e){}
  pose(d,false);
  document.addEventListener("click",function(e){
    var n=e.target;
    while(n && n!==document){ if(n.tagName==="BUTTON" && n.parentNode &&
      n.parentNode.className==="langbtn"){ pose(n.getAttribute("data-set"),true); return; } n=n.parentNode; }
  });
})();
</script>'''

tete = src.split('</style>', 1)[0]
page = (tete + CSS + '</style>\n' + TOT + '\n<div class="langtop">' + BTN + '</div>\n'
        + '<div class="shell">\n' + fr_toc + '\n' + en_toc + '\n'
        + fr_main + '\n' + en_main + '\n</div>\n' + TARD + '\n')
(BAC / 'artifact.html').write_text(page)
print('teardown bilingue : %.0f Ko' % (len(page) / 1024))
