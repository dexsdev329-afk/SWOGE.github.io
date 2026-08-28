/* Modele fidele du _distributeToHolders corrige. Verifie la LOGIQUE (pas le
   bytecode) : solvabilite, absence de double comptage, non-debordement. */
const MAG=2n**128n, MPS_MAX=50000000000000000000000000000000000000000000000000n; // 5e49
const TOTAL=10n**9n*10n**18n, PLANCHER=TOTAL*100n/10000n, U=2n**256n-1n;
let mps=0n, carry=0n, reserve=0n, held=0n, tresor=0n, claimed=0n;
const log=[];
function distribute(amount, s){
  held+=amount;                       // le SWOGE arrive dans le contrat
  const montant=amount+carry;
  if(montant===0n) return 'noop';
  if(montant*MAG>U) throw new Error('DEBORDEMENT montant*MAG');
  if(s<PLANCHER){ carry=montant; return 'differe'; }
  const pas = montant*MAG/s;
  if(pas===0n){ carry=montant; return 'differe'; }
  if(pas>montant*MAG/PLANCHER) throw new Error('borne sur pas violee');
  if(mps+pas>MPS_MAX){ carry=0n; held-=montant; tresor+=montant; return 'terminal'; }
  carry=0n; mps+=pas; reserve+=montant; return 'reparti';
}
function check(t){
  if(mps>MPS_MAX) throw new Error('mps > MPS_MAX');
  if(reserve-claimed+carry!==held) throw new Error(`INSOLVABLE @${t}: reserve-claimed+carry=${reserve-claimed+carry} held=${held}`);
}
// scenario 1 : lancement (s=0), puis flottant qui remonte
log.push(['s=0 au lancement', distribute(700n*10n**18n,0n)]); check(1);
log.push(['toujours s=0',      distribute(700n*10n**18n,0n)]); check(2);
log.push(['sous plancher',     distribute(700n*10n**18n,PLANCHER-1n)]); check(3);
const avant=carry;
log.push(['plancher atteint',  distribute(0n,PLANCHER)]); check(4);
if(reserve!==avant) throw new Error('la retenue n a pas ete versee integralement');
// scenario 2 : reclamation puis retour sous le plancher
claimed+=reserve; held-=reserve; check(5);
log.push(['re-sous plancher',  distribute(500n*10n**18n,1n)]); check(6);
log.push(['remonte',           distribute(0n,TOTAL/2n)]); check(7);
// scenario 3 : plafond terminal
mps=MPS_MAX; log.push(['plafond', distribute(10n**18n,PLANCHER)]); check(8);
// scenario 4 : bornes extremes
mps=0n; held-=carry; carry=0n;   // remise a zero du banc d essai, pas du contrat
log.push(['tout le SWOGE d un coup', distribute(TOTAL, PLANCHER)]); check(9);
for(const[a,b]of log) console.log(String(a).padEnd(26),b);
console.log('\nOK — solvabilite tenue aux 9 points, mps<=MPS_MAX, aucun debordement.');
console.log('tresor',tresor,'\nreserve',reserve,'carry',carry,'held',held);
