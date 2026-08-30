# Le courriel à Quick Intel

> **À envoyer APRÈS avoir vérifié la source sur Blockscout** (voir
> `VERIFIER-SWOGEBET.md`, §3). Sans source publiée, ils n'ont rien de neuf à
> relire et la demande retombe. Si la vérification n'a pas encore abouti,
> remplace la phrase du point 1 par : *« Source verification is in progress on
> the Blockscout instance; the launchpad that deploys this token is already
> verified and contains the same `SwogeToken` source. »*

Objet :

    Re-scan request — SWOGEBET (0xc0aEd547...8Bea, Robinhood Chain 4663) — false Mintable flag

---

Hello,

I am the deployer of **$SWOGEBET**, `0xc0aEd547862fba5D7D9Fbf3cb14204cD756c8Bea`
on Robinhood Chain (chain id 4663). Your audit is shown on the Dexscreener
page for this pair and I would like to ask for a re-scan, with the evidence
below.

I want to be straight about one thing first, because it is the honest reason
your scanner raises a flag at all: **the token does make an external call
inside its transfer function.** The last line of `_transfer` is
`ISwogeFun(fun).onMove(from, to, value)`. I understand that a transfer which
calls another contract is the shape of a honeypot and that a bytecode analyser
cannot tell that shape apart from a trap. I am not asking you to ignore it. I
am asking you to look at what it can and cannot do:

* it moves no tokens — it only updates a reward accounting mapping in the
  launchpad;
* it cannot make a transfer fail. `magPerShare` is capped at `MPS_MAX = 5e49`
  and `value` cannot exceed the supply (`1e27`), so the product is at most
  `5e76`, below the `5.79e76` limit of `int256`. The multiplication cannot
  overflow and the signed cast cannot flip sign. The only other branches are
  two early `return`s;
* it cannot be redirected: `fun` is `immutable`.

With that said, here are the four points I believe are wrong or misleading.

**1. Mintable — Yes.** There is no mint function of any kind. The contract has
**exactly 15 public functions**, listed in the appendix, taken from the
dispatcher in the deployed bytecode. `totalSupply` is written once in the
constructor and by nothing else: the only state-changing functions are
`transfer`, `approve`, `transferFrom` and `setPool`. Total supply has been
1,000,000,000 since deployment and cannot change.

**2. Ownership renounced — Unknown.** There has never been an owner. There is
no `owner()`, no `getOwner()`, no `transferOwnership`, no `renounceOwnership`,
no access-control modifier anywhere in the contract. I understand the scanner
looks for evidence of a renunciation and finds none — but the reason is that
there was never anything to renounce, which is a stronger position than
renounced ownership, not a weaker one.

**3. Buy tax / Sell tax — Unknown.** There is no fee variable, no fee
recipient and no fee setter in the contract. `_transfer` moves the exact
amount. Measured on chain: in transaction
`0x5a92c6e088ab5483e6028cb59f6f7ef9620664123eef24a60ae66e766be484ce`, the
amount `7222302.11833873415112374` passes through three wallets in a row,
identical to the last wei. A transfer tax would have reduced it at the first
hop.

Note for completeness: some trades do show a split further down the path,
around 0.875%. That is charged by a router contract (for example
`0xbdbae060cbab0e9cfe802a7513dd5ecb36cda6c3`) that has already received the
tokens and then forwards part of them. It is a front-end routing fee that
applies to any token routed through it, and it is not in the token contract.

**4. Has suspicious functions — Yes.** Beyond the nine standard ERC-20
functions, the contract has six others, and none of them is privileged:

* `fun()`, `pool()` — two read-only addresses.
* `launchBlock()`, `SNIPE_BLOCKS()`, `SNIPE_MAX_BPS()` — three read-only
  values, two of which are compile-time constants. They describe an
  anti-sniper cap that limited a wallet to 5% of supply for the **first two
  blocks after launch**. That window closed at block 25,856,743, more than
  24 million blocks ago, and cannot reopen: `launchBlock` is `immutable` and
  `SNIPE_BLOCKS` is `constant`.
* `setPool(address)` — callable once, at launch. It requires
  `msg.sender == fun && pool == address(0)`. `pool()` already returns
  `0xc12943975def537daCe9D62D4762a8250501924E`, so it reverts permanently, for
  everyone.

**Reproducing all of this.** The source is at
`https://github.com/dexsdev329-afk/SWOGE.github.io/blob/main/contrats/SwogeFunV3.sol`
(contract `SwogeToken`), and `contrats/preuve_jeton.js` in the same repository
reads the deployed bytecode from the public RPC and prints the complete
function list plus every check above. It takes one command and no API key:

    node contrats/preuve_jeton.js

The launchpad that deployed this token,
`0xc16388e95dbbD37A679A7d507C174C7e34C5856E`, is verified on the Robinhood
Chain Blockscout instance, and its verified source contains the same
`SwogeToken` contract.

I would be grateful if you could re-scan the token, and in particular correct
the **Mintable** flag, which I believe is a false positive. If the external
call keeps the "suspicious functions" flag raised, I understand — I would just
ask that the other four fields reflect what the bytecode actually contains.

Thank you for your time, and for the work — an automated audit that is
sceptical by default is a good thing for buyers. I am happy to answer anything
else, and to provide the compiler settings if that helps you reproduce the
build.

Best regards,

[ton nom]
SWOGE — https://swoleeswoge.dog

---

**Appendix — the complete public interface of `0xc0aEd547862fba5D7D9Fbf3cb14204cD756c8Bea`**
(function selectors read from the dispatcher of the deployed runtime bytecode,
2420 bytes)

    0x06fdde03  name()
    0x95d89b41  symbol()
    0x313ce567  decimals()
    0x18160ddd  totalSupply()
    0x70a08231  balanceOf(address)
    0xdd62ed3e  allowance(address,address)
    0xa9059cbb  transfer(address,uint256)
    0x095ea7b3  approve(address,uint256)
    0x23b872dd  transferFrom(address,address,uint256)
    0x946644cd  fun()                    read-only
    0x16f0115b  pool()                   read-only
    0x4437152a  setPool(address)         spent at launch, reverts for ever
    0xd00efb2f  launchBlock()            read-only, immutable
    0xf016d83b  SNIPE_BLOCKS()           constant = 2
    0xaa97e57b  SNIPE_MAX_BPS()          constant = 500

Not present anywhere in the bytecode: `owner`, `getOwner`,
`transferOwnership`, `renounceOwnership`, `mint`, `pause`, `unpause`,
`blacklist`, `whitelist`, any fee or tax setter, any max-transaction or
max-wallet setter, `enableTrading`, any proxy or upgrade function, any role
system.

    Compiler: solc 0.8.34+commit.80d5c536, optimizer enabled, 200 runs, EVM cancun
