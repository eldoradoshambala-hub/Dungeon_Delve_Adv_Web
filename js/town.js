"use strict";
/* ============================================================
   町：迷宮の掲示板・宿屋・寺院・道具屋
   ============================================================ */
function town(arrived, wiped){
  MODE='town'; L=null; CB=null; S.floor=0; curMenu=townMenu;
  if(arrived){
    S.shopStock=null;                         // 道具屋の奥の棚は、町へ戻るたびに入れ替わる
    restockTorches();
  }
  if(!wiped && arrived!==undefined){ head('辺境の町 ダスクホロウ'); }
  save(); refresh();
  townMenu();
}
/* 松明は地上に戻るたびに、灯す1本と予備を6本ぶんまで買い足す（1本1gp） */
function restockTorches(){
  const have=S.torches+(S.torchLeft>0?1:0), need=Math.max(0,TORCH_STOCK-have);
  const buy=Math.min(need, S.gold);
  if(buy>0){ S.gold-=buy; S.torches+=buy; sys(`雑貨屋で松明を${buy}本買い足した（${buy}gp）。`); }
  if(S.torchLeft<=0 && S.torches>0){ S.torches--; S.torchLeft=TORCH_TICKS; }
}
function townMenu(){
  MODE='town'; curMenu=townMenu; refresh();
  const dead=S.roster.filter(c=>c.status==='dead'||c.status==='ashes'||c.status==='stone').length;
  const ready=living().filter(c=>xpNext(c)!==null && c.xp>=xpNext(c)).length;
  acts([
    {t:'迷宮へ', s:living().length?'掲示板から行き先を選ぶ':'動ける者がいない', cls:'pri', dis:!living().length, fn:board},
    {t:'冒険者ギルド', s:'登録・編成・隊列', fn:guild},
    {t:'宿屋', s:ready?`${ready}人がレベルアップできる`:'HPと呪文が戻る', cls:ready?'pri':'', fn:inn},
    {t:'寺院', s:dead?`${dead}人が救いを待つ`:'蘇生・石化の解除', fn:temple},
    {t:'道具屋', s:'武具・薬・売却', fn:shop},
    {t:'記録してタイトルへ', cls:'dim', fn:()=>{ save(); title(); }}
  ], `ダスクホロウ　所持金 ${S.gold}gp`);
}

/* ---------- 掲示板 ---------- */
function board(){
  curMenu=board;
  head('掲示板');
  const avg=Math.max(1,Math.round(partyLevel()/Math.max(1,living().length)));
  dm('羊皮紙に、ならず者の字で穴の名が書き殴られている。');
  const list=DUNGEONS.slice().sort((a,b)=>a.diff-b.diff);
  for(const dg of list){
    const gap=dg.rec-avg, warn=gap>2?'<span class="ng">実力不足</span>':gap<-3?'余裕':'ちょうど良い';
    const p=log('l','');
    const b=document.createElement('button');
    b.type='button'; b.className='btn dgn';
    const stars='★'.repeat(Math.max(1,Math.ceil(dg.diff/2)))+'☆'.repeat(5-Math.max(1,Math.ceil(dg.diff/2)));
    b.innerHTML=`<b>${dg.name}</b>　<span class="st">${stars}</span>${S.cleared.includes(dg.id)?'　<span class="ok">踏破済</span>':''}`+
      `${S.dg===dg.id&&S.seed?'　<span class="dim">地図あり</span>':''}`+
      `<small>地下${dg.floors}階・推奨レベル${dg.rec}（${warn}）　${dg.d}</small>`;
    b.onclick=()=>{ if(S.seed && S.dg!==dg.id) sys(`${DUNGEONS[S.dg].name}の地図は置いていく。`); enterDungeon(dg.id); };
    const pv=()=>{ if(previewDg!==dg.id){ previewDg=dg.id; dirty=true; } };
    b.onmouseenter=pv; b.onfocus=pv;
    p.appendChild(b);
  }
  acts([{t:'町へ戻る', cls:'dim', fn:townMenu}], `パーティの平均レベル ${avg}`);
}

/* ---------- 宿屋：泊まればHPと呪文が戻り、積んだ経験でレベルが上がる ---------- */
function innCost(ch){ return 10+ch.lv*5; }
function inn(){
  curMenu=inn;
  head('宿屋「眠る竜亭」');
  const guests=living();
  const cost=guests.reduce((n,c)=>n+innCost(c),0);
  dm('「部屋は空いてるよ。馬小屋でよけりゃタダだがね」');
  acts([
    {t:'泊まる', s:`${cost}gp・HPと呪文が戻る・レベルアップ`, cls:'pri', dis:S.gold<cost||!guests.length, fn:()=>{
      S.gold-=cost;
      dm('藁のベッドに沈むように眠り、翌朝、体は軽くなっていた。');
      guests.forEach(ch=>{ ch.hp=ch.maxhp; ch.slots=ch.slotsMax.slice(); ch.layOnUsed=0; });
      good(`全員のHPと呪文が戻った。（-${cost}gp）`);
      guests.forEach(levelUps);
      guests.forEach(ch=>{ ch.hp=ch.maxhp; ch.slots=ch.slotsMax.slice(); });
      save(); refresh(); townMenu();
    }},
    {t:'馬小屋で寝る', s:'無料・呪文は戻るがHPは戻らない・レベルアップ', dis:!guests.length, fn:()=>{
      dm('干し草の匂いの中で丸くなる。体の節々が痛い。');
      guests.forEach(ch=>{ ch.slots=ch.slotsMax.slice(); ch.layOnUsed=0; });
      guests.forEach(levelUps);
      save(); refresh(); townMenu();
    }},
    {t:'出る', cls:'dim', fn:townMenu}
  ], `所持金 ${S.gold}gp`);
}
function levelUps(ch){
  const C=CLASSES[ch.cls];
  while(xpNext(ch)!==null && ch.xp>=xpNext(ch)){
    const wasRate=attackRateTxt(ch), had=ch.slotsMax.length, before=ch.spells.slice();
    ch.lv++;
    const g=hpGainForLevel(ch, ch.lv);
    ch.maxhp+=g.gain; ch.hp+=g.gain;
    log('big2',`${esc(ch.name)} はレベル ${ch.lv} に上がった！`);
    if(g.fixed) rollLine('ヒットダイス', `${C.name}は名声レベルを越えた。以後は固定で HP最大値 +<b>${g.gain}</b>`);
    else rollLine('ヒットダイス', `1d${C.hd}=<b>${g.roll}</b> + 耐久修正 ${conHP(ch.abil.CON,C.warrior)} → HP最大値 +<b>${g.gain}</b>`);
    sys(`THAC0 ${THAC0(ch)}。セーヴィングスローも良くなった。`);
    if(attackRateTxt(ch)!==wasRate) good(`1ラウンドの攻撃回数が ${attackRateTxt(ch)} になった。`);
    if(C.spell){
      learnSpellsUpTo(ch); rebuildSlots(ch);
      ch.spells.filter(s=>!before.includes(s)).forEach(s=>good(`新たな呪文を修得：${SPELLS[s].name}`));
      if(!had && ch.slotsMax.length) good('神の恩寵が降りた。呪文を扱えるようになった。');
    }
  }
}

/* ---------- 寺院：死者の蘇生、灰からの蘇生、石化の解除 ----------
   AD&D の「蘇生に耐えられるか」の判定は耐久力で決まる。失敗すれば死者は灰に、灰は永遠に失われる。
   蘇った者は耐久力が1下がる */
const SURVIVE={3:40,4:45,5:50,6:55,7:60,8:65,9:70,10:75,11:80,12:85,13:88,14:92,15:94,16:96,17:98,18:100};
function surviveChance(ch){ return SURVIVE[Math.max(3,Math.min(18,ch.abil.CON))]; }
function templeCost(ch){ return ch.status==='stone' ? 200*ch.lv : ch.status==='ashes' ? 500*ch.lv : 250*ch.lv; }
function temple(){
  curMenu=temple;
  head('光の神殿');
  const list=S.roster.filter(c=>c.status==='dead'||c.status==='ashes'||c.status==='stone');
  dm(list.length ? '「寄進次第で、神は耳を傾けてくださる」' : '静かな祈りの声だけが響いている。救いを待つ者はいない。');
  acts(list.map(c=>{
    const cost=templeCost(c);
    const what = c.status==='stone' ? '石化を解く' : c.status==='ashes' ? '灰から蘇らせる' : '蘇らせる';
    return {t:`${esc(c.name)}：${what}`, s:`${cost}gp${c.status!=='stone'?`・成功率 ${surviveChance(c)}%`:''}`, dis:S.gold<cost, fn:()=>{
      S.gold-=cost;
      if(c.status==='stone'){ c.status='ok'; c.hp=Math.max(1,c.hp); good(`${esc(c.name)} の体に血の色が戻った。`); }
      else {
        const r=ri(1,100), ok=r<=surviveChance(c);
        rollLine(`${esc(c.name)}：蘇生に耐えられるか`, `d100=<b>${r}</b> vs <b>${surviveChance(c)}%</b>（耐久 ${c.abil.CON}）`, ok);
        if(ok){ c.status='ok'; c.hp=1; c.abil.CON=Math.max(3,c.abil.CON-1); good(`${esc(c.name)} が息を吹き返した！ ただし耐久力が1下がった（${c.abil.CON}）。`); }
        else if(c.status==='dead'){ c.status='ashes'; bad(`${esc(c.name)} の亡骸は炎に包まれ、灰になった……。`); }
        else { bad(`${esc(c.name)} の灰は風に散った。もう二度と戻らない。`); S.roster=S.roster.filter(x=>x!==c); S.party=S.party.filter(id=>id!==c.id); }
      }
      save(); refresh(); temple();
    }};
  }).concat([{t:'出る', cls:'dim', fn:townMenu}]), `所持金 ${S.gold}gp`);
}

/* ---------- 道具屋 ---------- */
const SHOP_MARKUP=2;
function shopTier(lv){
  const base = lv<=2?1 : lv<=4?2 : lv<=6?3 : lv<=11?4 : lv<=18?5 : 6;
  const r=rand();
  return Math.max(1, Math.min(MAGIC_TIER_MAX, r<0.15 ? base-1 : r<0.85 ? base : base+1));
}
function rollShopStock(){
  const avg=Math.max(1,Math.round(partyLevel()/Math.max(1,living().length)));
  const out=[];
  for(let i=0;i<4;i++){
    const pool=MAGIC_TIERS[shopTier(avg)].map(f=>f()).filter(it=>!out.some(o=>o.name===it.name));
    if(pool.length) out.push(pick(pool));
  }
  return out;
}
const SHOP=[
 {name:'ヒーリング・ポーション',price:150,make:()=>({uid:uid(),kind:'potion',eff:'heal',name:'ヒーリング・ポーション',val:120,d:'2d4+2 HP回復'})},
 {name:'エクストラ・ヒーリング・ポーション',price:500,make:()=>({uid:uid(),kind:'potion',eff:'exheal',name:'エクストラ・ヒーリング・ポーション',val:400,d:'3d8+3 HP回復'})},
 {name:'シーフの道具一式',price:100,make:()=>({uid:uid(),kind:'misc',eff:'tools',name:'シーフの道具一式',val:50,d:'シーフの鍵開け・罠に+10%（荷物にあれば効く）'})},
 {name:'レザーアーマー',price:20,make:()=>itPlainA('leather')},
 {name:'スタデッドレザー',price:20,make:()=>itPlainA('studded')},
 {name:'チェインメイル',price:75,make:()=>itPlainA('chain')},
 {name:'プレートメイル',price:600,make:()=>itPlainA('plate')},
 {name:'シールド',price:10,make:()=>itPlainS()},
 {name:'ロングソード',price:15,make:()=>itPlainW('longsword')},
 {name:'ショートソード',price:10,make:()=>itPlainW('shortsword')},
 {name:'バトルアックス',price:5,make:()=>itPlainW('battleaxe')},
 {name:'メイス',price:8,make:()=>itPlainW('mace')},
 {name:'ツーハンデッド・ソード',price:50,make:()=>itPlainW('twohanded')}
];
function shop(){
  curMenu=shop;
  head('道具屋「錆びた天秤」');
  dm('「見るのは自由だ。触るのは買ってからにしてくれ」');
  if(!S.shopStock) S.shopStock=rollShopStock();
  acts([
    {t:'買う', s:'薬・武具', cls:'pri', fn:buyMenu},
    S.shopStock.length && {t:'奥の棚', s:`魔法の品 ${S.shopStock.length}点`, fn:magicMenu},
    {t:'売る', s:`荷物 ${S.bag.length}品`, dis:!S.bag.length, fn:sellMenu},
    {t:'松明を買う', s:`6本 5gp（今 ${S.torches+(S.torchLeft>0?1:0)}本）`, dis:S.gold<5, fn:()=>{ S.gold-=5; S.torches+=6; good('松明を6本買った。'); save(); refresh(); shop(); }},
    {t:'出る', cls:'dim', fn:townMenu}
  ], `所持金 ${S.gold}gp`);
}
function buyMenu(){
  acts(SHOP.map(s=>({t:s.name, s:`${s.price}gp`, dis:S.gold<s.price, fn:()=>{
    S.gold-=s.price; const it=s.make(); S.bag.push(it); good(`${it.name} を買った。`);
    if(['weapon','armor','shield'].includes(it.kind)) sys('仲間の札を押して「装備」から身につけよう。');
    save(); refresh(); buyMenu();
  }})).concat([{t:'戻る', cls:'dim', fn:shop}]), `所持金 ${S.gold}gp`);
}
function magicMenu(){
  acts(S.shopStock.map(it=>{
    const p=Math.max(1,Math.round((it.val||100)*SHOP_MARKUP));
    return {t:esc(it.name), s:`${p}gp・${it.d||''}`, dis:S.gold<p, fn:()=>{
      S.gold-=p; S.bag.push(it); S.shopStock=S.shopStock.filter(x=>x!==it); good(`${esc(it.name)} を買った。`);
      save(); refresh(); S.shopStock.length ? magicMenu() : shop();
    }};
  }).concat([{t:'戻る', cls:'dim', fn:shop}]), '品揃えは町へ戻るたびに入れ替わる');
}
function sellMenu(){
  acts(S.bag.map(it=>({t:esc(it.name), s:`${sellPrice(it)}gp で売る`, fn:()=>{
    S.gold+=sellPrice(it); S.bag=S.bag.filter(x=>x!==it); good(`${esc(it.name)} を ${sellPrice(it)}gp で売った。`);
    save(); refresh(); S.bag.length ? sellMenu() : shop();
  }})).concat([{t:'戻る', cls:'dim', fn:shop}]), `所持金 ${S.gold}gp`);
}
