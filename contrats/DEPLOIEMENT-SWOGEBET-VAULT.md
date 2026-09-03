# Deployer SwogeBetVault — le coffre des paris, en $SWOGEBET

> **Ce que ca change.** Une fois ce coffre deploye et son adresse posee sur
> Railway, la page SWOGE Bet depose, mise et retire **uniquement du
> $SWOGEBET**. Le solde $SWOGE du casino n'est plus jamais touche par un pari.
> Tant que l'adresse n'est pas posee, la page le dit (« the $SWOGEBET vault is
> not deployed yet ») et personne ne peut approvisionner un solde de paris.

Le contrat est `contrats/SwogeBetVault.sol`. Il n'a **aucun import** et se
compile seul. C'est le meme modele que le coffre $SWOGE (`SwogePusherVault`) :
depot par `deposit`, retrait par un bon EIP-712 signe par le serveur, cumul
par joueur. Son banc d'essai tourne sur une machine virtuelle :

    npm i solc@0.8.26 @ethereumjs/vm@8 @ethereumjs/common@4 @ethereumjs/util@9 @ethereumjs/block@5 ethers@5
    node contrats/banc_vault_swogebet.js

---

## 0. Ce qu'il te faut

- **Le reseau dans MetaMask** : Robinhood Chain, RPC
  `https://rpc.mainnet.chain.robinhood.com`, chain ID `4663`, symbole `ETH`,
  explorateur `https://robinhoodchain.blockscout.com`.
- **Du gaz** : ~0,002 ETH.
- **L'adresse du signataire du serveur.** C'est l'adresse de
  `SIGNER_PRIVATE_KEY` sur Railway — la meme cle que pour le coffre $SWOGE. Les
  logs du serveur l'affichent au demarrage : `signer=0x…`. Tu n'as PAS besoin
  de la cle privee, seulement de l'adresse.
- **Un peu de $SWOGEBET** pour la bankroll (etape 5). Les gains des joueurs
  sont payes par le coffre : s'il est vide, un bon signe ne peut pas etre
  encaisse.

---

## 1. Remix

<https://remix.ethereum.org> — cree `SwogeBetVault.sol` et colle tout le
contenu de `contrats/SwogeBetVault.sol`.

## 2. Compiler

- Compilateur **0.8.24 ou plus recent** (le fichier dit `^0.8.24`).
- **Optimizer : active, 200 runs.** Le banc compile avec ces reglages ; les
  reprendre ici rend la verification Blockscout immediate (partial match si
  la metadonnee differe, ce qui est normal).
- EVM version : **Cancun** (ou « default »).

## 3. Deployer — les trois valeurs du constructeur

| Champ | Valeur | Ne te trompe pas |
|---|---|---|
| `token_` | `0xc0aed547862fba5d7d9fbf3cb14204cd756c8bea` | le $SWOGEBET — **pas** le $SWOGE (`0x8a16…F817`). Un coffre deploye sur le mauvais jeton se redeploie, il ne se corrige pas : `token` est `immutable`. |
| `signer_` | l'adresse `signer=` des logs du serveur | Une autre adresse et **aucun bon ne sera jamais accepte**. Ca se change apres coup par `setSigner`, mais autant le poser juste. |
| `minWithdraw_` | `50000000000000000000` (= 50 $SWOGEBET, 18 decimales) | Doit valoir `BET_MIN_WITHDRAW` sur Railway (defaut `50`). Se change par `setMinWithdraw`. |

Environnement Remix : **Injected Provider — MetaMask**, sur Robinhood Chain.
Deploy, confirme, note l'adresse.

## 4. Verifier sur Blockscout

`https://robinhoodchain.blockscout.com/address/<adresse>` → **Verify &
publish** → Solidity (single file), meme version de compilateur, optimizer
200, colle le source. Une fois l'ABI publie, les onglets Read/Write Contract
marchent et un joueur peut encaisser un bon sans passer par le site.

## 5. La bankroll

Le coffre paie les gains avec ce qu'il detient. Approvisionne-le :

1. Sur le contrat $SWOGEBET (Blockscout → Write) : `approve(<coffre>, <montant>)`.
2. Sur le coffre : `ownerDeposit(<montant>)`.

`totalPot()` doit ensuite afficher le montant. Le panneau d'administration du
serveur dit ce que les joueurs peuvent reclamer ; garde toujours le pot
au-dessus.

## 6. Railway — les variables

| Variable | Valeur |
|---|---|
| `BET_VAULT_ADDRESS` | l'adresse deployee a l'etape 3 |
| `BET_MIN_WITHDRAW` | `50` (ou ce que tu as mis dans `minWithdraw_`, en jetons entiers) |
| `SWOGEBET_TOKEN` | inutile : le defaut est deja le $SWOGEBET |
| `BET_SCAN_FROM_BLOCK` | facultatif : le bloc du deploiement, pour re-crediter des depots faits avant le premier demarrage |

Redeploie le serveur. Les logs doivent montrer le coffre des paris suivi ;
`hello` porte alors `betVault` et la page SWOGE Bet bascule d'elle-meme sur le
$SWOGEBET.

## 7. Verifier de bout en bout, avec un petit montant

1. Sur SWOGE Bet, **Deposit** : la page lit ton $SWOGEBET, `approve` puis
   `deposit`. Quelques secondes plus tard, « Deposit credited » et le solde
   en haut passe en $SWOGEBET.
2. Pose un pari : le solde $SWOGEBET baisse ; le solde $SWOGE du casino ne
   bouge pas.
3. **Withdraw** : le serveur signe un bon, MetaMask confirme, le coffre paie.
   Presente le meme bon une seconde fois : il ne paie rien (`nothing due`).

## Ce que le proprietaire peut faire, et rien d'autre

`setSigner`, `setMinWithdraw`, `setDepositsPaused`, `setWithdrawalsPaused`,
`ownerDeposit`, `ownerWithdraw`, `transferOwnership`. Il ne peut ni toucher au
cumul d'un joueur, ni signer a la place du serveur. Un bon signe pour le
coffre $SWOGE ne vaut rien ici : le nom du domaine (`SwogeBetVault`) et
l'adresse du contrat entrent dans la signature.
