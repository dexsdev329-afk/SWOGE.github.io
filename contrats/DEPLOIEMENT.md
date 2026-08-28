# Deployer SwogeFunV3 — fiche a suivre ligne par ligne

> **Ce contrat n'a pas de proprietaire et ne peut pas etre modifie.**
> Les quatre valeurs du constructeur sont gravees pour toujours. Relis-les
> avant de cliquer : une erreur ici ne se repare pas, elle se redeploie — et
> tout jeton deja lance sur l'ancien reste sur l'ancien.

---

## 0. Ce qu'il te faut avant de commencer

- **Le reseau dans MetaMask** (a ajouter s'il n'y est pas) :

      Nom            Robinhood Chain
      RPC            https://rpc.mainnet.chain.robinhood.com
      Chain ID       4663
      Symbole        ETH
      Explorateur    https://robinhoodchain.blockscout.com

- **Du gaz.** Le deploiement coute de l'ordre de 0,002 ETH sur cette chaine
  (le gaz y vaut ~0,06 gwei). Quelques dollars d'ETH suffisent largement.
- **Tu n'as PAS besoin de $SWOGE pour deployer.** Le $SWOGE ne sert qu'a
  *lancer un jeton* ensuite (10 000 par lancement).

---

## 1. Ouvrir Remix

<https://remix.ethereum.org>

Cree un fichier `SwogeFunV3.sol` et **colle dedans tout le contenu de
`contrats/SwogeFunV3.sol`** de ce depot.

Le fichier ne contient **aucun `import`** : il se compile seul, il n'y a rien
d'autre a copier.

---

## 2. Compiler — les reglages comptent

Onglet **Solidity Compiler** :

| reglage | valeur |
|---|---|
| Compiler | **0.8.34** |
| Optimization | **Enabled**, **200** runs |
| EVM Version | **cancun** |

`cancun` n'est pas un detail : c'est la version sur laquelle le contrat a ete
eprouve sur un fork de la vraie chaine. En `shanghai` ou plus ancien, le
bytecode change et n'a jamais ete essaye.

Resultat attendu : **0 erreur, 0 avertissement**, ~**13 475 octets**.

> **L'optimiseur est sous « Advanced Configurations », replie par defaut.**
> Deplie-le et coche-le. Sans lui le contrat fait **23 766 octets** : il passe
> de justesse sous la limite de 24 576, mais la verification Blockscout ne
> correspondra pas et chaque lancement coute plus de gaz. La taille est le
> moyen le plus simple de savoir si tu as oublie —
> **13 475 = optimise, 23 766 = pas optimise.**

---

## 3. Deployer

Onglet **Deploy & Run** :

1. **Environment** : `Injected Provider - MetaMask`
2. Verifie que MetaMask est bien sur **Robinhood Chain (4663)**
3. Contract : **SwogeFunV3**
4. Deplie la fleche a cote du bouton **Deploy** et remplis les quatre champs
   **dans cet ordre** :

```
_POSITIONMANAGER   0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3
_SWOGE             0x8a166Fb41Cd659a0a43396272FF73973Ce29F817
_TREASURY          0x6229DDF7c8Ed3A194819aF2e68f5de2Dc31e7F30
_CREATIONFEE       10000000000000000000000
```

> ### LE PIEGE QUI A DEJA COUTE UN DEPLOIEMENT
>
> **`_POSITIONMANAGER` et `_SWOGE` sont DEUX adresses differentes.**
> La premiere commence par `0x7399...`, la seconde par `0x8a16...`.
>
> Au premier essai, la meme adresse a ete collee dans les deux champs. Le
> contrat a compile, s'est deploye, et repondait a toutes les lectures — il
> avait l'air parfaitement sain. Mais son jeton de paiement etait le
> gestionnaire de positions NFT : **`createToken` revertait a tous les coups,
> pour toujours**, et il n'existe aucun setter pour reparer.
>
> Colle-les une par une, puis **relis les deux lignes a l'ecran** avant de
> cliquer. Rien dans Remix ne te previendra.

> `_CREATIONFEE` est en **wei** : ces 22 zeros font 10 000 $SWOGE.
> N'ecris pas `10000`, ce serait 10 000 wei, soit un frais nul.

5. **Deploy**, puis confirme dans MetaMask.
6. **Copie l'adresse du contrat deploye.**

### Les trois adresses, verifiees

Somme de controle EIP-55 **valide** pour les trois (verifiee par le calcul).
Sur la chaine : le gestionnaire de positions et le $SWOGE sont bien des
**contrats**, le tresor est bien un **portefeuille** — c'est ce qu'il faut,
un contrat sans fonction de retrait y bloquerait 30 % des frais pour toujours.

---

## 3 bis. VERIFIER LE DEPLOIEMENT — avant tout le reste

**Ne branche rien, n'annonce rien tant que ceci n'est pas vert.**

    node contrats/verifier_deploiement.js 0xTON_ADRESSE

Le script relit sur la chaine les quatre valeurs immuables, verifie que
`positionManager` et `swoge` sont bien **differents**, que le jeton de paiement
repond bien `SWOGE` et pas autre chose, que l'optimiseur etait actif (a la
taille du bytecode), et **simule un lancement** pour prendre un mauvais cablage
avant qu'un utilisateur ne le fasse.

Attendu :

    AUCUN ECART. Ce deploiement peut etre branche dans launchpad.html.

S'il affiche des ecarts, le contrat est a jeter : **il n'a pas de setter, rien
ne se repare.** Redeploie, et reverifie.

---

## 4. Brancher la page

Une seule ligne a changer dans `launchpad.html` (ligne ~784) :

```js
var V3_ADDRESS = window.SWOGEFUN_V3_ADDRESS || "";
```

devient

```js
var V3_ADDRESS = window.SWOGEFUN_V3_ADDRESS || "0xTON_ADRESSE_ICI";
```

C'est tout. Le reste de la page est deja cable : le formulaire s'active,
le frais se lit sur le contrat, l'achat et la vente passent en $SWOGE.
`launchpad.html` n'est pas dans `version.json` — **aucun marqueur de cache a
bousculer.**

---

## 5. Verifier le contrat sur Blockscout

<https://robinhoodchain.blockscout.com> -> ton adresse -> **Verify & Publish**

- Methode : **Solidity (Single file)**
- Compiler : `v0.8.34+commit.80d5c536`
- Optimization : **Yes**, 200 runs
- EVM Version : **cancun**
- Colle le meme fichier source
- **Arguments du constructeur encodes (ABI-encoded)** :

```
00000000000000000000000073991a25c818bf1f1128deaab1492d45638de0d30000000000000000000000008a166fb41cd659a0a43396272ff73973ce29f8170000000000000000000000006229ddf7c8ed3a194819af2e68f5de2dc31e7f3000000000000000000000000000000000000000000000021e19e0c9bab2400000
```

Verifier n'est pas cosmetique : sans source publiee, personne ne peut
constater qu'il n'y a **ni proprietaire, ni setter, ni porte de sortie**. Sur
un launchpad, c'est tout l'argument.

---

## 6. Le premier lancement, a faire toi-meme

Avant d'annoncer quoi que ce soit :

1. Aie **au moins 10 000 $SWOGE** dans le portefeuille.
2. Sur la page, onglet **Create**, lance un jeton bidon.
3. Il y a **deux transactions** : l'autorisation du $SWOGE, puis le lancement.
4. Verifie ensuite, sur l'explorateur ou sur la page :
   - le pool existe et apparait sur DexScreener ;
   - **tu n'as recu aucun jeton** (c'est voulu — l'offre entiere est dans le pool) ;
   - 10 000 $SWOGE sont partis en fumee vers `0x…dEaD`.
5. Achete un peu de ton propre jeton, puis **Collect fees** : 30 % doivent
   partir au tresor, 70 % rester en retenue tant que le flottant est sous 1 %.

Si l'un de ces points ne se comporte pas comme ecrit, **n'annonce rien** et
reviens vers moi avec le hash de la transaction.

---

## Ce que ce deploiement ne resout pas

- **Aucune relecture humaine.** Deux audits adversariaux et un banc sur fork
  (41 verifications) ne remplacent pas un lecteur.
- Le banc tourne a **un seul bloc, un chemin nominal, un portefeuille**.
- Le frais est **immuable** : 10 000 $SWOGE valent ~0,30 $ aujourd'hui, ~30 $
  si le $SWOGE fait x100.
- L'adresse du tresor est **immuable** : si la cle est perdue, 30 % de tous
  les frais y vont pour toujours.
