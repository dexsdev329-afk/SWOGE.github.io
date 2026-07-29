
<!DOCTYPE html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$SWOGE FUN — Instant DexScreener launchpad</title>
<meta name="description" content="Launch a token straight onto a Uniswap v3 pool on Robinhood Chain — visible on DexScreener instantly. No liquidity needed. 1% trade fee: 70% creator / 30% SWOGE.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.13.3/dist/index.umd.js"></script>
<style>
:root{--cream:#F7EEDA;--dim:#A08a63;--fur:#EAD2A0;--gold:#E6A537;--goldlite:#F2C25A;--line:#2E2213;--void:#0B0906;--void2:#15100A;--signal:#6FD1C4;--danger:#E2635E;--ink:#1a1206}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--void);color:var(--cream);font-family:'Archivo',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body{min-height:100vh;background:radial-gradient(circle at 22% 8%,rgba(230,165,55,.14),transparent 42%),radial-gradient(circle at 88% 92%,rgba(230,165,55,.08),transparent 45%),var(--void)}
a{color:var(--gold);text-decoration:none}
.wrap{max-width:820px;margin:0 auto;padding:22px 16px 90px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.brand{display:flex;align-items:center;gap:11px}
.brand .logo{width:44px;height:44px;border-radius:11px;border:1px solid var(--line)}
.brand h1{font-family:'Anton',sans-serif;font-size:clamp(22px,4vw,34px);line-height:.95}
.brand h1 span{color:var(--gold)}
.brand .sub{font-family:'Space Mono',monospace;font-size:11px;color:var(--dim);letter-spacing:2px;text-transform:uppercase}
nav{display:flex;gap:8px;flex-wrap:wrap}
nav a,.walletbtn{font-family:'Space Mono',monospace;font-size:12px;padding:8px 12px;border:1px solid var(--line);border-radius:999px;color:var(--fur);cursor:pointer;background:transparent}
nav a:hover,.walletbtn:hover{border-color:var(--gold);color:var(--gold)}
.tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.tab{font-family:'Space Mono',monospace;font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:10px 16px;border:1px solid var(--line);border-radius:11px;background:var(--void2);color:var(--dim);cursor:pointer}
.tab.on{background:var(--gold);color:var(--ink);border-color:var(--gold)}
.panel{background:var(--void2);border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:16px;box-shadow:0 14px 36px rgba(0,0,0,.4)}
.panel h2{font-family:'Space Mono',monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);margin-bottom:14px}
label{display:block;font-family:'Space Mono',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--dim);margin:0 0 6px}
input,select{width:100%;font-family:'Archivo',sans-serif;font-weight:600;font-size:15px;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--void);color:var(--cream);outline:none}
input:focus,select:focus{border-color:var(--gold)}
.field{margin-bottom:13px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:560px){.two{grid-template-columns:1fr}}
.btn{font-family:'Archivo',sans-serif;font-weight:800;font-size:14px;padding:12px 15px;border-radius:11px;border:1px solid var(--line);background:var(--void2);color:var(--cream);cursor:pointer;transition:.15s;display:inline-flex;align-items:center;gap:7px;justify-content:center}
.btn:hover{border-color:var(--gold);color:var(--gold)}
.btn.primary{background:var(--gold);color:var(--ink);border-color:var(--gold)}
.btn.primary:hover{background:var(--goldlite)}
.btn.buy{background:rgba(111,209,196,.14);border-color:rgba(111,209,196,.5);color:var(--signal)}
.btn.sell{background:rgba(226,99,94,.12);border-color:rgba(226,99,94,.5);color:var(--danger)}
.btn.full{width:100%}.btn:disabled{opacity:.45;cursor:not-allowed}
.btnrow{display:flex;gap:10px;flex-wrap:wrap}
.seg{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.seg button{flex:1;font-family:'Space Mono',monospace;font-size:12px;padding:10px;background:transparent;color:var(--dim);border:0;cursor:pointer}
.seg button.on{background:var(--gold);color:var(--ink)}
.presets button{font-family:'Space Mono',monospace;font-size:11px;padding:5px 10px;border:1px solid var(--line);background:var(--void);color:var(--fur);border-radius:8px;cursor:pointer}
.presets button:hover{border-color:var(--gold);color:var(--gold)}
.socials{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
.socials a{font-family:'Space Mono',monospace;font-size:11px;padding:5px 10px;border:1px solid var(--line);border-radius:999px;color:var(--fur)}
.socials a:hover{border-color:var(--gold);color:var(--gold)}
.tlogo{width:40px;height:40px;border-radius:9px;object-fit:cover;border:1px solid var(--line);flex:0 0 auto;background:var(--void)}
.tlogo.big{width:52px;height:52px;border-radius:11px}
.wpick{position:fixed;inset:0;background:rgba(0,0,0,.62);display:none;align-items:center;justify-content:center;z-index:70;padding:16px}
.wpick.show{display:flex}
.wpick .box{background:var(--void2);border:1px solid var(--line);border-radius:16px;padding:18px;width:min(360px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.6)}
.wpick h3{font-family:'Anton',sans-serif;font-size:20px;margin-bottom:14px}
.wpick .wrow{display:flex;align-items:center;gap:12px;padding:12px 13px;border:1px solid var(--line);border-radius:11px;margin-bottom:8px;cursor:pointer;background:var(--void);transition:.12s}
.wpick .wrow:hover{border-color:var(--gold)}
.wpick .wrow img{width:28px;height:28px;border-radius:7px}
.wpick .wrow .wdot{width:28px;height:28px;border-radius:7px;background:var(--gold);display:inline-block}
.wpick .wrow span{font-family:'Archivo',sans-serif;font-weight:700;font-size:14px}
.wpick .cancel{text-align:center;color:var(--dim);font-family:'Space Mono',monospace;font-size:12px;cursor:pointer;padding:8px;margin-top:4px}
.wpick .cancel:hover{color:var(--gold)}
.note{font-family:'Space Mono',monospace;font-size:12px;color:var(--dim);line-height:1.6;margin-top:8px;word-break:break-word}
.note.ok{color:var(--signal)}.note.err{color:var(--danger)}
.hidden{display:none}
.prog{height:12px;border-radius:99px;background:var(--void);border:1px solid var(--line);overflow:hidden;margin:8px 0}
.prog>span{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--goldlite));width:0}
.card{background:var(--void);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer;transition:.15s}
.card:hover{border-color:var(--gold)}
/* explore grid (pro card layout) */
.tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
@media(max-width:420px){.tgrid{grid-template-columns:repeat(2,1fr);gap:10px}}
.tcard{background:var(--void);border:1px solid var(--line);border-radius:14px;padding:9px;cursor:pointer;transition:.15s;position:relative}
.tcard:hover{border-color:var(--gold);transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.35)}
.thumbwrap{position:relative;width:100%;aspect-ratio:1;border-radius:11px;overflow:hidden;border:1px solid var(--line)}
.thumb{width:100%;height:100%}
.thumb.ph{display:flex;align-items:center;justify-content:center;font-family:'Anton',sans-serif;font-size:34px;color:var(--gold);background:linear-gradient(135deg,#1c1409,#2E2213)}
.thumb.ov{position:absolute;inset:0;object-fit:cover}
.tcard .tnm{font-family:'Anton',sans-serif;font-size:16px;margin-top:8px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tcard .tsy{font-family:'Space Mono',monospace;font-size:11px;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tcard .tmc{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--signal);margin-top:5px}
.tcard .tmc small{color:var(--dim);font-weight:400;font-size:10px}
.tcard .tgrad{position:absolute;top:13px;left:13px;font-family:'Space Mono',monospace;font-size:9px;padding:2px 6px;border-radius:6px;background:rgba(11,9,6,.75);color:var(--signal);border:1px solid rgba(111,209,196,.4)}
.tcard .tdex{position:absolute;top:13px;right:13px;width:26px;height:26px;border-radius:8px;background:rgba(11,9,6,.8);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:13px}
.tcard .tdex:hover{border-color:var(--gold)}
.sortseg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.sortseg button{font-family:'Space Mono',monospace;font-size:11px;padding:7px 11px;background:transparent;color:var(--dim);border:0;cursor:pointer;white-space:nowrap}
.sortseg button.on{background:var(--gold);color:var(--ink)}
.count{font-family:'Space Mono',monospace;font-size:11px;color:var(--dim);background:var(--void);border:1px solid var(--line);border-radius:999px;padding:3px 10px;margin-left:8px;vertical-align:middle}
.card .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.card .nm{font-family:'Anton',sans-serif;font-size:18px}
.card .sy{font-family:'Space Mono',monospace;font-size:12px;color:var(--gold)}
.card .meta{font-family:'Space Mono',monospace;font-size:11px;color:var(--dim);word-break:break-all;margin-top:4px}
.badge{font-family:'Space Mono',monospace;font-size:10px;padding:3px 8px;border-radius:999px;border:1px solid var(--line);color:var(--fur)}
.badge.grad{color:var(--signal);border-color:rgba(111,209,196,.5)}
.spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(230,165,55,.3);border-top-color:var(--gold);border-radius:50%;animation:sp .7s linear infinite;vertical-align:-2px}
@keyframes sp{to{transform:rotate(360deg)}}
.kv{display:flex;justify-content:space-between;gap:10px;font-family:'Space Mono',monospace;font-size:12px;padding:6px 0;border-bottom:1px solid var(--line)}
.kv .k{color:var(--dim)}.kv .v{color:var(--cream);text-align:right;word-break:break-all}
.warn{border:1px solid rgba(226,99,94,.5);background:rgba(226,99,94,.08);border-radius:12px;padding:11px 13px;font-size:12.5px;line-height:1.5;margin-bottom:16px}
.warn b{color:var(--danger)}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:var(--gold);color:var(--ink);font-family:'Archivo';font-weight:800;padding:12px 20px;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:.25s;z-index:60}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.foot{margin-top:24px;text-align:center;font-family:'Space Mono',monospace;font-size:11px;color:var(--dim)}
</style>

<div class="wrap">
  <header>
    <div class="brand">
      <img class="logo" id="logo" alt="SWOGE">
      <div>
        <h1><span>$SWOGE</span> FUN</h1>
        <div class="sub">Launchpad · Curve or Instant · Robinhood Chain</div>
      </div>
    </div>
    <nav>
      <a href="index.html">← Home</a>
      <button class="walletbtn" id="walletBtn">Connect wallet</button>
    </nav>
  </header>

  <img id="heroBanner" alt="SWOGE FUN — instant launches" style="display:none;width:100%;border-radius:16px;border:1px solid var(--line);margin-bottom:16px;object-fit:cover;box-shadow:0 14px 36px rgba(0,0,0,.4)">

  <div class="warn hidden" id="cfgWarn">
    <b>Not configured yet.</b> Paste the SwogeFun V2 address in <code>CONTRACT_ADDRESS</code>.
  </div>

  <div class="tabs">
    <button class="tab on" data-tab="create">＋ Create</button>
    <button class="tab" data-tab="explore">🔎 Explore</button>
    <button class="tab" data-tab="trade">📈 Trade</button>
    <button class="tab" data-tab="mine">👤 My tokens</button>
  </div>

  <!-- ============ CREATE ============ -->
  <section id="tab-create">
    <div class="panel">
      <h2>Launch a token ⚡</h2>
      <div class="note" id="modeInfo" style="margin-bottom:12px"></div>
      <div class="two">
        <div class="field"><label>Name</label><input id="cName" placeholder="Swoge Inu" maxlength="40"></div>
        <div class="field"><label>Symbol</label><input id="cSym" placeholder="SWINU" maxlength="12"></div>
      </div>
      <div class="field">
        <label>Logo (optional)</label>
        <input type="file" id="cLogoFile" accept="image/*">
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <img id="cLogoPreview" style="display:none;width:48px;height:48px;border-radius:10px;object-fit:cover;border:1px solid var(--line)">
          <span class="note" id="cLogoNote" style="margin:0">Upload from your PC / phone — resized &amp; stored on-chain automatically.</span>
        </div>
        <input id="cLogo" placeholder="…or paste an image URL (https://…)" style="margin-top:8px">
      </div>
      <div class="field">
        <label>Links (optional)</label>
        <input id="cTg" placeholder="Telegram — https://t.me/…" style="margin-bottom:8px">
        <input id="cTw" placeholder="Twitter / X — https://x.com/…" style="margin-bottom:8px">
        <input id="cWeb" placeholder="Website — https://…">
      </div>
      <div class="note" id="feeSummary"></div>
      <button class="btn primary full" id="createBtn" style="margin-top:8px" disabled>⚡ Launch on Uniswap</button>
      <div class="note" id="createNote">Connect a wallet first.</div>
    </div>
  </section>

  <!-- ============ EXPLORE ============ -->
  <section id="tab-explore" class="hidden">
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <h2 style="margin:0">Explore <span class="count" id="listInfo"></span></h2>
        <div class="sortseg" id="sortSeg">
          <button data-sort="new" class="on">Newest</button>
          <button data-sort="mc">Market cap</button>
          <button data-sort="old">Oldest</button>
        </div>
      </div>
      <div class="field" style="margin-bottom:10px"><input id="search" placeholder="🔎 Search name, symbol or address…"></div>
      <div class="btnrow" style="margin-bottom:12px"><button class="btn" id="reload">↻ Reload</button></div>
      <div id="list" class="tgrid"></div>
    </div>
  </section>

  <!-- ============ TRADE ============ -->
  <section id="tab-trade" class="hidden">
    <div class="panel" id="tradeEmpty"><div class="note">Pick a token in <b>Explore</b>, or paste an address below.</div>
      <div class="field" style="margin-top:10px"><input id="tradeAddr" placeholder="0x… token address"></div>
      <button class="btn" id="loadTrade">Load token</button>
    </div>
    <div id="tradeView" class="hidden">
      <div class="panel">
        <div class="card top" style="border:0;padding:0;background:none;cursor:default">
          <div style="display:flex;align-items:center;gap:12px"><span id="tvLogo"></span><div><div class="nm" id="tvName">—</div><div class="sy" id="tvSym"></div></div></div>
          <span class="badge" id="tvBadge">on curve</span>
        </div>
        <div class="note" id="tvAddr" style="margin-top:4px"></div>
        <div id="tvLock" style="margin-top:6px"></div>
        <div id="tvSocials"></div>
        <div class="btnrow" id="tvInstantRow" style="display:none;margin-top:10px">
          <a class="btn" id="tvDexBtn" target="_blank" rel="noopener">📊 DexScreener</a>
          <button class="btn" id="tvCollectBtn">💰 Collect fees (70% creator / 30% SWOGE)</button>
        </div>
        <label style="margin-top:12px">Price chart — market cap</label>
        <div id="tfBar" style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0"></div>
        <div style="position:relative">
          <canvas id="tvChart" width="760" height="220" style="width:100%;height:auto;border:1px solid var(--line);border-radius:10px;background:var(--void);display:block"></canvas>
          <img id="tvEmpty" alt="" style="display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:200px;max-width:62%;opacity:.92;pointer-events:none">
        </div>
        <div class="kv" style="margin-top:8px"><span class="k">Market cap</span><span class="v" id="tvMcap">—</span></div>
        <div class="kv"><span class="k">Price / token</span><span class="v" id="tvPrice">—</span></div>
        <div id="tvGradWrap">
        <label style="margin-top:12px">Progress to graduation</label>
        <div class="prog"><span id="tvBar"></span></div>
        <div class="note" id="tvProg"></div>
        </div>
      </div>

      <div class="panel" id="tvTradePanel">
        <h2>Trade</h2>
        <div class="two">
          <div>
            <div class="field"><label>Buy — ETH to spend</label><input id="buyEth" inputmode="decimal" placeholder="0.1"></div>
            <div id="buyPcts" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"></div>
            <div class="note" id="buyQuote" style="margin-top:6px"></div>
            <button class="btn buy full" id="buyBtn" style="margin-top:8px">Buy</button>
          </div>
          <div>
            <div class="field"><label>Sell — tokens to sell <a href="#" id="sellMaxLink" style="float:right;font-size:12px;text-decoration:none">Max</a></label><input id="sellTok" inputmode="decimal" placeholder="0"></div>
            <div class="note" id="sellQuote"></div>
            <button class="btn sell full" id="sellBtn" style="margin-top:8px">Sell</button>
          </div>
        </div>
        <div class="note" id="tradeNote" style="margin-top:10px"></div>
        <div class="kv"><span class="k">Your balance</span><span class="v" id="tvBal">—</span></div>
        <div class="kv" id="tvRewardRow" style="display:none"><span class="k">Your holder rewards</span><span class="v" id="tvReward">—</span></div>
        <button class="btn full" id="claimBtn" style="margin-top:10px;display:none">💰 Claim my holder rewards</button>
      </div>

      <div class="panel" id="tvHistPanel">
        <h2>Recent trades</h2>
        <div id="tvTrades" style="overflow:auto;max-height:340px">—</div>
      </div>
    </div>
  </section>

  <!-- ============ MY TOKENS ============ -->
  <section id="tab-mine" class="hidden">
    <div class="panel">
      <h2>My tokens &amp; fees</h2>
      <div class="btnrow" style="margin-bottom:10px">
        <button class="btn" id="mineReload">↻ Reload</button>
        <span class="note" id="mineInfo" style="margin:0;align-self:center"></span>
      </div>
      <div id="mineList"></div>
    </div>
  </section>

  <div class="foot">$SWOGE FUN · Instant Uniswap launches · 30% of the 1% fee to SWOGE · <a href="index.html">swoleeswoge.dog</a></div>
</div>

<div class="wpick" id="wpick"><div class="box"><h3>Choose your wallet</h3><div id="wpickList"></div><div class="cancel" id="wpickCancel">Cancel</div></div></div>
<div class="toast" id="toast"></div>

<!--CONFIG-->
<script>window.SWOGEFUN_ABI=[{"inputs":[{"internalType":"address","name":"_positionManager","type":"address"},{"internalType":"address","name":"_weth","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":true,"internalType":"address","name":"buyer","type":"address"},{"indexed":false,"internalType":"uint256","name":"ethIn","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"tokensOut","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"protocolFee","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"creatorFee","type":"uint256"}],"name":"Buy","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":true,"internalType":"address","name":"holder","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Claimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":true,"internalType":"address","name":"creator","type":"address"},{"indexed":false,"internalType":"string","name":"name","type":"string"},{"indexed":false,"internalType":"string","name":"symbol","type":"string"},{"indexed":false,"internalType":"uint8","name":"feeMode","type":"uint8"},{"indexed":false,"internalType":"address","name":"devWallet","type":"address"},{"indexed":false,"internalType":"uint16","name":"creatorFeeBps","type":"uint16"},{"indexed":false,"internalType":"uint16","name":"maxWalletBps","type":"uint16"}],"name":"Created","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":false,"internalType":"uint256","name":"ethToCreator","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"ethToSwoge","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"tokToCreator","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"tokToSwoge","type":"uint256"}],"name":"FeesCollected","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":false,"internalType":"uint256","name":"ethToLp","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"tokensToLp","type":"uint256"},{"indexed":false,"internalType":"address","name":"pool","type":"address"}],"name":"Graduated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"HolderRewards","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":true,"internalType":"address","name":"creator","type":"address"},{"indexed":false,"internalType":"address","name":"pool","type":"address"},{"indexed":false,"internalType":"uint256","name":"lpTokenId","type":"uint256"}],"name":"LaunchedInstant","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":false,"internalType":"string","name":"telegram","type":"string"},{"indexed":false,"internalType":"string","name":"twitter","type":"string"},{"indexed":false,"internalType":"string","name":"website","type":"string"},{"indexed":false,"internalType":"string","name":"logo","type":"string"}],"name":"Meta","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token","type":"address"},{"indexed":true,"internalType":"address","name":"seller","type":"address"},{"indexed":false,"internalType":"uint256","name":"tokensIn","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"ethOut","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"protocolFee","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"creatorFee","type":"uint256"}],"name":"Sell","type":"event"},{"inputs":[],"name":"CURVE_SUPPLY","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"DEAD","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"FEE_DEV","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"FEE_HOLDERS","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"INSTANT_CREATOR_SHARE_BPS","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"I_TICK_START","outputs":[{"internalType":"int24","name":"","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"I_TICK_TOP","outputs":[{"internalType":"int24","name":"","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"LP_SUPPLY","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MAX_CREATOR_FEE_BPS","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MODE_CURVE","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MODE_INSTANT","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"POOL_FEE","outputs":[{"internalType":"uint24","name":"","type":"uint24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"PROTOCOL_FEE_BPS","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"TICK_LOWER","outputs":[{"internalType":"int24","name":"","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"TICK_UPPER","outputs":[{"internalType":"int24","name":"","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"TOTAL_SUPPLY","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"VETH_INIT","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"VTOK_INIT","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"allTokens","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"minTokensOut","type":"uint256"}],"name":"buy","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"claimRewards","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"collectFees","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"string","name":"name","type":"string"},{"internalType":"string","name":"symbol","type":"string"},{"internalType":"uint8","name":"mode","type":"uint8"},{"internalType":"uint16","name":"maxWalletBps","type":"uint16"},{"internalType":"uint8","name":"feeMode","type":"uint8"},{"internalType":"address","name":"devWallet","type":"address"},{"internalType":"uint16","name":"creatorFeeBps","type":"uint16"},{"internalType":"string","name":"telegram","type":"string"},{"internalType":"string","name":"twitter","type":"string"},{"internalType":"string","name":"website","type":"string"},{"internalType":"string","name":"logo","type":"string"}],"internalType":"struct SwogeFunV2.LaunchParams","name":"p","type":"tuple"}],"name":"createToken","outputs":[{"internalType":"address","name":"t","type":"address"}],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"creationFee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"curves","outputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"address","name":"creator","type":"address"},{"internalType":"address","name":"devWallet","type":"address"},{"internalType":"uint8","name":"feeMode","type":"uint8"},{"internalType":"uint16","name":"creatorFeeBps","type":"uint16"},{"internalType":"uint16","name":"maxWalletBps","type":"uint16"},{"internalType":"uint256","name":"vEth","type":"uint256"},{"internalType":"uint256","name":"tokensSold","type":"uint256"},{"internalType":"bool","name":"graduated","type":"bool"},{"internalType":"bool","name":"exists","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"instant","outputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"address","name":"creator","type":"address"},{"internalType":"address","name":"pool","type":"address"},{"internalType":"uint256","name":"lpTokenId","type":"uint256"},{"internalType":"bool","name":"exists","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"magPerShare","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"modeOf","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"onMove","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"address","name":"holder","type":"address"}],"name":"pendingRewards","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"positionManager","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"ethIn","type":"uint256"}],"name":"quoteBuy","outputs":[{"internalType":"uint256","name":"tokensOut","type":"uint256"},{"internalType":"uint256","name":"fee","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"tokensIn","type":"uint256"}],"name":"quoteSell","outputs":[{"internalType":"uint256","name":"ethOut","type":"uint256"},{"internalType":"uint256","name":"fee","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"tokensIn","type":"uint256"},{"internalType":"uint256","name":"minEthOut","type":"uint256"}],"name":"sell","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"f","type":"uint256"}],"name":"setCreationFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"r","type":"address"}],"name":"setSwogeTreasury","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"swogeTreasury","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"tokenCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"n","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"weth","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"withdrawn","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"stateMutability":"payable","type":"receive"}];window.SWOGETOKEN_ABI=[{"inputs":[{"internalType":"string","name":"_name","type":"string"},{"internalType":"string","name":"_symbol","type":"string"},{"internalType":"uint256","name":"_supply","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[],"name":"SNIPE_BLOCKS","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"SNIPE_MAX_BPS","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"s","type":"address"},{"internalType":"uint256","name":"v","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"fun","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"launchBlock","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pool","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"p","type":"address"}],"name":"setPool","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"v","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"f","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"v","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}];</script>
<script>
(function(){
"use strict";
if(typeof ethers==="undefined"){ alert("ethers.js could not load. Reload."); return; }

// ⚙️  SwogeFun V2 (dual-mode launchpad) on Robinhood Chain:
var CONTRACT_ADDRESS = window.SWOGEFUN_ADDRESS || "0x4De26D120A4fF2d7c1875E6C7D611262b9cA426d";
var CHAIN = { id:4663, hex:"0x1237", name:"Robinhood Chain", rpc:"https://rpc.mainnet.chain.robinhood.com", scan:"https://robinhoodchain.blockscout.com", sym:"ETH" };
var WC_PROJECT_ID = "7553b1651dfa1fce5eaff2405d5f230c";  // WalletConnect (reown.com) — free
var FUN_ABI = window.SWOGEFUN_ABI, TOKEN_ABI = window.SWOGETOKEN_ABI;
var CURVE_SUPPLY = ethers.utils.parseEther("800000000");
/* Uniswap v3 infra (Instant-mode tokens trade here) */
var WETH   = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
var ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2";   // SwapRouter02
var QUOTER = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";   // QuoterV2
var POOL_FEE = 10000;                                        // 1% tier
var ROUTER_ABI=[
 "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
 "function multicall(bytes[] data) payable returns (bytes[] results)",
 "function unwrapWETH9(uint256 amountMinimum, address recipient) payable"
];
var QUOTER_ABI=["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)"];
var POOL_ABI=[
 "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
 "function token0() view returns (address)",
 "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)"
];
var PM = "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3";   // NonfungiblePositionManager
var PM_ABI=["function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) payable returns (uint256 amount0,uint256 amount1)"];

var $=function(s){return document.querySelector(s);};
var toastEl=$("#toast");
function toast(m){toastEl.textContent=m;toastEl.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(function(){toastEl.classList.remove("show");},1900);}
/* ---- brand graphics: your uploaded images, with safe fallbacks ---- */
var SWOGE_LOGO="data:image/webp;base64,UklGRggSAABXRUJQVlA4IPwRAACwQACdASqAAIAAPmEkj0UkIiEZPMVUQAYEswBpVREtfyo/AedJcH9jwCx4LaP+V9Rn6a9gDnOeYX9ufVs/4nrA/0HozdR36AHSyf4XJiGKf4Lwd/Fvm377+Wf9e9oLIf1s6inxv7Z/nP7p+6XrL/ivAn4V/3fqBfj/8u/zH5me1573/wO3m2DzBfbD6l/sP7/+3f9w9HD/C9Dvr17AP88/qX+i/Lv1sfBooAfzH+2f8D/G/kX9LP9L/2f85+bXtf/P/8R/1f9F8Av8v/rn+0/vP7y/5L///WP///dx+23s7ftc32gjXQ1gnmDnMKL+iNeebbcSZ/Xx+etnqMB4nIGK7gi0PAxMnfjxxrgrHf9B82bmDPg/zH8j+nM17UXeN4a3z+bQfdZJsyA+QHyD/UhfHogzaO9nn+PYevtca6PcZHCGGS1RTDPUSofKV7bqyZS0xPfGsr1FD2TWotKF/mENtuKfjh/4dVfYwvCG5GrI1FHZ8H/otv5zRDNxXrP0DPk0grqB6ruwKhRmsKsWbpQ9kcj6rfQfAcU21JKOsNTFfmqEIfH8/w579N2qwo68tkNO2/4LpWI6dafBAx9tKGOjSdC5MoGb8B24wTdNBTXSiDb2z4HIa+zh01py3U1u3oC62zkU4WulZLx37zPHVo2ehNPbtOadfFemcxEce+dgUGauVsC9s8qYvrEhAS2gAP7+zmILWZ8Cc0uhyOANhvtsQ0/Io7YZ4tr4run1z2qn2os8Gm9/5/18ip2TdffKZ5WZX9Il596UYNRpB+XLfiS6jGGHJFGKMp9YZtbVIGas34f57npilOifS0zMD3YPPpyw26AWLMyKNVUC9FnXjw5CzUcB87o8JY4Zpy3DaeVG75EtGQ8L/VhA7cN77qgYs4d8+DPyLjDQ+yuX3ViHF7vaSSXwh1PzY8Rt8phe8D7+GQuv5jObo6y8YLVrbaYx6MgqjYbq8W3SfVVGU/wYliDM1rHaO7Pbv91B7VFNwT2rAb43xdkizT1ak4q/9nWwuG8MrIpLPp7LYFPe9M80dHgb8wHcAGT6KFK+vOB0KUufWcKWVXCBkQC5pF7FdQVLcNwls30cBpJpm4Np5QfIa885bUWvNMBVc1hAuNYiBUWx/NlDl6lAB+Ax7rqlpy4crMJssiiThUm9Td6IFj44DRahTxqLzGyYQKhov3fL0y2LCG4ZYEShDxjWWCHpVuSbX7IMKi3VCL5FKmdnnXlin3A1OCPMVp6NGedtUkL5RCNhhmKUlqI26wFbE7BynclWscn8k79zf8/IbaLEw5arcVvVpsWTDDihUkJYPqCL3iYGKJYd1GIbwk1Lb+94cBowJ/QQja3xy9YhBhyke6I630/f+1Vpf7Smk/4LrcEFRfi2KlfpJ/F/Hm0l235OmBLBHbSciz3gmG1sgnrbTVtAju1fDl+Pcv3Us51EKMu2cFvKbabeu6Clo/ykheDgL44j/sVUzAlFSyStx6kmx0ZCoPVrP374O9txSbxq1frUCCOh7G4mEncW0ZeNapbrZUtag0CSGSn6NPdAKLEpchIHzTrNIBOgPr3Hhjf8p9SuBbP9qI+Saq1vwWCujDzUBFE2bW0IZ/lmeYjkrf18b3ySlr9amxy1a3lJzkRcRnSwy5kkWHnVIyVsxePzaAIguKEhpL1OpX1/v9YZI70c6UQVww1noaQ/PWYupCQOuumVB5r8Mu8LI3kwX018VPNfxH9FHzJ23R+c+vb1N4ieF65W67ahviz4aJk1s0IEy60dgjxW4gMW4+RTenJKkkSkVPYCS3FbQ36rkgKKpAqHSUoDLglvhwN5VRyXFZhZEpn4p06GNa3Gm/R7KDzy6G4p0lzTm7sSbPQrC9bRr2SR3xNY9vSTUkDOVNM97l83kyvSdg7L76iJzHWC+h6ESAQRMqE5pS18A3AnPf3EZ0zFmWDNoeY1JyUNbyUYaqDV7kt8fR1wr7mw+FCAB8E0aR9rV/J9axmF+XUbb1W7I3wGnkPkf4/M4Do8MDOplTCYsGbjA+I+e1Vbp8yZoTonM+/p/dftCXHXshQC7ww5mCHYE3W7jvkv+nXbYGl79yGhEeDMdvBJcSmu4K/EmhAjPkWGXqjme7MVCH8r8iV4JhvsS95Pi4Bj6T/gCXG/205XKYOrA8Hf4WvAKrzXdCPNTVDQnTCldK3fDyFCO2vvg/G/m68roMi+hRUn4628Vms/TF/Sf4Leo4NhQArE2EiFdm3IJ4jVVQOtcN3HgB4YjNw6n+NZDbRh602q7n7jdMYocffrT8WMrtNlySmq/U6dNETL0O0L4T8e2BKOIq9zm/K3Fcxs7M6sifUUTT1NjwEfCAMEtBxSDg/usZaql/o+s0INu7JxmpTjHdRzm3n+yCUA1pcd1oYUQ4NVShqIcxN4OyqmI6k1n4hSg9AHSJGnIT9337JNYktPi0o2lbCKrcdCHU6pgahi7yU3f/BZ/4fE3YXTyX2OLYpldVNH/UlHMfRvIRmsWqgTKvzOijvtVXxcLKqD6I/0rrf2WPIXfVp7ATuhn6GlAOkCxJL5kDQHIBlqsDhwhdb/FgAJmCTgQ0dgb+xJ2NWJPxsncDYF3XATqLXpFYRVMOgMGYF3x8cjNVlHnHd4FKBBmKDgYgJb5w7kO0Ry4CCwYFcXdTFOkCYC33nfGdDONn47bog1+fh9/N8Wqd1nyDpcxDg89biIyQVMfrNc4dF/8Qjbza2tIQaEEKHIl0Pls0jfNUCqKhGjiSq7UBbBaiYT0ZnPYbFN9SbHEABgnCFbyiX3vzXSNiSg5lndRHczfmGoeRc4gtbk+ZWQ/T4kAZL9iZVlKznqaEL4RFqEX+xFHv4ijbbo4jEJKHZhYbe1NGp43nhu/Q5CLOo2T9Q19PqmK7Sa+1zP1w8mTPqi6voQF16MszbqRZ2nkI7UBKWQlPzd9i1WwLYqbAIouYg1wofEu2YX+qNm4ljwMvojOwm2+7vHB+FtWOs/mTwtlP6h5jjd8J3jfph+z2KMT2g0nVvfi1qUAeS4y86Ws5Sa5gbxW9lMpmeJsW8Ccdn1FwAs/xXrdouLQh8ImYVF6UPeGr/9xQWNHv5ZDS79fLwdrhBo4GC7Xh++xlKjnJNdCHv/sdhFOTY9zjYd+qce+VGALG7fBHZd3HIexHM6twT77DTuEBHJULexDe3GdX66D4SwD0eMfxNNzgsDRLGBay+sWNLZjHwdHnwW8qzvVk6LgRXzkdCQWDTqcJatvvuwSk9nxJCGOsysqiv5F2jedptY8hy2ERC6N6fm4JX6Y8P8gI2NPRbcYC6zE63s6BkQSS/KpUVOUr+/8c4iqozdwW0uTBreXtqFK37r02yqOeKXKVIj5//Ta+5rbJ6K6qGtMNxowwYmEC2nk0EXLdcR669ptT9MaGNQyuY9+HtCyBJXRh2ndf7u6xI0GlIQMbnn91fKA/8y5raJgRxzNW6nbVIO+BjkaIg1lwMHptlRCYqIvBcpr0nwAiGJ+JFPC5XHZ3159d732qvAifAy7i/4ULmouKhVZsbou2jdi6sQxSBsE0y2zyJRCjQMQYOuARjoC9qxZZqsVgLiKnamTorx6tjQWjMmK4+CD1zYuZjqE5Kmk/jBHwVQil/+RtSZNPXYb/7nRF5tBYhK/sOBw8UgOh0Qyd3rgVX/dTqQYlS8rIMYXxyyG31MCtiARAv2nCEm6unU+T2y2hn+VCENmYWDCcE69iFeoIRWWb7sP+RUXsMql/dfni/VHcF/z3vphbkMovZ9kbER1mC/1lt0PCO8LcvJaywk/4TW0aqqDpYOo5wqGeq4Ygpm4YUq47JhM79TT04cx2d6bfwoKWJnNGH6ILPGvd3cP/8Qojlq1UBhp5qy00GwNc2tIMHPGPE+ori8M/yISD57JPWesoaDHa8hseFgUL4iA8yljaP6OgRYcFgOGfHtX2XUsij/dqmAuMYQtrM/14cTTaKqvtvj7CtCHjrLwvttMsIWS0KP8qiLstQPYQvzLM+nFf3lSJNOMHP9D1W4rrbjhYcRBA5ovvAGumhog+Ro3lVEUxqMwRsICPmkhTIpDppbnXhJZJdWCkZKRcE4S+4aeuAjW+vN3AmvLPXJaC0/e83lAM/EMA8QOEbHMpbhI/xsDzuZ9gdLxPpuiBxAaIOTXM26iErouVScZDqhQadje4QQF4aeTeo8yoJWNXW1al3ADJddTYJfIqPyN7H1JjkKd6lHZxAzKAlX26wRBzi9R0OldeiRkyHvXKaS30eae+o29FDnU2mSvTDIqjwCeZIeo/dMdijejXYfTWFTHk+fZcreDZGEFAySXhgI5sAunmVw292vTLmp4DdnU0Q+ZIjp+xHlqBzooJUZubKtaWRm3FVweYhGl7Q+wJKQoL2TB5pidDZv17yhY200NTlz8jcYkh/551pxcLRuMFw06OMH72VXSRMy9Hyhjt5SFUmrd1I5sh1pEAkNRr9eugXzOrL/NeE10S0ur7OwWVFWmZ13VeMMPRMF5xEdXrrDfi4FGvpgtAg86Pov4qJ0s/2R5g6ZjuXLyRXVVw7MT71Bz9rtU8J9asn8he8grCcw0yoEefmAOV9nrzqeoQGNjIt+EN8J0x/HZTajr8NemWsniOTGOswIaCsWXBJ10cNENtG9dn6eJ8liXjKXDLB4l6KNOfqf077yNLyh4ayav8f6siHCx0cHMcT9i0cFI1sxUSBGWbDYOrxDTxxa3Ky2194ZojJMAqqP8S45+fauCXa0OkrtbLINPprVTf5NZNb1DEnjG6hdt78IcJmkuq2t+tI4voex9D1oa1BPwXfa4y7LhHlsRkUMtYJDUiKyZ8dDCnwz+lz4DW7GIEFAF/+d3mLSGWh2MjkJyoMeaDJQoBmPdHY9FFCmLH3SCjGlGgTjE0R5jGqxNlY94yOV7VzZvZvyR4J4NnVaWEEch56/eq6f2unmQNYpSODHKqRdVGdZleoXED4wenwhzrQ/+QSfHqLqbKHzvZ2yd0VVqeU/D0MdWrRA0QyMutX3IE5wOjSZLQG9j5fcy6XoOr9SDonN5FpGMEJ7/KW/S5gIm+lzKaqHQUp6XaE4lcq0Hz6L/wkiDGCJDaMw6WR7nlJ/4hmPna+0pn13wk+1LDxMEloSyw+7XXIJg5HOVeI3OvbapQA5Agkv9Zw/2UU1fYkGQBsSxydB8U2GqblLrqDGbPXG21OkXwT74i0IeRzrvuFCSNwtsiPBcmYdcerIRsIRGeBIuzLTRl1HF88VaP38ApILq1lUeWKCnki2SIQqks70KFli8S87NExs3FeYSrG2cOOh3cCzO87t6ZJnL3hu8mrogglgEXmF+AmXIhwN8bHiicPT/d13eImb0MNHlMPK+MKqgWHF/+gm7QKGgnzm4cRFXV96EpU0Y4tuoxcTChgOnQbVmfdcLGiebHRv74nCI6RaxHfr3PnpA3oDauQ2kXaJmOW4esfLY+pw8ZGsswvstRE+uy2QHe0UESdm2NW1YGHUbw4ZFlyagnK3dfQVd5dVebKMFChGc8Jcm0AeWRd70TOH4PMHcQoj1r0DZqmLLyWNODPaOfXkIQzuo2YO9wCMQytjE/PMKKCyA5hnQt8trQ40ThHfZVyH+5HN/g+hBHjPIj2LHPSu2epJeSmibNIXs//O/kU48LB87v0xVaktXUYb/uXW/tUeiR6TmA/MZ208CYyXafJ0add8v53YMTmU6cBAERwKMr4K9Zt+JmJksofz68yoL9stZWlDI/hVK190aMFTEHU6x98Qc6rAFIISW++KxYGRFtNDsqudufADv3DD9/vn6M3SuEBqtLOV70kLVF3j7AkcsNPhvRUYOMSqc5qVEWjXLKJO8JfehD35Z59IXpD2X1+m+v0lI78cbRIXlsO2QrovboSfXDuVudEKZTzCWljsgjWn+zTvg2sgZnRhegqHmXRIHImU5Kb41vPjmckctucWMwmUU3NlX6vPrAsc/z77545yaKcFJEuHfKbRr3q6Bg57+N2sXbdMipw+YK9Y9FL/CwkbkZ4C3StxksZGqzQW8jg//3DgT0LZPfxGj7wJP8wNUYpT4bZ5ly3l/ctav5D8NMW+E4xvf3rj8iTJINCtHDOcNEwkY24gxBy9X8fkyaLtjuUmPFOvIREunn/RrHfAhMkjLOKXgAAAAA==";
var _svgS="data:image/svg+xml;base64,"+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" rx="11" fill="#E6A537"/><text x="22" y="30" font-size="21" text-anchor="middle" font-family="Arial" font-weight="bold" fill="#1a1206">S</text></svg>');
// header logo: try swoge-icon.png → embedded mascot → S
(function(){ var l=$("#logo"); if(!l) return; l.onerror=function(){ this.onerror=function(){ this.onerror=null; this.src=_svgS; }; this.src=SWOGE_LOGO; }; l.src="swoge-icon.png"; })();
// favicon: swoge-icon.png if present, else the embedded mascot
(function(){ var link=document.querySelector("link[rel=icon]"); if(!link){ link=document.createElement("link"); link.rel="icon"; document.head.appendChild(link);} var probe=new Image(); probe.onload=function(){ link.href="swoge-icon.png"; }; probe.onerror=function(){ link.href=SWOGE_LOGO; }; probe.src="swoge-icon.png"; })();
// hero banner: show swoge-hero.png only if it exists
(function(){ var h=$("#heroBanner"); if(!h) return; h.onload=function(){ h.style.display="block"; }; h.onerror=function(){ h.style.display="none"; }; h.src="swoge-hero.png"; })();
// empty-chart mascot: preload swoge-empty.png (shown by renderChart when no trades)
var EMPTY_IMG_OK=false; (function(){ var e=$("#tvEmpty"); if(!e) return; e.onload=function(){ EMPTY_IMG_OK=true; }; e.onerror=function(){ EMPTY_IMG_OK=false; }; e.src="swoge-empty.png"; })();

if(CONTRACT_ADDRESS) $("#cfgWarn").classList.add("hidden");

/* ---------- wallet ---------- */
var provider=null, signer=null, account=null, rawEth=null;
function rpcProvider(){ return new ethers.providers.StaticJsonRpcProvider(CHAIN.rpc, CHAIN.id); }
function readFun(){ return new ethers.Contract(CONTRACT_ADDRESS, FUN_ABI, provider || rpcProvider()); }
function writeFun(){ return new ethers.Contract(CONTRACT_ADDRESS, FUN_ABI, signer); }

/* ---- multi-wallet discovery (EIP-6963): MetaMask, Rabby, Uniswap, … ---- */
var wallets6963=[];
window.addEventListener("eip6963:announceProvider", function(e){
  var d=e.detail;
  if(d&&d.info&&d.provider&&!wallets6963.some(function(w){return w.info.uuid===d.info.uuid;})) wallets6963.push(d);
});
try{ window.dispatchEvent(new Event("eip6963:requestProvider")); }catch(e){}

async function connectWith(eth){
  if(!eth){ toast("No wallet"); return; }
  try{
    await eth.request({method:"eth_requestAccounts"});
    var cid=await eth.request({method:"eth_chainId"});
    if(cid!==CHAIN.hex){
      try{ await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:CHAIN.hex}]}); }
      catch(sw){ if(sw&&sw.code===4902){ await eth.request({method:"wallet_addEthereumChain",params:[{chainId:CHAIN.hex,chainName:CHAIN.name,nativeCurrency:{name:"Ether",symbol:CHAIN.sym,decimals:18},rpcUrls:[CHAIN.rpc],blockExplorerUrls:[CHAIN.scan]}]}); } else throw sw; }
    }
    provider=new ethers.providers.Web3Provider(eth,"any");
    signer=provider.getSigner();
    account=await signer.getAddress();
    rawEth=eth;
    $("#walletBtn").textContent=account.slice(0,6)+"…"+account.slice(-4);
    $("#createBtn").disabled=!CONTRACT_ADDRESS;
    $("#createNote").textContent=CONTRACT_ADDRESS?"Ready.":"Contract address not set in this file.";
    if(curToken) refreshTrade();                 // stay on Trade, just refresh
    if(!$("#tab-mine").classList.contains("hidden")) loadMine();
    // soft account/chain handlers — no page reload (keeps you on the current tab)
    if(!eth.__swogeHooked){
      eth.__swogeHooked=true;
      eth.on&&eth.on("accountsChanged",function(accs){
        if(!accs||!accs.length){ account=null; signer=null; $("#walletBtn").textContent="Connect wallet"; $("#createBtn").disabled=true; if(!$("#tab-mine").classList.contains("hidden")) loadMine(); return; }
        account=accs[0]; try{ signer=provider.getSigner(); }catch(e){}
        $("#walletBtn").textContent=account.slice(0,6)+"…"+account.slice(-4);
        $("#createBtn").disabled=!CONTRACT_ADDRESS;
        if(curToken) refreshTrade();
        if(!$("#tab-mine").classList.contains("hidden")) loadMine();
      });
      eth.on&&eth.on("chainChanged",function(){
        try{ provider=new ethers.providers.Web3Provider(eth,"any"); signer=provider.getSigner(); }catch(e){}
        if(curToken) refreshTrade();
      });
    }
  }catch(e){ toast(String(e.message||e).slice(0,90)); }
}
async function disconnect(){
  try{ if(rawEth && typeof rawEth.disconnect==="function") await rawEth.disconnect(); }catch(e){}
  account=null; signer=null; provider=null; rawEth=null;
  $("#walletBtn").textContent="Connect wallet";
  $("#createBtn").disabled=true;
  if(curToken) refreshTrade();
  if(!$("#tab-mine").classList.contains("hidden")) loadMine();
  toast("Wallet disconnected");
}
function openWalletPicker(){
  var host=$("#wpickList"); host.innerHTML="";
  if(account){
    // already connected → show account actions (copy / disconnect)
    var info=document.createElement("div"); info.className="note"; info.style.marginTop="0";
    info.innerHTML="Connected<br><b style='color:var(--cream);word-break:break-all'>"+account+"</b>";
    host.appendChild(info);
    var cp=document.createElement("div"); cp.className="wrow"; cp.style.marginTop="10px";
    cp.innerHTML='<span class="wdot"></span><span>📋 Copy address</span>';
    cp.setAttribute("data-copy",account);
    host.appendChild(cp);
    var dc=document.createElement("div"); dc.className="wrow";
    dc.innerHTML='<span class="wdot" style="background:var(--danger)"></span><span>🔌 Disconnect</span>';
    dc.onclick=function(){ $("#wpick").classList.remove("show"); disconnect(); };
    host.appendChild(dc);
    $("#wpick").classList.add("show");
    return;
  }
  // installed injected wallets (Rabby, MetaMask, Uniswap…)
  wallets6963.forEach(function(d){
    var row=document.createElement("div"); row.className="wrow";
    row.innerHTML=(d.info.icon?'<img src="'+esc(d.info.icon)+'" alt="">':'<span class="wdot"></span>')+'<span>'+esc(d.info.name||"Wallet")+'</span>';
    row.onclick=function(){ $("#wpick").classList.remove("show"); connectWith(d.provider); };
    host.appendChild(row);
  });
  if(wallets6963.length===0 && window.ethereum){
    var b=document.createElement("div"); b.className="wrow";
    b.innerHTML='<span class="wdot"></span><span>Browser wallet</span>';
    b.onclick=function(){ $("#wpick").classList.remove("show"); connectWith(window.ethereum); };
    host.appendChild(b);
  }
  // WalletConnect — always available (mobile / QR)
  var wc=document.createElement("div"); wc.className="wrow";
  wc.innerHTML='<span class="wdot" style="background:#3396FF"></span><span>WalletConnect · mobile / QR</span>';
  wc.onclick=function(){ $("#wpick").classList.remove("show"); connectWalletConnect(); };
  host.appendChild(wc);
  $("#wpick").classList.add("show");
}

async function connectWalletConnect(){
  var EP = window.EthereumProvider || window.WalletConnectEthereumProvider ||
           (window["@walletconnect/ethereum-provider"] && window["@walletconnect/ethereum-provider"].EthereumProvider);
  if(!EP || !EP.init){ toast("WalletConnect couldn't load — check your connection and try again."); return; }
  try{
    var rpcMap={}; rpcMap[CHAIN.id]=CHAIN.rpc;
    var wc=await EP.init({
      projectId: WC_PROJECT_ID,
      chains:[CHAIN.id], optionalChains:[CHAIN.id],
      showQrModal:true, rpcMap:rpcMap,
      metadata:{ name:"SWOGE Fun", description:"Instant DexScreener launchpad on Robinhood Chain",
                 url:location.origin||"https://swoleeswoge.dog", icons:["https://swoleeswoge.dog/favicon.ico"] }
    });
    await wc.enable();          // opens the QR / deep-link modal
    await connectWith(wc);
  }catch(e){ toast("WalletConnect: "+String(e.message||e).slice(0,90)); }
}
$("#walletBtn").onclick=openWalletPicker;
$("#wpickCancel").onclick=function(){ $("#wpick").classList.remove("show"); };
$("#wpick").onclick=function(e){ if(e.target===$("#wpick")) $("#wpick").classList.remove("show"); };

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach(function(t){
  t.onclick=function(){
    document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("on");});
    t.classList.add("on");
    ["create","explore","trade","mine"].forEach(function(n){ $("#tab-"+n).classList.toggle("hidden", n!==t.dataset.tab); });
    if(t.dataset.tab==="explore") loadList();
    if(t.dataset.tab==="mine") loadMine();
  };
});
$("#mineReload").onclick=loadMine;

/* ---------- create (Instant DexScreener only) ---------- */
/* pick an image from the device → resize to a small icon → data-URI stored on-chain */
var uploadedLogo="";
function processLogoFile(file){
  return new Promise(function(resolve,reject){
    if(!file) return reject("no file");
    if(!/^image\//.test(file.type||"")) return reject("not an image");
    var fr=new FileReader();
    fr.onerror=function(){ reject("read error"); };
    fr.onload=function(){
      var img=new Image();
      img.onerror=function(){ reject("bad image"); };
      img.onload=function(){
        var MAX=96, CAP=8000;            // ~96px icon, keep the data-URI under ~8 KB
        var s=Math.min(1, MAX/Math.max(img.width,img.height));
        var cw=Math.max(1,Math.round(img.width*s)), ch=Math.max(1,Math.round(img.height*s));
        function render(w,h){ var cv=document.createElement("canvas"); cv.width=w; cv.height=h; cv.getContext("2d").drawImage(img,0,0,w,h); return cv; }
        var cv=render(cw,ch), best="";
        for(var pass=0; pass<3; pass++){
          var types=["image/webp","image/jpeg"];
          for(var ti=0; ti<types.length; ti++){
            for(var q=0.82; q>=0.4; q-=0.1){
              var uri=cv.toDataURL(types[ti], q);
              if(uri.indexOf("data:image")!==0) continue;   // type unsupported → skip
              if(!best || uri.length<best.length) best=uri;
              if(uri.length<=CAP) return resolve(best);
            }
          }
          cw=Math.round(cw*0.75); ch=Math.round(ch*0.75);   // still too big → shrink & retry
          if(cw<24||ch<24) break;
          cv=render(cw,ch);
        }
        resolve(best);
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}
var _logoFileEl=$("#cLogoFile");
if(_logoFileEl) _logoFileEl.addEventListener("change",function(){
  var f=this.files&&this.files[0]; if(!f){ return; }
  $("#cLogoNote").textContent="Processing image…";
  processLogoFile(f).then(function(uri){
    uploadedLogo=uri;
    $("#cLogoPreview").src=uri; $("#cLogoPreview").style.display="block";
    $("#cLogo").value="";       // uploaded image takes priority over the URL field
    $("#cLogoNote").textContent="Logo ready · "+(uri.length/1024).toFixed(1)+" KB (stored on-chain).";
  }).catch(function(){ uploadedLogo=""; $("#cLogoNote").textContent="Couldn't read that image — try a PNG/JPG."; });
});
// typing a URL clears the uploaded file
if($("#cLogo")) $("#cLogo").addEventListener("input",function(){ if(this.value.trim()){ uploadedLogo=""; $("#cLogoPreview").style.display="none"; } });

function updateFeeSummary(){
  $("#modeInfo").innerHTML="A real Uniswap pool is created at launch — <b>visible on DexScreener immediately</b>. No liquidity to provide. Anti-snipe: max 5% per wallet for the first 2 blocks.";
  $("#feeSummary").innerHTML="Uniswap trade fee 1%: <b>70% → you (creator)</b> · <b>30% → SWOGE</b>. Collect anytime on the Trade page.";
}
updateFeeSummary();

$("#createBtn").onclick=async function(){
  if(!signer){ openWalletPicker(); return; }
  var name=$("#cName").value.trim(), sym=$("#cSym").value.trim();
  if(!name||!sym) return toast("Name and symbol required");
  var btn=$("#createBtn"), note=$("#createNote");
  btn.disabled=true; btn.innerHTML='<span class="spin"></span> launching…'; note.className="note"; note.textContent="Confirm in your wallet…";
  try{
    var tg=$("#cTg").value.trim(), tw=$("#cTw").value.trim(), web=$("#cWeb").value.trim();
    var lg = uploadedLogo || $("#cLogo").value.trim();     // uploaded file wins, else pasted URL
    var tx=await writeFun().createToken({
      name:name, symbol:sym, mode:1,                       // Instant DexScreener only
      maxWalletBps:0, feeMode:0, devWallet:ethers.constants.AddressZero,
      creatorFeeBps:0, telegram:tg, twitter:tw, website:web, logo:lg
    }, {gasLimit:9000000});
    note.innerHTML='Sent · waiting… <a href="'+CHAIN.scan+'/tx/'+tx.hash+'" target="_blank">↗</a>';
    var rc=await tx.wait();
    var ev=rc.events&&rc.events.find(function(e){return e.event==="Created";});
    var addr=ev?ev.args.token:null;
    note.className="note ok"; note.innerHTML="🎉 Launched on Uniswap! "+(addr?('<a href="'+CHAIN.scan+'/address/'+addr+'" target="_blank">'+addr+' ↗</a>'):"");
    toast("Token launched 🚀");
  }catch(e){ note.className="note err"; note.textContent="Failed · "+String(e.reason||e.data&&e.data.message||e.message||e).slice(0,150); }
  finally{ btn.disabled=false; btn.innerHTML="⚡ Launch on Uniswap"; }
};

/* ---------- token logos (off-chain, from logos.json in the repo) ---------- */
var logoMap = {};
(function seedLogos(){ var w=window.SWOGE_LOGOS; if(w){ for(var k in w) logoMap[k.toLowerCase()]=w[k]; } })();
function loadLogos(){
  return fetch("logos.json?"+Date.now()).then(function(r){ return r.ok?r.json():{}; }).then(function(j){
    for(var k in j){ if(k.indexOf("0x")===0) logoMap[k.toLowerCase()]=j[k]; }
  }).catch(function(){});
}
function logoFor(addr){
  var k=(addr||"").toLowerCase();
  var m=metaMap[k];                       // on-chain logo (Meta event) wins
  if(m && m.logo) return m.logo;
  return logoMap[k] || "";                // logos.json fallback
}
function logoImg(addr, cls){
  var u=logoFor(addr); if(!u) return "";
  return '<img class="tlogo'+(cls?" "+cls:"")+'" src="'+esc(u)+'" alt="" onerror="this.style.display=\'none\'">';
}
loadLogos();

/* ---------- explore / list ---------- */
var allCache=[], metaMap={};
async function loadMetaAll(fun){
  try{ var evs=await fun.queryFilter(fun.filters.Meta());
    evs.forEach(function(e){ metaMap[e.args.token.toLowerCase()]={tg:e.args.telegram,tw:e.args.twitter,web:e.args.website,logo:e.args.logo}; });
  }catch(e){}
}
async function fetchMeta(fun,addr){
  var key=addr.toLowerCase();
  if(metaMap[key]) return metaMap[key];
  try{ var evs=await fun.queryFilter(fun.filters.Meta(addr)); if(evs.length){ var a=evs[evs.length-1].args; metaMap[key]={tg:a.telegram,tw:a.twitter,web:a.website,logo:a.logo}; } }catch(e){}
  return metaMap[key]||{};
}
function socialsHTML(m){
  if(!m) return "";
  var out="";
  if(m.tg)  out+='<a href="'+esc(m.tg)+'" target="_blank" rel="noopener">Telegram ↗</a>';
  if(m.tw)  out+='<a href="'+esc(m.tw)+'" target="_blank" rel="noopener">Twitter ↗</a>';
  if(m.web) out+='<a href="'+esc(m.web)+'" target="_blank" rel="noopener">Website ↗</a>';
  return out ? '<div class="socials">'+out+'</div>' : "";
}
var exploreEu=null, sortMode="new";
function mcOfToken(pool, addr){
  // instant token market cap (ETH): price * 1e9 from the pool's slot0
  return (new ethers.Contract(pool, POOL_ABI, provider||rpcProvider())).slot0().then(function(s0){
    var sp=+s0.sqrtPriceX96.toString()/Math.pow(2,96);
    var t0w = WETH.toLowerCase() < addr.toLowerCase();
    var price = t0w ? 1/(sp*sp) : sp*sp;
    return price*1e9;
  },function(){ return null; });
}
async function loadList(){
  if(!CONTRACT_ADDRESS){ $("#list").innerHTML='<div class="note">Set the contract address in this file first.</div>'; return; }
  $("#listInfo").innerHTML='<span class="spin"></span>';
  try{
    var fun=readFun();
    exploreEu=await getEthUsd();
    await loadMetaAll(fun);
    var n=(await fun.tokenCount()).toNumber();
    var out=[];
    for(var i=n-1;i>=0 && i>=n-60;i--){   // newest first, cap 60
      var addr=await fun.allTokens(i);
      var mode=await fun.modeOf(addr);
      var c = mode===0 ? await fun.curves(addr) : null;
      var pool=null, mcEth=null;
      if(mode===1){ try{ pool=(await fun.instant(addr)).pool; mcEth=await mcOfToken(pool,addr); }catch(e){} }
      var t=new ethers.Contract(addr, TOKEN_ABI, provider||rpcProvider());
      var name="", sym="";
      try{ name=await t.name(); sym=await t.symbol(); }catch(e){}
      out.push({addr:addr,mode:mode,name:name,sym:sym,pool:pool,mcEth:mcEth,idx:i,
                sold:c?c.tokensSold:ethers.constants.Zero,
                graduated:c?c.graduated:false,
                social:metaMap[addr.toLowerCase()]||{}});
    }
    allCache=out; renderList(); $("#listInfo").textContent=n+" launched";
  }catch(e){ $("#listInfo").textContent="error"; $("#list").innerHTML='<div class="note err">Could not load: '+esc(String(e.message||e).slice(0,80))+'</div>'; }
}
function thumbHTML(addr, sym){
  var u=logoFor(addr);
  var ph='<div class="thumb ph">'+esc((sym||"?").slice(0,3).toUpperCase())+'</div>';
  if(!u) return '<div class="thumbwrap">'+ph+'</div>';
  return '<div class="thumbwrap">'+ph+'<img class="thumb ov" src="'+esc(u)+'" alt="" onerror="this.style.display=\'none\'"></div>';
}
function renderList(){
  var q=($("#search").value||"").toLowerCase();
  var host=$("#list"); host.innerHTML="";
  var rows=allCache.filter(function(r){ return !q || r.name.toLowerCase().includes(q)||r.sym.toLowerCase().includes(q)||r.addr.toLowerCase().includes(q); });
  if(sortMode==="old") rows=rows.slice().sort(function(a,b){ return a.idx-b.idx; });
  else if(sortMode==="mc") rows=rows.slice().sort(function(a,b){ return (b.mcEth||0)-(a.mcEth||0); });
  // "new" = default (already newest-first)
  if(!rows.length){ host.innerHTML='<div class="note">No token matches.</div>'; return; }
  rows.forEach(function(r){
    var d=document.createElement("div"); d.className="tcard";
    var dexUrl = r.pool ? ("https://dexscreener.com/robinhood/"+r.pool) : ("https://dexscreener.com/search?q="+r.addr);
    var mcTxt = (r.mcEth!=null)
      ? (exploreEu ? fmtUsd(r.mcEth*exploreEu) : r.mcEth.toFixed(3)+" ETH")+" <small>MC</small>"
      : (r.mode===0 ? "on curve" : "<small>—</small>");
    d.innerHTML=thumbHTML(r.addr, r.sym)
      +'<a class="tdex dexlink" href="'+dexUrl+'" target="_blank" title="DexScreener">📊</a>'
      +'<div class="tnm">'+esc(r.name||"?")+'</div>'
      +'<div class="tsy">$'+esc(r.sym||"?")+'</div>'
      +'<div class="tmc">'+mcTxt+'</div>'
      +'<div style="display:flex;align-items:center;gap:5px;margin-top:5px;font-family:\'Space Mono\',monospace;font-size:10px;color:var(--dim)"><span>'+shortAddr(r.addr)+'</span>'+copyMini(r.addr)+'</div>';
    d.querySelectorAll(".dexlink").forEach(function(a){ a.onclick=function(ev){ ev.stopPropagation(); }; });
    d.onclick=function(){ openTrade(r.addr); };
    host.appendChild(d);
  });
}
document.querySelectorAll("#sortSeg button").forEach(function(b){
  b.onclick=function(){
    document.querySelectorAll("#sortSeg button").forEach(function(x){x.classList.remove("on");});
    b.classList.add("on"); sortMode=b.dataset.sort; renderList();
  };
});
$("#search").addEventListener("input",renderList);
$("#reload").onclick=loadList;

/* ---------- my tokens & fees ---------- */
var MAXU128 = ethers.BigNumber.from("0xffffffffffffffffffffffffffffffff");
// simulate the LP fee collection to preview claimable ETH (creator's 70% share)
async function previewFees(lpTokenId){
  try{
    var pm=new ethers.Contract(PM, PM_ABI, provider||rpcProvider());
    var r=await pm.callStatic.collect(
      { tokenId:lpTokenId, recipient:CONTRACT_ADDRESS, amount0Max:MAXU128, amount1Max:MAXU128 },
      { from:CONTRACT_ADDRESS }        // the launchpad owns the position
    );
    return { a0:r.amount0, a1:r.amount1 };
  }catch(e){ return null; }
}
async function loadMine(){
  var host=$("#mineList");
  if(!account){ host.innerHTML='<div class="note">Connect your wallet to see the tokens you launched and claim your fees.</div>'; $("#mineInfo").textContent=""; return; }
  $("#mineInfo").innerHTML='<span class="spin"></span> loading…'; host.innerHTML="";
  try{
    var fun=readFun();
    await loadMetaAll(fun);
    var evs=await fun.queryFilter(fun.filters.Created(null, account));  // creator is indexed
    if(!evs.length){ host.innerHTML='<div class="note">You haven\'t launched any token yet. Go to <b>Create</b> ⚡</div>'; $("#mineInfo").textContent="0 token"; return; }
    var eu=await getEthUsd();
    // newest first, de-dup
    var seen={}, toks=[];
    evs.reverse().forEach(function(e){ var a=e.args.token.toLowerCase(); if(!seen[a]){ seen[a]=1; toks.push(e.args.token); } });
    $("#mineInfo").textContent=toks.length+" token(s)";
    // ---- pass 1: gather each token's data + claimable, compute the total ----
    var rows=[], totalYours=0;
    for(var i=0;i<toks.length;i++){
      var addr=toks[i];
      var t=new ethers.Contract(addr, TOKEN_ABI, provider||rpcProvider());
      var name="",sym=""; try{ name=await t.name(); sym=await t.symbol(); }catch(e){}
      var inst=await fun.instant(addr);
      var yours=0;
      if(inst.exists){
        var pf=await previewFees(inst.lpTokenId);
        if(pf){ var wethAmt=(WETH.toLowerCase()<addr.toLowerCase())?pf.a0:pf.a1; yours=+ethers.utils.formatEther(wethAmt)*0.7; }
      }
      totalYours+=yours;
      rows.push({addr:addr,name:name,sym:sym,pool:(inst.exists?inst.pool:null),yours:yours});
    }
    // ---- header: total claimable + Claim-all ----
    var totalTxt = eu ? (fmtUsd(totalYours*eu)+"  ·  "+totalYours.toFixed(6)+" ETH") : (totalYours.toFixed(6)+" ETH");
    var header='<div class="panel" style="margin:0 0 12px;background:var(--void)">'
      +'<div class="kv" style="border:0"><span class="k">Total claimable (your 70%)</span><span class="v" style="font-size:15px;color:var(--signal)">'+totalTxt+'</span></div>'
      +'<button class="btn primary full" id="claimAllBtn" style="margin-top:8px"'+(totalYours<=1e-9?' disabled':'')+'>💰 Claim all my fees</button>'
      +'<div class="note" id="claimAllNote" style="margin-top:4px">One wallet confirmation per token that has fees.</div></div>';
    // ---- cards ----
    var cards="";
    rows.forEach(function(r){
      var claimHtml = r.yours>0
        ? '<div class="kv"><span class="k">Claimable fees (your 70%)</span><span class="v">'+(eu?fmtUsd(r.yours*eu):r.yours.toFixed(6)+" ETH")+(eu?"  ·  "+r.yours.toFixed(6)+" ETH":"")+'</span></div>'
        : '';
      var dexUrl = r.pool ? ("https://dexscreener.com/robinhood/"+r.pool) : ("https://dexscreener.com/search?q="+r.addr);
      cards+='<div class="card" style="cursor:default"><div class="top"><div style="display:flex;align-items:center;gap:10px">'+logoImg(r.addr)+'<div><span class="nm">'+esc(r.name||"?")+'</span> <span class="sy">$'+esc(r.sym||"?")+'</span></div></div><span style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end"><span class="badge grad">⚡ yours</span>'+lockChip()+'</span></div>'
        +'<div class="meta" style="display:flex;align-items:center;gap:8px"><span style="word-break:break-all">'+r.addr+'</span>'+copyBtn(r.addr)+'</div>'
        +claimHtml
        +'<div class="btnrow" style="margin-top:10px">'
        +'<button class="btn" data-open="'+r.addr+'">📈 Open</button>'
        +'<a class="btn" href="'+dexUrl+'" target="_blank">📊 DexScreener</a>'
        +'<button class="btn primary" data-collect="'+r.addr+'">💰 Collect</button>'
        +'</div><div class="note" data-cnote="'+r.addr+'" style="margin-top:6px"></div></div>';
    });
    host.innerHTML=header+cards;
    // ---- Claim all: one collectFees tx per token that has fees ----
    $("#claimAllBtn").onclick=async function(){
      if(!signer){ openWalletPicker(); return; }
      var list=rows.filter(function(r){ return r.yours>1e-9; });
      if(!list.length){ toast("Nothing to claim"); return; }
      var note=$("#claimAllNote"), btn=$("#claimAllBtn"); btn.disabled=true; var done=0;
      for(var i=0;i<list.length;i++){
        note.className="note"; note.textContent="Claiming "+(i+1)+"/"+list.length+" — confirm in your wallet…";
        try{ var tx=await writeFun().collectFees(list[i].addr); await tx.wait(); done++; }
        catch(e){ /* skipped/failed → continue to the next */ }
      }
      note.className="note ok"; note.textContent="Claimed "+done+"/"+list.length+" 💰"; loadMine();
    };
    // wire per-card buttons
    host.querySelectorAll("[data-open]").forEach(function(b){ b.onclick=function(){ openTrade(b.getAttribute("data-open")); }; });
    host.querySelectorAll("[data-collect]").forEach(function(b){
      b.onclick=async function(){
        if(!signer){ openWalletPicker(); return; }
        var addr=b.getAttribute("data-collect");
        var note=host.querySelector('[data-cnote="'+addr+'"]');
        note.className="note"; note.textContent="Collecting…"; b.disabled=true;
        try{
          var tx=await writeFun().collectFees(addr);
          note.innerHTML='Collecting… <a href="'+CHAIN.scan+'/tx/'+tx.hash+'" target="_blank">↗</a>'; await tx.wait();
          note.className="note ok"; note.textContent="Fees sent — 70% to you 💰"; loadMine();
        }catch(e){ note.className="note err"; note.textContent="Failed · "+String(e.reason||e.message||e).slice(0,120); }
        finally{ b.disabled=false; }
      };
    });
  }catch(e){ host.innerHTML='<div class="note err">Could not load: '+esc(String(e.message||e).slice(0,80))+'</div>'; $("#mineInfo").textContent=""; }
}
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
// every Instant token's liquidity is held by the launchpad with no withdraw path → locked forever
function lockChip(){ return '<span class="badge" style="border-color:rgba(111,209,196,.5);color:var(--signal)">🔒 LP Locked</span>'; }
/* ---------- copy to clipboard ---------- */
function copyText(txt){
  if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
  return new Promise(function(res,rej){
    try{ var ta=document.createElement("textarea"); ta.value=txt; ta.style.position="fixed"; ta.style.opacity="0";
      document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); res(); }
    catch(e){ rej(e); }
  });
}
// delegated (capture phase, so it fires before an Explore card's own onclick)
document.addEventListener("click",function(e){
  var el=e.target.closest ? e.target.closest("[data-copy]") : null;
  if(!el) return;
  e.preventDefault(); e.stopPropagation();
  copyText(el.getAttribute("data-copy")).then(function(){ toast("Address copied ✓"); },function(){ toast("Copy failed"); });
}, true);
function copyBtn(addr){
  return '<button class="btn" data-copy="'+esc(addr)+'" title="Copy contract address" '+
         'style="padding:5px 9px;font-size:12px;line-height:1">📋 Copy</button>';
}
function shortAddr(a){ return a.slice(0,6)+"…"+a.slice(-4); }
function copyMini(addr){
  return '<span data-copy="'+esc(addr)+'" title="Copy contract" style="cursor:pointer;font-size:11px">📋</span>';
}

/* ---------- trade ---------- */
var curToken=null;
var curMode=0;        // 0 = fair curve · 1 = instant (Uniswap)
var curPool=null;     // Uniswap v3 pool (instant tokens)
var curT0IsWeth=false;
var curBalWei=null;   // exact wallet balance of curToken (BigNumber), for "sell all"
var sellUseMax=false; // true when the Sell field was filled by the Max button
$("#loadTrade").onclick=function(){ var a=$("#tradeAddr").value.trim(); if(a) openTrade(a); };
function switchTab(name){ document.querySelector('.tab[data-tab="'+name+'"]').click(); }
function poolC(){ return new ethers.Contract(curPool, POOL_ABI, provider||rpcProvider()); }
function quoterC(){ return new ethers.Contract(QUOTER, QUOTER_ABI, provider||rpcProvider()); }
function routerC(){ return new ethers.Contract(ROUTER, ROUTER_ABI, signer); }
async function openTrade(addr){
  try{ addr=ethers.utils.getAddress(addr); }catch(e){ return toast("Bad address"); }
  switchTab("trade");
  $("#tradeEmpty").classList.add("hidden"); $("#tradeView").classList.remove("hidden");
  curToken=addr; curPool=null;
  try{
    var fun=readFun();
    curMode=await fun.modeOf(addr);
    if(curMode===1){
      var inst=await fun.instant(addr);
      curPool=inst.pool;
      curT0IsWeth = WETH.toLowerCase() < addr.toLowerCase();
    }
  }catch(e){ curMode=0; }
  await refreshTrade();
}
/* ---------- price chart (candlesticks from on-chain trades) ---------- */
var TF_LIST=[["1m",60],["5m",300],["15m",900],["1h",3600],["4h",14400],["24h",86400]];
var candleState={token:null,trades:[],tf:3600,ethUsd:null};
var chartReq=0, ethUsdCache=null;
var mcapAt=function(s){ return 1e18/Math.pow(1e9-s,2); }; // ETH, s in whole tokens

function fmtUsd(n){
  if(!isFinite(n)) return "—";
  if(n>=1e9) return "$"+(n/1e9).toFixed(2)+"B";
  if(n>=1e6) return "$"+(n/1e6).toFixed(2)+"M";
  if(n>=1e3) return "$"+(n/1e3).toFixed(1)+"K";
  return "$"+(n>=1?n.toFixed(2):n.toFixed(4));
}
function fmtPrice(p){ if(!isFinite(p)) return "—"; if(p>=1) return "$"+p.toFixed(3); if(p>=0.0001) return "$"+p.toFixed(6); return "$"+p.toExponential(2); }

async function getEthUsd(){
  if(ethUsdCache) return ethUsdCache;
  try{
    var r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",{cache:"no-store"});
    var j=await r.json(); if(j&&j.ethereum&&j.ethereum.usd){ ethUsdCache=j.ethereum.usd; return ethUsdCache; }
  }catch(e){}
  try{
    var r2=await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum");
    var j2=await r2.json(); var c=j2&&j2.coins&&j2.coins["coingecko:ethereum"];
    if(c&&c.price){ ethUsdCache=c.price; return ethUsdCache; }
  }catch(e){}
  return null;
}

async function fetchTrades(token){
  var fun=readFun();
  var res=await Promise.all([
    fun.queryFilter(fun.filters.Buy(token),0,"latest"),
    fun.queryFilter(fun.filters.Sell(token),0,"latest")
  ]);
  var evs=[];
  res[0].forEach(function(l){ evs.push({bn:l.blockNumber,li:l.logIndex,tx:l.transactionHash,who:l.args.buyer,type:"buy",tokens:+ethers.utils.formatEther(l.args.tokensOut),eth:+ethers.utils.formatEther(l.args.ethIn)}); });
  res[1].forEach(function(l){ evs.push({bn:l.blockNumber,li:l.logIndex,tx:l.transactionHash,who:l.args.seller,type:"sell",tokens:+ethers.utils.formatEther(l.args.tokensIn),eth:+ethers.utils.formatEther(l.args.ethOut)}); });
  if(!evs.length) return [];
  evs.sort(function(a,b){ return a.bn-b.bn || a.li-b.li; });
  var prov=provider||rpcProvider();
  var uniq={}; evs.forEach(function(e){ uniq[e.bn]=1; });
  var bns=Object.keys(uniq);
  var stamps=await Promise.all(bns.map(function(b){ return prov.getBlock(parseInt(b)).then(function(bl){return {b:b,t:bl?bl.timestamp:0};},function(){return {b:b,t:0};}); }));
  var tmap={}; stamps.forEach(function(s){ tmap[s.b]=s.t; });
  var sold=0;
  evs.forEach(function(e){
    if(e.type==="buy") sold+=e.tokens; else sold-=e.tokens;
    if(sold<0) sold=0;
    e.mcap=mcapAt(sold);       // ETH
    e.ts=tmap[e.bn]||0;
  });
  return evs;
}

// instant tokens: rebuild trades from the Uniswap pool's Swap events
async function fetchTradesInstant(){
  if(!curPool) return [];
  var pc=poolC();
  var logs=await pc.queryFilter(pc.filters.Swap(),0,"latest");
  if(!logs.length) return [];
  var evs=logs.map(function(l){
    var aW=curT0IsWeth?l.args.amount0:l.args.amount1;
    var aT=curT0IsWeth?l.args.amount1:l.args.amount0;
    var sp=+l.args.sqrtPriceX96.toString()/Math.pow(2,96);
    var price=curT0IsWeth? 1/(sp*sp) : sp*sp;        // weth per token
    return {bn:l.blockNumber,li:l.logIndex,tx:l.transactionHash,who:l.args.recipient,
      type:aW.gt(0)?"buy":"sell",
      eth:Math.abs(+ethers.utils.formatEther(aW)),
      tokens:Math.abs(+ethers.utils.formatEther(aT)),
      mcap:price*1e9};                                // FDV in ETH (1B supply)
  });
  evs.sort(function(a,b){ return a.bn-b.bn || a.li-b.li; });
  var prov=provider||rpcProvider();
  var uniq={}; evs.forEach(function(e){ uniq[e.bn]=1; });
  var stamps=await Promise.all(Object.keys(uniq).map(function(b){ return prov.getBlock(parseInt(b)).then(function(bl){return {b:b,t:bl?bl.timestamp:0};},function(){return {b:b,t:0};}); }));
  var tmap={}; stamps.forEach(function(s){ tmap[s.b]=s.t; });
  evs.forEach(function(e){ e.ts=tmap[e.bn]||0; });
  return evs;
}

function buildCandles(trades, tf){
  if(!trades||!trades.length) return [];
  var buckets={}, order=[];
  trades.forEach(function(t){
    if(!t.ts) return;
    var k=Math.floor(t.ts/tf)*tf;
    if(!buckets[k]){ buckets[k]={t:k,o:t.mcap,h:t.mcap,l:t.mcap,c:t.mcap,v:0}; order.push(k); }
    var b=buckets[k]; if(t.mcap>b.h)b.h=t.mcap; if(t.mcap<b.l)b.l=t.mcap; b.c=t.mcap; b.v+=t.eth;
  });
  order.sort(function(a,b){return a-b;});
  var out=[];
  for(var i=0;i<order.length;i++){
    if(i>0){
      var gap=Math.round((order[i]-order[i-1])/tf), pc=buckets[order[i-1]].c;
      for(var g=1;g<gap && out.length<400;g++){ out.push({t:order[i-1]+g*tf,o:pc,h:pc,l:pc,c:pc,v:0,flat:true}); }
    }
    out.push(buckets[order[i]]);
  }
  return out;
}

function drawCandles(candles, ethUsd){
  var cv=$("#tvChart"); if(!cv) return; var x=cv.getContext("2d");
  var W=cv.width,H=cv.height, padL=64,padR=14,padT=14,padB=20;
  var plotW=W-padL-padR, plotH=H-padT-padB;
  x.clearRect(0,0,W,H); x.font="10px 'Space Mono',monospace"; x.textAlign="left";
  if(!candles.length){
    if(!EMPTY_IMG_OK){                       // no mascot image → keep the text
      x.fillStyle="#A08a63"; x.textAlign="center";
      x.fillText("No trades yet — be the first to buy 🚀", W/2, H/2);
      x.textAlign="left";
    }
    return;                                   // the mascot <img> overlay handles the empty look
  }
  var N=Math.min(candles.length,90), view=candles.slice(-N);
  var lo=Infinity,hi=-Infinity;
  view.forEach(function(c){ if(c.l<lo)lo=c.l; if(c.h>hi)hi=c.h; });
  if(!(hi>lo)){ hi=lo*1.05||1; lo=lo*0.95; }
  var rng=hi-lo; lo-=rng*0.08; hi+=rng*0.08;
  var mul=ethUsd||1;
  var sy=function(v){ return padT+plotH-((v-lo)/(hi-lo))*plotH; };
  // grid + y labels (mcap)
  x.strokeStyle="rgba(160,138,99,.16)"; x.fillStyle="#A08a63"; x.lineWidth=1;
  for(var i=0;i<=4;i++){
    var v=lo+(hi-lo)*i/4, yy=sy(v);
    x.beginPath(); x.moveTo(padL,yy); x.lineTo(W-padR,yy); x.stroke();
    x.fillText(ethUsd? fmtUsd(v*mul) : (v.toFixed(3)+"E"), 4, yy+3);
  }
  // candles
  var slot=plotW/N, bw=Math.max(2,Math.min(14,slot*0.62));
  for(var k=0;k<view.length;k++){
    var c=view[k], cx=padL+slot*k+slot/2, up=c.c>=c.o, col=up?"#3fb96b":"#e5544b";
    if(c.flat){ x.fillStyle="#6b5f4a"; x.fillRect(cx-bw/2, sy(c.c)-0.5, bw, 1); continue; }
    x.strokeStyle=col; x.fillStyle=col; x.lineWidth=1;
    x.beginPath(); x.moveTo(cx+.5,sy(c.h)); x.lineTo(cx+.5,sy(c.l)); x.stroke();
    var yo=sy(c.o), yc=sy(c.c), top=Math.min(yo,yc), hgt=Math.max(1,Math.abs(yc-yo));
    x.fillRect(cx-bw/2, top, bw, hgt);
  }
}

function renderChart(){
  var candles=buildCandles(candleState.trades, candleState.tf);
  var e=$("#tvEmpty"); if(e) e.style.display=(!candles.length && EMPTY_IMG_OK)?"block":"none";
  drawCandles(candles, candleState.ethUsd);
}

async function loadAndRenderChart(token, eu){
  var my=++chartReq, tr=[];
  try{ tr = curMode===1 ? await fetchTradesInstant() : await fetchTrades(token); }catch(e){ tr=[]; }
  if(my!==chartReq) return;                 // a newer request superseded this one
  candleState.token=token; candleState.trades=tr; candleState.ethUsd=eu;
  renderChart(); renderTrades();
}

// ---- recent-trades history (pump.fun style) ----
function relTime(s){ if(s<0)s=0; if(s<60)return s+"s"; if(s<3600)return Math.floor(s/60)+"m"; if(s<86400)return Math.floor(s/3600)+"h"; return Math.floor(s/86400)+"d"; }
function fmtNum(n){ if(n>=1e9)return (n/1e9).toFixed(2)+"B"; if(n>=1e6)return (n/1e6).toFixed(2)+"M"; if(n>=1e3)return (n/1e3).toFixed(1)+"K"; return n.toFixed(n<1?4:0); }
function renderTrades(){
  var el=$("#tvTrades"); if(!el) return;
  var tr=(candleState.trades||[]).slice().reverse();
  if(!tr.length){ el.innerHTML='<span style="color:#A08a63">No trades yet — be the first 🚀</span>'; return; }
  var eu=candleState.ethUsd, now=Math.floor(Date.now()/1000);
  var me=account?account.toLowerCase():"";
  var rows=tr.slice(0,50).map(function(e){
    var col=e.type==="buy"?"#3fb96b":"#e5544b";
    var ethStr=eu?("$"+(e.eth*eu).toFixed(2)):(e.eth.toFixed(5));
    var who=e.who?(e.who.slice(0,6)+"…"+e.who.slice(-4)):"";
    var mine=e.who&&e.who.toLowerCase()===me;
    return '<tr'+(mine?' style="background:rgba(230,165,55,.10)"':'')+'>'+
      '<td style="padding:5px 6px;color:'+col+';font-weight:700;text-transform:uppercase">'+e.type+'</td>'+
      '<td style="padding:5px 6px">'+ethStr+'</td>'+
      '<td style="padding:5px 6px">'+fmtNum(e.tokens)+'</td>'+
      '<td style="padding:5px 6px"><a href="'+CHAIN.scan+'/address/'+e.who+'" target="_blank" style="color:#A08a63;text-decoration:none">'+who+(mine?' (you)':'')+'</a></td>'+
      '<td style="padding:5px 6px;color:#A08a63">'+relTime(now-(e.ts||now))+'</td>'+
      '<td style="padding:5px 6px"><a href="'+CHAIN.scan+'/tx/'+e.tx+'" target="_blank" style="text-decoration:none">↗</a></td>'+
    '</tr>';
  }).join("");
  el.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12px">'+
    '<thead><tr style="color:#A08a63;text-align:left;position:sticky;top:0;background:var(--panel,#120d08)">'+
    '<th style="padding:5px 6px">Type</th><th style="padding:5px 6px">'+(eu?"$":"ETH")+'</th><th style="padding:5px 6px">Tokens</th><th style="padding:5px 6px">Wallet</th><th style="padding:5px 6px">Time</th><th></th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table>';
}

// ---- quick-buy chips: 10/20/50/90 % of your ETH balance ----
var BUY_PCTS=[10,20,50,90];
function buildBuyPcts(){
  var bar=$("#buyPcts"); if(!bar) return; bar.innerHTML="";
  BUY_PCTS.forEach(function(p){
    var b=document.createElement("button");
    b.textContent=p+"%";
    b.style.cssText="padding:4px 10px;border-radius:7px;border:1px solid var(--line);background:transparent;color:#A08a63;font:600 12px 'Space Mono',monospace;cursor:pointer";
    b.onclick=async function(){
      if(!account){ openWalletPicker(); return; }
      try{
        var bal=await (provider||rpcProvider()).getBalance(account);
        var s=(+ethers.utils.formatEther(bal.mul(p).div(100))).toFixed(6).replace(/0+$/,"").replace(/\.$/,"");
        $("#buyEth").value=s||"0"; quoteBuy();
      }catch(e){ toast("Couldn't read your ETH balance"); }
    };
    bar.appendChild(b);
  });
}
buildBuyPcts();

function buildTfBar(){
  var bar=$("#tfBar"); if(!bar) return; bar.innerHTML="";
  TF_LIST.forEach(function(p){
    var on=candleState.tf===p[1];
    var b=document.createElement("button");
    b.textContent=p[0];
    b.style.cssText="padding:4px 10px;border-radius:7px;border:1px solid var(--line);background:"+(on?"#E6A537":"transparent")+";color:"+(on?"#1a1206":"#A08a63")+";font:600 12px 'Space Mono',monospace;cursor:pointer";
    b.onclick=function(){ candleState.tf=p[1]; buildTfBar(); renderChart(); };
    bar.appendChild(b);
  });
}
buildTfBar();
async function refreshTrade(){
  var fun=readFun();
  var t=new ethers.Contract(curToken, TOKEN_ABI, provider||rpcProvider());
  var name="",sym=""; try{ name=await t.name(); sym=await t.symbol(); }catch(e){}
  $("#tvName").textContent=name||"?"; $("#tvSym").textContent="$"+(sym||"?");
  $("#tvLogo").innerHTML=logoImg(curToken,"big");
  $("#tvAddr").innerHTML='<span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    +'<a href="'+CHAIN.scan+'/address/'+curToken+'" target="_blank" style="word-break:break-all">'+curToken+' ↗</a>'
    +copyBtn(curToken)+'</span>';
  fetchMeta(fun, curToken).then(function(m){ $("#tvSocials").innerHTML=socialsHTML(m); $("#tvLogo").innerHTML=logoImg(curToken,"big"); });
  var eu=await getEthUsd();
  var mcap, price;

  if(curMode===1){
    /* ---- instant token: live Uniswap pool ---- */
    $("#tvGradWrap").style.display="none";
    $("#tvInstantRow").style.display="flex";
    $("#tvDexBtn").href = curPool ? ("https://dexscreener.com/robinhood/"+curPool) : ("https://dexscreener.com/search?q="+curToken);
    $("#tvBadge").textContent="⚡ live on Uniswap"; $("#tvBadge").className="badge grad";
    $("#tvLock").innerHTML=lockChip()+' <span class="note" style="margin:0">Liquidity locked in the launchpad — non-ruggable.</span>';
    $("#tvTradePanel").style.opacity="1";
    $("#tvRewardRow").style.display="none"; $("#claimBtn").style.display="none";
    try{
      var s0=await poolC().slot0();
      var sp=+s0.sqrtPriceX96.toString()/Math.pow(2,96);
      price = curT0IsWeth ? 1/(sp*sp) : sp*sp;    // weth per token
      mcap  = price*1e9;
    }catch(e){ price=0; mcap=0; }
  }else{
    /* ---- curve token ---- */
    var c=await fun.curves(curToken);
    $("#tvGradWrap").style.display="block";
    $("#tvInstantRow").style.display="none";
    $("#tvLock").innerHTML="";
    var pct=Math.min(100, c.tokensSold.mul(10000).div(CURVE_SUPPLY).toNumber()/100);
    $("#tvBar").style.width=(c.graduated?100:pct)+"%";
    $("#tvProg").textContent=c.graduated?"Graduated — now trading on Uniswap.":(pct.toFixed(2)+"% of the curve sold");
    var soldHuman=+ethers.utils.formatEther(c.tokensSold);
    mcap=1e18/Math.pow(1e9-soldHuman,2);          // = price * total supply, in ETH
    price=mcap/1e9;                               // ETH per token
    $("#tvBadge").textContent=c.graduated?"graduated ✓":"on curve"; $("#tvBadge").className="badge"+(c.graduated?" grad":"");
    $("#tvTradePanel").style.opacity=c.graduated?".5":"1";
    if(account){
      var isHolders = c.feeMode===1;
      $("#tvRewardRow").style.display=isHolders?"flex":"none";
      $("#claimBtn").style.display=isHolders?"block":"none";
      if(isHolders){ var pend=await fun.pendingRewards(curToken,account); $("#tvReward").textContent=(+ethers.utils.formatEther(pend)).toFixed(6)+" ETH"; }
    }
  }

  $("#tvMcap").textContent = eu ? (fmtUsd(mcap*eu)+"  ·  "+mcap.toFixed(3)+" ETH") : (mcap.toFixed(4)+" ETH");
  $("#tvPrice").textContent = eu ? (fmtPrice(price*eu)+"  ·  "+price.toExponential(2)+" ETH") : (price.toExponential(3)+" ETH");
  loadAndRenderChart(curToken, eu);

  if(account){
    var bal=await t.balanceOf(account);
    curBalWei=bal;
    $("#tvBal").textContent=(+ethers.utils.formatEther(bal)).toLocaleString("en-US")+" "+(sym||"");
  } else { $("#tvBal").textContent="connect wallet"; }
}
// mobile-safe amount: accept comma decimals, return a clean "." string
function amtStr(id){ return ($(id).value||"").trim().replace(/\s/g,"").replace(/,/g,"."); }
var quoteT=null;
$("#buyEth").addEventListener("input",function(){ clearTimeout(quoteT); quoteT=setTimeout(quoteBuy,250); });
async function quoteBuy(){
  var raw=amtStr("#buyEth"); if(!parseFloat(raw)||!curToken){ $("#buyQuote").textContent=""; return; }
  try{
    if(curMode===1){
      var qi=await quoterC().callStatic.quoteExactInputSingle({tokenIn:WETH,tokenOut:curToken,amountIn:ethers.utils.parseEther(raw),fee:POOL_FEE,sqrtPriceLimitX96:0});
      $("#buyQuote").textContent="≈ "+(+ethers.utils.formatEther(qi.amountOut)).toLocaleString("en-US")+" tokens (Uniswap, 1% fee incl.)";
    }else{
      var q=await readFun().quoteBuy(curToken, ethers.utils.parseEther(raw));
      $("#buyQuote").textContent="≈ "+(+ethers.utils.formatEther(q.tokensOut)).toLocaleString("en-US")+" tokens (fee "+(+ethers.utils.formatEther(q.fee)).toFixed(6)+" ETH)";
    }
  }catch(e){ $("#buyQuote").textContent=""; }
}
// live comma → dot on all number fields (mobile FR keyboards type a comma)
["#buyEth","#sellTok"].forEach(function(id){
  var el=$(id); if(!el) return;
  el.addEventListener("input",function(){ if(this.value.indexOf(",")>-1){ var p=this.selectionStart; this.value=this.value.replace(/,/g,"."); try{this.setSelectionRange(p,p);}catch(e){} } });
});
$("#sellTok").addEventListener("input",function(){ sellUseMax=false; clearTimeout(quoteT); quoteT=setTimeout(quoteSell,250); });
$("#sellMaxLink").addEventListener("click",function(e){
  e.preventDefault();
  if(!account){ openWalletPicker(); return; }
  if(!curBalWei||curBalWei.isZero()){ toast("No tokens to sell"); return; }
  sellUseMax=true;                                  // sell the EXACT on-chain balance
  $("#sellTok").value=ethers.utils.formatEther(curBalWei);  // just for display
  quoteSell();
});
async function quoteSell(){
  var raw=amtStr("#sellTok"); if(!parseFloat(raw)||!curToken){ $("#sellQuote").textContent=""; return; }
  try{
    var amt = sellUseMax&&curBalWei ? curBalWei : ethers.utils.parseEther(raw);
    if(curMode===1){
      var qi=await quoterC().callStatic.quoteExactInputSingle({tokenIn:curToken,tokenOut:WETH,amountIn:amt,fee:POOL_FEE,sqrtPriceLimitX96:0});
      $("#sellQuote").textContent="≈ "+(+ethers.utils.formatEther(qi.amountOut)).toFixed(6)+" ETH (Uniswap, 1% fee incl.)";
    }else{
      var q=await readFun().quoteSell(curToken, amt);
      $("#sellQuote").textContent="≈ "+(+ethers.utils.formatEther(q.ethOut)).toFixed(6)+" ETH (fee "+(+ethers.utils.formatEther(q.fee)).toFixed(6)+")";
    }
  }catch(e){ $("#sellQuote").textContent=""; }
}
$("#buyBtn").onclick=async function(){
  if(!signer){ openWalletPicker(); return; }
  var raw=amtStr("#buyEth"); if(!parseFloat(raw)) return toast("Enter an ETH amount");
  var note=$("#tradeNote"); note.className="note"; note.textContent="Confirm in your wallet…";
  try{
    var wei=ethers.utils.parseEther(raw);
    var tx;
    if(curMode===1){
      // Uniswap: pay with raw ETH, router wraps it
      var qi=await quoterC().callStatic.quoteExactInputSingle({tokenIn:WETH,tokenOut:curToken,amountIn:wei,fee:POOL_FEE,sqrtPriceLimitX96:0});
      var minO=qi.amountOut.mul(97).div(100);   // 3% slippage
      tx=await routerC().exactInputSingle(
        {tokenIn:WETH,tokenOut:curToken,fee:POOL_FEE,recipient:account,amountIn:wei,amountOutMinimum:minO,sqrtPriceLimitX96:0},
        {value:wei});
    }else{
      var q=await readFun().quoteBuy(curToken,wei);
      var minOut=q.tokensOut.mul(97).div(100); // 3% slippage
      tx=await writeFun().buy(curToken,minOut,{value:wei});
    }
    note.innerHTML='Buying… <a href="'+CHAIN.scan+'/tx/'+tx.hash+'" target="_blank">↗</a>'; await tx.wait();
    note.className="note ok"; note.textContent="Bought ✅"; $("#buyEth").value=""; $("#buyQuote").textContent=""; refreshTrade();
  }catch(e){ note.className="note err"; note.textContent="Failed · "+String(e.reason||e.message||e).slice(0,140); }
};
$("#sellBtn").onclick=async function(){
  if(!signer){ openWalletPicker(); return; }
  var raw=amtStr("#sellTok"); if(!parseFloat(raw)) return toast("Enter a token amount");
  var note=$("#tradeNote"); note.className="note";
  try{
    var amt = sellUseMax && curBalWei ? curBalWei : ethers.utils.parseEther(raw);
    var t=new ethers.Contract(curToken,TOKEN_ABI,signer);
    // never try to sell more than the wallet holds (prevents "revert: balance")
    var onchainBal=await t.balanceOf(account);
    if(amt.gt(onchainBal)) amt=onchainBal;
    if(amt.isZero()) return toast("No tokens to sell");
    var spender = curMode===1 ? ROUTER : CONTRACT_ADDRESS;
    var allowance=await t.allowance(account,spender);
    if(allowance.lt(amt)){ note.textContent="Approving…"; await (await t.approve(spender,ethers.constants.MaxUint256)).wait(); }
    var tx;
    if(curMode===1){
      // Uniswap: swap token→WETH to the router, then unwrap to native ETH in one tx
      var qi=await quoterC().callStatic.quoteExactInputSingle({tokenIn:curToken,tokenOut:WETH,amountIn:amt,fee:POOL_FEE,sqrtPriceLimitX96:0});
      var minE=qi.amountOut.mul(97).div(100);
      var rt=routerC(), ri=rt.interface;
      var c1=ri.encodeFunctionData("exactInputSingle",[{tokenIn:curToken,tokenOut:WETH,fee:POOL_FEE,recipient:"0x0000000000000000000000000000000000000002",amountIn:amt,amountOutMinimum:minE,sqrtPriceLimitX96:0}]);
      var c2=ri.encodeFunctionData("unwrapWETH9",[minE,account]);
      note.textContent="Confirm the sell…";
      tx=await rt.multicall([c1,c2]);
    }else{
      var q=await readFun().quoteSell(curToken,amt);
      var minEth=q.ethOut.mul(97).div(100);
      note.textContent="Confirm the sell…";
      tx=await writeFun().sell(curToken,amt,minEth);
    }
    note.innerHTML='Selling… <a href="'+CHAIN.scan+'/tx/'+tx.hash+'" target="_blank">↗</a>'; await tx.wait();
    note.className="note ok"; note.textContent="Sold ✅"; sellUseMax=false; $("#sellTok").value=""; $("#sellQuote").textContent=""; refreshTrade();
  }catch(e){ note.className="note err"; note.textContent="Failed · "+String(e.reason||e.message||e).slice(0,140); }
};
$("#tvCollectBtn").onclick=async function(){
  if(!signer){ openWalletPicker(); return; }
  var note=$("#tradeNote"); note.className="note"; note.textContent="Collecting pool fees…";
  try{
    var tx=await writeFun().collectFees(curToken);
    note.innerHTML='Collecting… <a href="'+CHAIN.scan+'/tx/'+tx.hash+'" target="_blank">↗</a>'; await tx.wait();
    note.className="note ok"; note.textContent="Fees collected — 70% creator / 30% SWOGE 💰";
  }catch(e){ note.className="note err"; note.textContent="Failed · "+String(e.reason||e.message||e).slice(0,140); }
};
$("#claimBtn").onclick=async function(){
  if(!signer){ openWalletPicker(); return; }
  var note=$("#tradeNote"); note.className="note"; note.textContent="Claiming…";
  try{ var tx=await writeFun().claimRewards(curToken); await tx.wait(); note.className="note ok"; note.textContent="Rewards claimed 💰"; refreshTrade(); }
  catch(e){ note.className="note err"; note.textContent="Failed · "+String(e.reason||e.message||e).slice(0,120); }
};
})();
</script>
</html>
