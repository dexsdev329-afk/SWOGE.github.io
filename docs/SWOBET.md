# $SWOBET — a quoi il sert, et ce qui est vrai aujourd'hui

Texte court, en anglais, pour le canal Telegram.

## Ce qui a ete LU SUR LA CHAINE, pas suppose

Releve au bloc 49 021 637 sur `rpc.mainnet.chain.robinhood.com`, en appelant
le launchpad V3 (`0xc16388e95dbbD37A679A7d507C174C7e34C5856E`) :

| | |
|---|---|
| jeton | `0xc0aEd547862fba5D7D9Fbf3cb14204cD756c8Bea` — nom `Swogebet` |
| somme de controle EIP-55 | **valide**, verifiee par le calcul |
| enregistre sur le launchpad V3 | **oui** (`instant().exists = true`) |
| pool | `0xc12943975def537daCe9D62D4762a8250501924E` |
| part des frais aux detenteurs | **70 %** (`HOLDER_SHARE_BPS`) |
| part au tresor | 30 % (`TREASURY_SHARE_BPS`) |
| recompenses payees en | `$SWOGE` (`swoge()` = `0x8a166Fb4…`) |
| distribution deja lancee ? | **oui** — `magPerShare` > 0 |
| dans la caisse des detenteurs | **13,75 $SWOGE** a reclamer (`reserve()`) |
| flottant | 665 255 632 jetons hors du pool (`shares()`) |
| jetons lances sur V3 | 1 — celui-ci est le premier |

**Ces chiffres bougent.** La caisse se remplit a chaque `collectFees` et se
vide quand un detenteur reclame. Les relire avant de les recopier ailleurs.

## Ce qui n'est PAS vrai aujourd'hui

**Le livre de paris ne touche pas a ce jeton.** Aucune page, aucune route du
serveur ne le lit ; les paris se reglent en `$SWOGE`. C'est pour ca que la
mecanique est ecrite au FUTUR dans le texte, et que la derniere ligne le dit.

Annoncer au present une mecanique qui n'existe pas est la seule chose qui
puisse couter la confiance d'un canal, et elle ne revient pas. Quand ce sera
branche : reprendre ce fichier, changer les temps, retirer la derniere ligne.

## Le texte a coller

> **What $SWOBET is for**
>
> $SWOBET is not a chart play. Buying it to trade it misses the point — and
> we would rather say so than let anyone find out the hard way.
>
> It has one job: to be the token the sportsbook runs on.
>
> Here is how it is meant to work. You deposit $SWOGE. You place your bet in
> $SWOGE. Behind the scenes the bet is carried in $SWOBET, and every
> conversion is done for you — you never touch it and never think about it.
>
> **Who ends up holding it, and why they stay.** Only people who bet. They
> buy it with $SWOGE, once, and then they get on with betting. Bettors are
> not traders: nobody who came here to back a football result is going to
> sit and rotate between two tokens every minute. They keep a balance
> because that is what a balance is for.
>
> And there is a reason to keep it: **70% of all trading fees on $SWOBET go
> to the people holding it, paid in $SWOGE.** Not a plan — it is in the
> launchpad contract, it has already started paying, and right now there are
> 13.75 $SWOGE sitting in the holders' pot waiting to be claimed. Selling
> your bankroll every day means handing that to someone else.
>
> **Why not just settle in $SWOGE?** Because then every stake and every
> payout goes straight through $SWOGE. A handful of bettors, nobody notices.
> A few thousand, and the betting flow becomes the price. With $SWOBET a
> bettor converts once on the way in and once on the way out, instead of a
> hundred times in between. The flow stays in the book, where it belongs.
>
> So nobody has to be talked into buying $SWOBET. If the book gets used,
> demand comes from the betting.
>
> **Status: not live yet.** Bets today are settled in $SWOGE. $SWOBET is
> deployed, tradeable, and already paying its holders — but the sportsbook
> does not use it yet. We will say so here the day it does.
