'use strict';
/* La transaction Solana de la page de test (x402_solana.js), contre la
   reference : vecteurs produits le 27/09/2026 par @solana/web3.js 1.99.0 et
   @solana/spl-token (TransactionMessage.compileToV0Message, avec les memes
   quatre instructions que le client x402 @x402/svm) — figes ici pour que
   l'essai tourne sans ces bibliotheques. */
globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));
const S = require('./x402_solana.js');
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const V = [{"payeur":"Awu2hW4RmnEgFeax4qU4iqUnBMQtytV1MhqQkm4sqoyJ","payTo":"71AVQg1nKfEkxM3fWcduS8Rxp9F2tcKptcednG9KdCYT","fee":"82BG2qtNN4hajwrUwHKXkwGwcSZzYghKen4EKpAmAafP","bh":"78s3tr7HEiszyGM7XRiHDaqwTcVadvaCjogP5ojbbVNb","amount":"20000","memo":"abababababababababababababababab","source":"H4qLnbR9bUAXK4BPN7KVfY8esXrnKrmwgGoua4G2H63x","dest":"6pvnwmupCqTfot8sNjvEyj5Bv9cyFaUddq4wQRcnyXko","message":"8002010408684efd4781aeea3a4375cc494d1bb66e4a80b1796216ac30602ade99c382c0de93c9602f5d1de8f3f54e6d0883144a0e42364a7794538c581bd280bf2d494c39eeb6648b3cb11d85300e52f0ef245e6be2181d75c907e3962bc8750e869c978f56918e3dc5796c2ddfaa4b439179a7ef85e40d2b3616f16e2f440427b6bf19140306466fe5211732ffecadba72c39be7bc8ce5bbc5f7126b2c439b3a4000000006ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d5b29c760a2ea33425364ee165cd495fbaeb71f659b2937618d66e2b0633804040404000502204e00000400090301000000000000000504020603010a0c204e00000000000006070020616261626162616261626162616261626162616261626162616261626162616200"},{"payeur":"9E8D7NsBPR8c2YRmZEpZSKbQi6EEyzqSX5VxWYLRLF68","payTo":"B3rDuPhYuwsUa2JVYyTwgyHUhWsqor6xHvui2ryKCHEC","fee":"BTVkwhkiwMExRnZrpxjSLgHBeyaDPc9dtKqioxL5bfQ3","bh":"HpyfDeYVAPUnMTbgnmH5zyJNzsU3xEqFxJZdPnhHfYQb","amount":"541000","memo":"0123456789abcdef0123456789abcdef","source":"7CxtGY868wxJW2uvBHJ1FdzuYTtWWAPXq9rxf1ysZJsr","dest":"6fHbTm83bahwTPFSyg18hevenx94bPakHn82DUvFXZxx","message":"80020104089b5e7c9639aac5788c4c1b691f7d53db3475662da65d81547276f18ea9bbe4c07a3a326a67fa555cb94391ce5b607c865e1c5b772f3382081588b0beccad6fb95c36b2d89c567811d7c4ca5b942cf8d37f3bb91e7ab7c95b6b69167d80f2f809541944b97ce15b96132e511b2e45c79c2ec62b45f0b92ee5a69091af79b7b49d0306466fe5211732ffecadba72c39be7bc8ce5bbc5f7126b2c439b3a4000000006ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448dfa055a72510b027ed775d795c80a9e7a42c5fa93f23d780b7bb27c94782250e40404000502204e00000400090301000000000000000504020603010a0c484108000000000006070020303132333435363738396162636465663031323334353637383961626364656600"},{"payeur":"J557TqEMegiDrRmAZbjy8ztqzANx1nY4Z6XwhwmSHLCv","payTo":"6SaaNtFkaWetoiymHZ71Fg5HhrfRkQawTQmiL1JeeP45","fee":"8oR7Ai74QqyYN4AbJYShhepqxMCP9p6d6priWQfXpimd","bh":"HsDVE6ofsmYEDbyH3oeKanHZEd9EaGorcEoe2kghwTP7","amount":"22000","memo":"ffeeddccbbaa99887766554433221100","source":"6gQhNGeoSuHSd8PeCaFdXdHL7h5x1HL3jEbgwvj3YB45","dest":"48Q1jLkLG5RizF2fwjUFmCD9imJo4kAPNffPvdosUL8c","message":"800201040873e5c866f5c90bca3c9693430008fa5ba130a36f36d8d54467b8aefcdf4b3718fda1a6586ac87a609a2a53430151da4aadaf955b86f221e94514bc903c52b86f5462e11aae9ad788dea7ab1f750c2697ca7ba33d30c57d937a7a52214da176922e7825986a3c48c2bb70e5d9b0c887f92dce084a050f678bae841e6293ca4cfd0306466fe5211732ffecadba72c39be7bc8ce5bbc5f7126b2c439b3a4000000006ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448dfa98266501c325dfd65b6569ef256fd9ce7c0855abeca5557e741149d17a793a0404000502204e00000400090301000000000000000504020603010a0cf05500000000000006070020666665656464636362626161393938383737363635353434333332323131303000"}];
let n = 0, rates = 0;
const ok = (c, m) => { n++; if (!c) rates++; console.log((c ? '  ok   ' : '  RATE ') + m); };

(async () => {
  for (const v of V) {
    const acc = { amount: v.amount, asset: USDC, payTo: v.payTo, extra: { feePayer: v.fee } };
    const t = await S.construit(acc, { payeur: v.payeur, blockhash: v.bh, memo: v.memo });
    ok(t.source === v.source && t.dest === v.dest, v.amount + ' : comptes USDC du payeur et de payTo = ceux de spl-token');
    ok(Buffer.from(t.message).toString('hex') === v.message, v.amount + ' : message v0 identique, octet pour octet, a web3.js (' + t.message.length + ' octets)');
    ok(t.octets[0] === 2 && t.octets.slice(1, 129).every((b) => b === 0) && Buffer.from(t.octets.slice(129)).equals(Buffer.from(t.message)),
       v.amount + ' : format de fil = 2 signatures vides (feePayer, payeur) + message');
  }
  const acc0 = { amount: '20000', asset: USDC, payTo: V[0].payTo, extra: { feePayer: V[0].fee } };
  const a = await S.construit(acc0, { payeur: V[0].payeur, blockhash: V[0].bh });
  const b = await S.construit(acc0, { payeur: V[0].payeur, blockhash: V[0].bh });
  const memoDe = (m) => Buffer.from(m.slice(m.length - 33, m.length - 1)).toString();
  ok(/^[0-9a-f]{32}$/.test(memoDe(a.message)) && memoDe(a.message) !== memoDe(b.message), 'sans memo impose : 16 octets aleatoires en hexadecimal, differents a chaque paiement');
  let refus = 0;
  for (const mauvais of [{ amount: '20000', asset: USDC, payTo: V[0].payTo, extra: {} }, { amount: '2e4', asset: USDC, payTo: V[0].payTo, extra: { feePayer: V[0].fee } }]) {
    try { await S.construit(mauvais, { payeur: V[0].payeur, blockhash: V[0].bh }); } catch (e) { refus++; }
  }
  ok(refus === 2, 'sans feePayer, ou un montant qui n est pas un entier : rien n est construit');
  ok(S.b58enc(S.b58dec('1112ab')) === '1112ab' && S.b58dec(USDC).length === 32, 'base58 aller-retour, zeros de tete compris');
  ok(S.b64(new Uint8Array([0, 255, 1])) === 'AP8B', 'base64 des octets');
  console.log('\nVERIFICATIONS : ' + n + (rates ? '  —  RATES : ' + rates + '/' + n : '  —  tout passe'));
  process.exit(rates ? 1 : 0);
})().catch((e) => { console.error('ESSAI CASSE :', e); process.exit(1); });
