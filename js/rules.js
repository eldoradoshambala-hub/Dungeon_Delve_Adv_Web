"use strict";
/* ============================================================
   AD&D のルールとデータ
   Dungeon Delve 本体からそのまま移したもの（能力値修正・職業・呪文・武具・
   モンスター・罠・魔法の品・財宝）。本体は1人旅なので、パーティで使うために
   変えたところには「パーティ用」と書いてある。
   ============================================================ */
function rollDmg(spec){
  const [n,s,m=0]=spec; let t=0,rs=[];
  for(let i=0;i<n;i++){ const r=die(s); rs.push(r); t+=r; }
  return {total:Math.max(1,t+m), rolls:rs, mod:m, txt:`${n}d${s}${m?(m>0?'+'+m:m):''}`};
}
function dmgTxt(spec){ const [n,s,m=0]=spec; return `${n}d${s}${m?(m>0?'+'+m:m):''}`; }
function uid(){ return 'i'+(Math.random().toString(36).slice(2,9)); }

/* ---------- AD&D風 能力値修正 ---------- */
function strHit(v){ if(v<=1)return -5; if(v<=3)return -3; if(v<=5)return -2; if(v<=7)return -1; if(v<=16)return 0; return 1; }
function strDmg(v){ if(v<=1)return -4; if(v<=5)return -1; if(v<=15)return 0; if(v<=17)return 1; return 2; }
function strOpenDoor(v){ if(v<=5)return 1; if(v<=9)return 2; if(v<=13)return 3; if(v<=16)return 4; if(v===17)return 5; return 6; } // d6 以下で成功
function dexAC(v){ if(v<=3)return 4; if(v===4)return 3; if(v===5)return 2; if(v===6)return 1; if(v<=14)return 0; if(v===15)return -1; if(v===16)return -2; if(v===17)return -3; return -4; }
function conHP(v,warrior){ if(v<=3)return -2; if(v<=6)return -1; if(v<=14)return 0; if(v===15)return 1; if(v===16)return 2; if(v===17)return warrior?3:2; return warrior?4:2; }
function dexSkill(v,kind){ // kind:'ol'|'ft'|'ms'
  const t={ol:{9:-10,10:-5,11:0,12:0,13:0,14:0,15:0,16:5,17:10,18:15},
            ft:{9:-10,10:-10,11:-5,12:0,13:0,14:0,15:0,16:0,17:5,18:10},
            ms:{9:-20,10:-15,11:-10,12:-5,13:0,14:0,15:0,16:0,17:5,18:10}}[kind];
  const k=Math.max(9,Math.min(18,v)); return t[k]||0;
}

/* ---------- クラス ---------- */
const CLASSES = {
  fighter:{ id:'fighter', name:'ファイター', hd:10, warrior:true,
    blurb:'剣と鎧の戦士。命中・耐久・ヒットダイスすべてで最強。まず1人目に薦められる。',
    prio:['STR','CON','DEX','CHA','WIS','INT'],
    thac0:l=>21-l,
    saves:{ppd:14,rsw:16,pp:15,bw:17,sp:17}, saveStep:2, saveEvery:3,
    xp:[0,2000,4000,8000,16000,32000,64000,125000,250000,500000], xpStep:250000, hdTo:9,
    gear:{weapon:'longsword',armor:'chain',shield:true},
    spell:null },
  cleric:{ id:'cleric', name:'クレリック', hd:8, warrior:false,
    blurb:'神に仕える戦士。治癒の奇跡を扱い、アンデッドを退ける。刃物は使えない。',
    prio:['WIS','STR','CON','CHA','DEX','INT'],
    thac0:l=>20-Math.floor((l-1)/3)*2,
    saves:{ppd:10,rsw:14,pp:13,bw:16,sp:15}, saveStep:2, saveEvery:4,
    xp:[0,1500,3000,6000,13000,27500,55000,110000,225000,450000], xpStep:225000, hdTo:9,
    gear:{weapon:'mace',armor:'chain',shield:true},
    spell:'divine' },
  thief:{ id:'thief', name:'シーフ', hd:6, warrior:false,
    blurb:'罠と鍵の専門家。背後からの一撃は致命的。ただし単独では極めて脆く、正面から殴り合えば負ける。敵を先に見つけ、避けるか奇襲するかを選べ。',
    prio:['DEX','CON','STR','INT','CHA','WIS'],
    thac0:l=>20-Math.floor((l-1)/2),
    saves:{ppd:13,rsw:14,pp:12,bw:16,sp:15}, saveStep:2, saveEvery:4,
    xp:[0,1250,2500,5000,10000,20000,40000,70000,110000,160000], xpStep:280000, hdTo:10,
    gear:{weapon:'shortsword',armor:'leather',shield:false},
    spell:null },
  mage:{ id:'mage', name:'マジックユーザー', hd:4, warrior:false,
    blurb:'鎧も盾も持てず紙のように脆いが、呪文は戦況を一撃で覆す。上級者向け。',
    prio:['INT','DEX','CON','CHA','WIS','STR'],
    thac0:l=>20-Math.floor((l-1)/3),
    saves:{ppd:14,rsw:11,pp:13,bw:15,sp:12}, saveStep:2, saveEvery:5,
    xp:[0,2500,5000,10000,20000,40000,60000,90000,135000,250000], xpStep:375000, hdTo:10,
    gear:{weapon:'dagger',armor:'none',shield:false},
    spell:'arcane' },

  /* ---- 以下は「追加職業」ルールを有効にしたときだけ選べる ---- */
  barbarian:{ id:'barbarian', name:'バーバリアン', hd:12, warrior:true, extra:true,
    blurb:'北方の蛮族。桁外れの頑丈さと膂力で押し通る。d12というヒットダイスは全職最大で、鋼と筋肉だけで最深部まで行ける。',
    prio:['STR','CON','DEX','WIS','CHA','INT'],
    thac0:l=>21-l,
    saves:{ppd:13,rsw:15,pp:14,bw:16,sp:16}, saveStep:2, saveEvery:3,
    xp:[0,2000,4000,8000,16000,32000,64000,125000,250000,500000], xpStep:250000, hdTo:9,
    gear:{weapon:'battleaxe',armor:'studded',shield:false},
    spell:null,
    dmgPlus:2, wildSense:2,
    perk:'剛打：ダメージ+2／野性の勘：罠の発見と耳をすますに+2' },
  cavalier:{ id:'cavalier', name:'騎士', hd:10, warrior:true, extra:true,
    blurb:'騎士道に生きる重装の戦士。プレートメイルと盾で固め、剣の扱いに長ける。その威風は敵の戦意を挫く。',
    prio:['STR','CON','CHA','DEX','WIS','INT'],
    thac0:l=>21-l,
    saves:{ppd:14,rsw:16,pp:15,bw:17,sp:17}, saveStep:2, saveEvery:3,
    xp:[0,2500,5000,10000,18500,37000,85000,140000,220000,300000], xpStep:300000, hdTo:9,
    gear:{weapon:'longsword',armor:'plate',shield:true},
    spell:null,
    hitPlus:1, moraleBreak:2,
    perk:'武芸の誉れ：命中+1／威風：敵の士気判定に-2（逃げ散りやすい）' },
  paladin:{ id:'paladin', name:'聖戦士', hd:10, warrior:true, extra:true,
    blurb:'誓いを立てた聖なる戦士。手をかざして傷を癒し、あらゆる災いに抗う。アンデッドを討つために生まれた職。',
    prio:['STR','CHA','CON','WIS','DEX','INT'],
    thac0:l=>21-l,
    saves:{ppd:14,rsw:16,pp:15,bw:17,sp:17}, saveStep:2, saveEvery:3,
    xp:[0,2750,5500,12000,24000,45000,95000,175000,350000,700000], xpStep:300000, hdTo:9,
    gear:{weapon:'longsword',armor:'chain',shield:true},
    spell:'divine', spellFrom:9,     // 神の恩寵は9レベルから
    savePlus:2, layOn:true, undeadBane:2,
    perk:'不屈：全セーヴ+2／癒しの手：1日1回 2×レベル HP回復／アンデッドに命中+2' },
  monk:{ id:'monk', name:'モンク', hd:6, warrior:false, extra:true,
    blurb:'東方の武僧。鎧を纏わず素手で戦う。レベルとともに拳の威力と身のこなしが上がり、鎧なしでも硬くなる。',
    prio:['DEX','WIS','STR','CON','INT','CHA'],
    thac0:l=>20-Math.floor((l-1)/2),
    saves:{ppd:13,rsw:14,pp:12,bw:16,sp:15}, saveStep:2, saveEvery:4,
    xp:[0,2250,4750,10000,22500,47500,98000,200000,350000,500000], xpStep:300000, hdTo:10,
    gear:{weapon:'staff',armor:'none',shield:false},
    spell:null,
    martial:true, stealth:true,
    perk:'素手打：レベルに応じて威力上昇／無鎧の構え：鎧を着ないほどACが下がる／隠密：シーフ技能の一部を持つ' }
};
const SAVE_NAMES={ppd:'麻痺/毒/死の魔法',rsw:'ロッド/スタッフ/ワンド',pp:'石化/変身',bw:'ブレス',sp:'呪文'};

const MAX_LEVEL=30;
Object.values(CLASSES).forEach(C=>{
  while(C.xp.length<MAX_LEVEL) C.xp.push(C.xp[C.xp.length-1] + C.xpStep);
});
/* 名声レベル到達後、1レベルごとに増えるHP（ダイスを振らない・耐久修正も付かない） */
function hpAfterName(C){ return C.warrior ? 3 : C.spell==='arcane' ? 1 : 2; }
const THAC0_FLOOR=1, SAVE_FLOOR=3;

const RULE_DEFS=[
  {key:'spec',    name:'Weapon Specialization',
   d:'戦士系は武器を一つ専門化できる。命中+1／ダメージ+2で始まり、12/18/24レベルで【熟練】【上級熟練】【達人】へ上がる。攻撃回数も 1.5回→2回→2.5回 と伸びる。'},
  {key:'classes', name:'追加職業',
   d:'バーバリアン・騎士・聖戦士・モンクを選べるようになる。'},
  {key:'mage',    name:'マジックユーザー強化',
   d:'1レベル時のHPを常に最大値とし、INT17なら第1レベル呪文+1、INT18なら+2。'}
];
function rules_(ch){ return (ch&&ch.rules) || {}; }
/* 素手打（モンク）の威力。レベルとともに上がる */
function wildSense(ch){ return CLASSES[ch.cls].wildSense||0; }
/* 聖戦士の癒しの手：1日1回、2×レベル ぶん回復する。休息か宿で戻る。
   秘宝で回数が増える。ch.layOnUsed は古いセーブでは真偽値なので数として扱う */
function layOnMax(ch){ return CLASSES[ch.cls].layOn ? 1+relicMod(ch,'layOn') : 0; }
function layOnLeft(ch){ return Math.max(0, layOnMax(ch) - (Number(ch.layOnUsed)||0)); }
function canLayOn(ch){ return layOnLeft(ch)>0 && ch.hp<ch.maxhp; }

/* モンクの素手打。魔法の武器も専門化も乗らないぶん、ダイスそのものが上限まで伸びる。
   step は秘宝による段階の上乗せ */
/* 25レベルで [6,6] に届く。その先の3段は秘宝のためだけにある
   ―― ここが無いと、モンクの秘宝3つのうち2つが何もしない品になってしまう */
const MARTIAL=[[1,4],[1,6],[1,8],[2,4],[2,6],[2,8],[3,6],[4,6],[5,6],[6,6],[7,6],[8,6],[9,6]];
function martialStep(lv){
  return lv<=2?0 : lv<=4?1 : lv<=6?2 : lv<=8?3 : lv<=10?4
       : lv<=13?5 : lv<=16?6 : lv<=20?7 : lv<=24?8 : 9;
}
function martialDmg(lv, step){
  return MARTIAL[Math.min(MARTIAL.length-1, martialStep(lv)+(step||0))];
}
/* 専門化した武器で戦っているか */
function isSpec(ch){
  const sp=ch.spec; if(!sp || !rules_(ch).spec) return false;
  const w=ch.eq && ch.eq.weapon;
  return !!w && w.base===sp;
}
/* ---- Weapon Mastery（High Level Campaigns）----
   専門化はそこで終わりではなく、レベルとともに段階が上がる。
   命中とダメージの修正が増え、攻撃回数も伸びていく。
   THAC0 が 1 で頭打ちになったあとの戦士の伸びしろは、ここが受け持つ */
const MASTERY=[
  {lv:1,  name:'専門化',   hit:1, dmg:2},
  {lv:12, name:'熟練',     hit:2, dmg:3},
  {lv:18, name:'上級熟練', hit:3, dmg:4},
  {lv:24, name:'達人',     hit:3, dmg:5}
];
/* 今その武器で到達している段階。専門化した武器を持っていなければ null */
function masteryOf(ch){
  if(!isSpec(ch)) return null;
  let i=-1; MASTERY.forEach((m,k)=>{ if(ch.lv>=m.lv) i=k; });
  if(i<0) return null;
  i=Math.min(MASTERY.length-1, i+relicMod(ch,'grade'));   // 秘宝による段階の上乗せ
  return MASTERY[i];
}
/* 1ラウンドの攻撃回数を [分子,分母] で返す。AD&D の 3/2回・5/2回をそのまま持つ。
   戦士系は専門化していなくてもレベルで攻撃回数が増える（AD&Dの流儀）。
   モンクの連打も同じ仕組みで扱う */
function attackRate(ch){
  const C=CLASSES[ch.cls], lv=ch.lv;
  if(isSpec(ch))  return lv>=13 ? [5,2] : lv>=7 ? [2,1] : [3,2];
  if(C.warrior)   return lv>=13 ? [2,1] : lv>=7 ? [3,2] : [1,1];
  if(C.martial)   return lv>=21 ? [5,2] : lv>=13 ? [2,1] : lv>=7 ? [3,2] : [1,1];
  return [1,1];
}
/* 端数は偶数ラウンドに寄せる。3/2回なら 1回→2回→1回…、5/2回なら 2回→3回→2回… */
function attacksThisRound(ch, round){
  const [n,d]=attackRate(ch);
  if(d===1) return n;
  return (round%2===0) ? Math.ceil(n/d) : Math.floor(n/d);
}
function attackRateTxt(ch){ const [n,d]=attackRate(ch); return `${n/d} 回/R`; }

/* 秘宝の効果を合算する。数値の mods 用 */
function relicMod(ch, key){
  return ((ch&&ch.relics)||[]).reduce((n,r)=>n + ((r.mods&&r.mods[key])||0), 0);
}
/* 秘宝による呪文スロットの追加を {呪文レベル:数} にまとめる */
function relicSlots(ch){
  const out={};
  ((ch&&ch.relics)||[]).forEach(r=>{
    const s=r.mods&&r.mods.slots; if(!s) return;
    Object.keys(s).forEach(k=>{ out[k]=(out[k]||0)+s[k]; });
  });
  return out;
}

/* マジックユーザー強化：INTによる第1レベル呪文の追加 */
function mageBonusSlots(ch){
  if(!rules_(ch).mage || CLASSES[ch.cls].spell!=='arcane') return 0;
  return ch.abil.INT>=18 ? 2 : ch.abil.INT>=17 ? 1 : 0;
}
/* 呪文スロットを職業・レベル・追加ルールから組み立て直す */
function rebuildSlots(ch){
  const C=CLASSES[ch.cls];
  if(!C.spell){ ch.slotsMax=[]; ch.slots=[]; return; }
  const from=C.spellFrom||1;
  if(ch.lv<from){ ch.slotsMax=[]; ch.slots=[]; return; }
  // 聖戦士は9レベルで「1レベル術者」として目覚める
  const eff=Math.max(1, ch.lv-from+1);
  const tbl=SLOTS[C.spell];
  const base=tbl[Math.min(tbl.length-1, eff-1)].slice();
  base[0]+=mageBonusSlots(ch);
  // 踏破の秘宝によるスロット追加。系統ごとの上限（秘術9段・神術7段）は越えない
  const maxTier=tbl[tbl.length-1].length, extra=relicSlots(ch);
  Object.keys(extra).forEach(k=>{
    const i=Number(k)-1;
    if(i<0 || i>=maxTier) return;
    while(base.length<=i) base.push(0);
    base[i]+=extra[k];
  });
  ch.slotsMax=base;
  if(!ch.slots) ch.slots=[];
  while(ch.slots.length<ch.slotsMax.length) ch.slots.push(0);
  ch.slots.length=ch.slotsMax.length;
}

/* ---------- 呪文 ---------- */
const SPELLS = {
  magicmissile:{name:'マジック・ミサイル',lv:1,t:'arcane',tgt:'enemy',
    d:'必中の魔法の矢。1d4+1 ダメージ／術者レベル2ごとに矢が1本増える。'},
  burninghands:{name:'バーニング・ハンズ',lv:1,t:'arcane',tgt:'all',
    d:'扇状の炎。敵全体に術者レベル分のダメージ（セーヴ成功で半減）。'},
  sleep:{name:'スリープ',lv:1,t:'arcane',tgt:'group',
    d:'4HD以下の敵を眠らせる（合計2d4HDぶん）。眠った敵は自動命中＋倍打。'},
  shieldsp:{name:'シールド',lv:1,t:'arcane',tgt:'self',
    d:'不可視の盾。ACが4点良くなる（8ラウンド）。'},
  invisibilitysp:{name:'インビジビリティ',lv:2,t:'arcane',tgt:'self',
    d:'姿を消す。攻撃されにくく（敵-4）、次の攻撃は+4。逃走は自動成功。'},
  mirrorimage:{name:'ミラー・イメージ',lv:2,t:'arcane',tgt:'self',
    d:'1d4体の幻影が身代わりになる。'},
  knock:{name:'ノック',lv:2,t:'arcane',tgt:'util',
    d:'いかなる錠前も自動的に開く。'},
  fireball:{name:'ファイアーボール',lv:3,t:'arcane',tgt:'all',
    d:'爆炎。敵全体に術者レベルd6（セーヴ成功で半減）。'},
  lightning:{name:'ライトニング・ボルト',lv:3,t:'arcane',tgt:'all',
    d:'稲妻が敵列を貫く。術者レベルd6（セーヴ成功で半減）。'},

  /* --- 高レベル戦役の秘術（第4〜9レベル） --- */
  icestorm:{name:'アイス・ストーム',lv:4,t:'arcane',tgt:'all',
    d:'拳大の氷塊が降り注ぐ。敵全体に 3d10（セーヴ無し）。'},
  stoneskin:{name:'ストーン・スキン',lv:4,t:'arcane',tgt:'self',
    d:'肌が石と化す。1d4+術者レベル/2 回ぶんの攻撃を完全に弾く。'},
  coneofcold:{name:'コーン・オヴ・コールド',lv:5,t:'arcane',tgt:'all',
    d:'絶対零度の扇。敵全体に 術者レベルd4＋術者レベル（セーヴ成功で半減）。'},
  cloudkill:{name:'クラウドキル',lv:5,t:'arcane',tgt:'all',
    d:'黄緑の死の霧。4HD以下の敵は即死、それ以上は 1d10（セーヴ成功で半減）。'},
  chainlightning:{name:'チェイン・ライトニング',lv:6,t:'arcane',tgt:'all',
    d:'稲妻が敵から敵へ跳ぶ。先頭に 術者レベルd6、以降は半分ずつ（セーヴ成功で半減）。'},
  disintegrate:{name:'ディスインテグレート',lv:6,t:'arcane',tgt:'enemy',
    d:'敵1体を塵に還す。セーヴに失敗すれば、HPを問わず消滅する。'},
  delayedblast:{name:'ディレイド・ブラスト・ファイアーボール',lv:7,t:'arcane',tgt:'all',
    d:'遅れて炸裂する大火球。敵全体に 術者レベルd6＋術者レベル（上限20d6／セーヴ成功で半減）。'},
  powerwordstun:{name:'パワー・ワード・スタン',lv:7,t:'arcane',tgt:'enemy',
    d:'力ある言葉。敵1体が 1d4+1 ラウンド行動できなくなる（セーヴ無し）。'},
  powerwordblind:{name:'パワー・ワード・ブラインド',lv:8,t:'arcane',tgt:'enemy',
    d:'敵1体を盲目にする。以後その敵は命中-4、ACが4点悪化する。'},
  incendiarycloud:{name:'インセンディアリー・クラウド',lv:8,t:'arcane',tgt:'all',
    d:'燃える雲が居座る。3ラウンドのあいだ、毎ラウンド敵全体に 4d6。'},
  meteorswarm:{name:'メテオ・スウォーム',lv:9,t:'arcane',tgt:'all',
    d:'四つの火球が降り注ぐ。敵全体に 20d6（セーヴ無し）。'},
  powerwordkill:{name:'パワー・ワード・キル',lv:9,t:'arcane',tgt:'enemy',
    d:'死の言葉。残りHPが60以下の敵1体を、判定なしで即死させる。'},

  curelight:{name:'キュア・ライト・ウーンズ',lv:1,t:'divine',tgt:'self',
    d:'傷を癒す。1d8 HP回復。'},
  bless:{name:'ブレス',lv:1,t:'divine',tgt:'self',
    d:'神の加護。命中とセーヴに+1（10ラウンド）。'},
  protevil:{name:'プロテクション・フロム・イービル',lv:1,t:'divine',tgt:'self',
    d:'邪悪な者の攻撃に-2、こちらのセーヴに+2（10ラウンド）。'},
  holdperson:{name:'ホールド・パーソン',lv:2,t:'divine',tgt:'enemy',
    d:'人型の敵1体を麻痺させる（セーヴ有）。'},
  spiritualhammer:{name:'スピリチュアル・ハンマー',lv:2,t:'divine',tgt:'enemy',
    d:'光の槌が敵を打つ。2d4+術者レベル ダメージ。'},
  cureserious:{name:'キュア・シリアス・ウーンズ',lv:3,t:'divine',tgt:'self',
    d:'深手を癒す。2d8+1 HP回復。'},
  prayer:{name:'プレイヤー',lv:3,t:'divine',tgt:'all',
    d:'祈り。味方は命中+1、敵は命中とセーヴに-1（1d6+6ラウンド）。'},

  /* --- 高レベル戦役の神術（第4〜7レベル） --- */
  curecritical:{name:'キュア・クリティカル・ウーンズ',lv:4,t:'divine',tgt:'self',
    d:'瀕死の傷を塞ぐ。3d8+3 HP回復。'},
  divinepower:{name:'ディヴァイン・パワー',lv:4,t:'divine',tgt:'self',
    d:'神の力が腕に宿る。命中+3（10ラウンド）、さらに 1d8 HP回復。'},
  flamestrike:{name:'フレイム・ストライク',lv:5,t:'divine',tgt:'all',
    d:'天から白熱の柱が落ちる。敵全体に 6d8（セーヴ成功で半減）。'},
  slayliving:{name:'スレイ・リヴィング',lv:5,t:'divine',tgt:'enemy',
    d:'生命そのものを断つ。セーヴ失敗で敵1体が即死、成功でも 3d6＋術者レベル。'},
  healsp:{name:'ヒール',lv:6,t:'divine',tgt:'self',
    d:'あらゆる傷が消える。HPが最大値まで戻る。'},
  harm:{name:'ハーム',lv:6,t:'divine',tgt:'enemy',
    d:'触れた敵から生命を削ぎ落とす。残りHPを 1d4 まで落とす（セーヴ有）。'},
  holyword:{name:'ホーリー・ワード',lv:7,t:'divine',tgt:'all',
    d:'聖なる言葉が響く。5HD以下の敵は消滅し、それ以外も 2d8 と 2ラウンドの行動不能。'},
  sunray:{name:'サン・レイ',lv:7,t:'divine',tgt:'all',
    d:'真昼の光条。アンデッドに 8d6、その他に 6d6（セーヴ成功で半減）。'}
};
/* 何レベルでどの呪文を修得するか。スロットが開くレベルに合わせてある */
const SPELL_LEARN = {
  arcane:{1:['magicmissile','shieldsp'],2:['sleep'],3:['burninghands','mirrorimage'],
          // 第3レベル呪文の枠は術者レベル5で開く。ファイアーボールもそこで覚える
          4:['invisibilitysp'],5:['knock','fireball'],6:['lightning'],7:['icestorm'],
          8:['stoneskin'],9:['coneofcold'],10:['cloudkill'],
          12:['chainlightning'],13:['disintegrate'],
          14:['delayedblast'],15:['powerwordstun'],
          16:['powerwordblind'],17:['incendiarycloud'],
          18:['meteorswarm'],19:['powerwordkill']},
  divine:{1:['curelight'],2:['bless'],3:['protevil','spiritualhammer'],
          4:['holdperson'],5:['cureserious'],7:['prayer','curecritical'],
          8:['divinepower'],9:['flamestrike'],10:['slayliving'],
          11:['healsp'],12:['harm'],
          16:['holyword'],17:['sunray']}
};
/* 呪文スロット。添字が術者レベル-1。AD&D の表をそのまま 30 レベルまで伸ばした。
   秘術は第9レベル呪文まで、神術は第7レベル呪文までしか届かない（AD&Dの流儀） */
const SLOTS = {
  arcane:[
    [1],[2],[2,1],[3,2],[4,2,1],[4,2,2],[4,3,2,1],[4,3,3,2],[4,3,3,2,1],[4,4,3,2,2],
    [4,4,4,3,3],[4,4,4,4,4,1],[5,5,5,4,4,2],[5,5,5,4,4,2,1],[5,5,5,5,5,2,1],
    [5,5,5,5,5,3,2,1],[5,5,5,5,5,3,3,2],[5,5,5,5,5,3,3,2,1],[5,5,5,5,5,3,3,3,1],[5,5,5,5,5,4,3,3,2],
    [5,5,5,5,5,4,4,3,2],[5,5,5,5,5,4,4,3,3],[5,5,5,5,5,4,4,4,3],[5,5,5,5,5,4,4,4,4],[5,5,5,5,5,5,4,4,4],
    [5,5,5,5,5,5,5,4,4],[5,5,5,5,5,5,5,5,4],[5,5,5,5,5,5,5,5,5],[6,6,6,6,6,5,5,5,5],[6,6,6,6,6,6,6,6,6]
  ],
  divine:[
    [1],[2],[2,1],[3,2],[3,3,1],[3,3,2],[3,3,2,1],[3,3,3,2],[4,4,3,2,1],[4,4,3,3,2],
    [5,4,4,3,2,1],[6,5,5,3,2,2],[6,6,6,4,2,2],[6,6,6,5,3,2],[6,6,6,6,4,2],
    [7,7,7,6,4,3,1],[7,7,7,7,5,3,1],[8,8,8,7,6,4,1],[9,9,8,8,6,4,2],[9,9,9,8,7,5,2],
    [9,9,9,9,8,6,2],[9,9,9,9,9,6,3],[9,9,9,9,9,7,3],[9,9,9,9,9,8,3],[9,9,9,9,9,9,4],
    [9,9,9,9,9,9,5],[9,9,9,9,9,9,6],[9,9,9,9,9,9,7],[9,9,9,9,9,9,8],[9,9,9,9,9,9,9]
  ]
};

/* ---------- 武具 ---------- */
const WEAPONS = {
  /* クレリックは刃物を持てない（AD&Dの流儀）。打撃武器のみ */
  dagger    :{name:'ダガー',            dmg:[1,4],  ok:['fighter','thief','mage'], price:2},
  club      :{name:'クラブ',            dmg:[1,6],  ok:['fighter','thief','mage','cleric'], price:1},
  staff     :{name:'クォータースタッフ',dmg:[1,6],  ok:['fighter','thief','mage','cleric'], price:2},
  shortsword:{name:'ショートソード',    dmg:[1,6],  ok:['fighter','thief'], price:10},
  longsword :{name:'ロングソード',      dmg:[1,8],  ok:['fighter'], price:15},
  battleaxe :{name:'バトルアックス',    dmg:[1,8],  ok:['fighter'], price:5},
  twohanded :{name:'ツーハンデッド・ソード',dmg:[1,10],two:true, ok:['fighter'], price:50},
  mace      :{name:'メイス',            dmg:[1,6,1],ok:['fighter','cleric'], price:8},
  warhammer :{name:'ウォーハンマー',    dmg:[1,6,1],ok:['fighter','cleric'], price:2}
};
const ARMORS = {
  none    :{name:'布の服',            ac:10, ok:['fighter','thief','mage','cleric'], price:0},
  leather :{name:'レザーアーマー',    ac:8,  ok:['fighter','thief','cleric'], price:20},
  studded :{name:'スタデッドレザー',  ac:7,  ok:['fighter','cleric'], price:20},
  chain   :{name:'チェインメイル',    ac:5,  ok:['fighter','cleric'], price:75},
  plate   :{name:'プレートメイル',    ac:3,  ok:['fighter'], price:600}
};
/* 追加職業が扱える武具。既存の ok 配列に後から足す（本体の表を書き換えないで済む） */
const EXTRA_PROF={
  /* バーバリアンは重い鎧を嫌う。騎士と聖戦士は全身鎧まで。モンクは鎧を着ず軽い武器のみ */
  barbarian:{w:['dagger','club','staff','shortsword','longsword','battleaxe','twohanded','mace','warhammer'],
             a:['leather','studded','chain']},
  cavalier :{w:['dagger','shortsword','longsword','battleaxe','twohanded','mace','warhammer'],
             a:['leather','studded','chain','plate']},
  paladin  :{w:['dagger','shortsword','longsword','battleaxe','twohanded','mace','warhammer'],
             a:['leather','studded','chain','plate']},
  monk     :{w:['dagger','club','staff','shortsword'], a:[]}
};
Object.keys(EXTRA_PROF).forEach(cls=>{
  ARMORS.none.ok.push(cls);                    // 布の服はどの職業でも着られる
  EXTRA_PROF[cls].w.forEach(k=>{ if(WEAPONS[k]) WEAPONS[k].ok.push(cls); });
  EXTRA_PROF[cls].a.forEach(k=>{ if(ARMORS[k]) ARMORS[k].ok.push(cls); });
});
/* 盾を構えられない職業 */
const NO_SHIELD=['mage','monk'];

/* ---------- モンスター ---------- */
/* atk: [{dmg:[n,s,m], name, sp}] / sp: poison,paralyze,drain,petrify,blood */
function M(o){ return o; }
const MONSTERS=[
 M({id:'rat',   n:'ジャイアント・ラット',hd:0.5,ac:7,atk:[{dmg:[1,3],name:'噛みつき'}],xp:7,  mor:5, lv:[1,2],num:[3,7], d:'犬ほどもある薄汚れたドブネズミの群れ。'}),
 M({id:'kobold',n:'コボルド',           hd:0.5,ac:7,atk:[{dmg:[1,6],name:'スピア'}],  xp:7,  mor:6, lv:[1,2],num:[2,6], d:'犬の顔をした小鬼。臆病だが数で押してくる。'}),
 M({id:'goblin',n:'ゴブリン',           hd:1,  ac:6,atk:[{dmg:[1,6],name:'ショートソード'}],xp:15,mor:7,lv:[1,3],num:[2,5],d:'黄色い目をした緑肌の小鬼。汚れた刃を握っている。'}),
 M({id:'skel',  n:'スケルトン',         hd:1,  ac:7,atk:[{dmg:[1,6],name:'錆びた剣'}],xp:15, mor:12,lv:[1,3],num:[2,5],undead:true,d:'骨がかたかたと鳴る。眼窩に鬼火が灯っている。'}),
 M({id:'centi', n:'ジャイアント・センチピード',hd:1,ac:9,atk:[{dmg:[1,2],name:'毒牙',sp:'poison'}],xp:20,mor:7,lv:[1,3],num:[2,5],d:'腕ほどもあるムカデ。毒牙が濡れて光る。'}),
 M({id:'orc',   n:'オーク',             hd:1,  ac:6,atk:[{dmg:[1,8],name:'アックス'}],xp:15, mor:8, lv:[1,4],num:[2,6], d:'豚のような鼻面をした戦士。獣脂の臭いがする。'}),
 M({id:'stirge',n:'スタージ',           hd:1,  ac:8,atk:[{dmg:[1,3],name:'吸血管',sp:'blood'}],xp:36,mor:9,lv:[1,3],num:[3,6],fly:true,d:'蚊のような嘴を持つ怪鳥。血を吸いに殺到する。'}),
 M({id:'hobgob',n:'ホブゴブリン',       hd:1.1,ac:5,atk:[{dmg:[1,8],name:'ロングソード'}],xp:35,mor:10,lv:[2,4],num:[2,5],d:'赤ら顔の大鬼。規律ある動きで隊列を組む。'}),
 M({id:'zombie',n:'ゾンビ',             hd:2,  ac:8,atk:[{dmg:[1,8],name:'殴打'}],   xp:35, mor:12,lv:[2,4],num:[2,4],undead:true,slow:true,d:'腐臭を放つ死体がゆっくりと立ち上がる。'}),
 M({id:'gnoll', n:'ノール',             hd:2,  ac:5,atk:[{dmg:[2,4],name:'ハルバード'}],xp:35,mor:8,lv:[2,4],num:[2,4],d:'ハイエナの頭を持つ大男。笑うような唸り声。'}),
 M({id:'ghoul', n:'グール',             hd:2,  ac:6,atk:[{dmg:[1,3],name:'爪',sp:'paralyze'},{dmg:[1,6],name:'噛みつき',sp:'paralyze'}],xp:175,mor:10,lv:[2,5],num:[1,4],undead:true,d:'屍を喰らう者。触れられれば体が動かなくなる。'}),
 M({id:'ant',   n:'ジャイアント・アント',hd:2, ac:3,atk:[{dmg:[1,6],name:'顎'}],     xp:35, mor:9, lv:[2,4],num:[2,4],d:'磨かれた黒曜石のような甲殻の巨大蟻。'}),
 M({id:'spider',n:'ジャイアント・スパイダー',hd:4.4,ac:4,atk:[{dmg:[1,8],name:'毒牙',sp:'poison'}],xp:650,mor:9,lv:[3,5],num:[1,3],d:'天井から糸を垂らす漆黒の蜘蛛。'}),
 M({id:'ogre',  n:'オーガ',             hd:4.1,ac:5,atk:[{dmg:[1,10],name:'棍棒'}],  xp:270,mor:10,lv:[3,5],num:[1,3],d:'見上げるほどの巨人鬼。息が腐肉の臭いだ。'}),
 M({id:'gargo', n:'ガーゴイル',         hd:4.4,ac:5,atk:[{dmg:[1,3],name:'爪'},{dmg:[1,6],name:'噛みつき'},{dmg:[1,4],name:'角'}],xp:650,mor:11,lv:[3,6],num:[1,3],fly:true,d:'石像だと思ったものが、首をこちらに回した。'}),
 M({id:'wight', n:'ワイト',             hd:4.3,ac:5,atk:[{dmg:[1,4],name:'凍える手',sp:'drain'}],xp:1400,mor:12,lv:[4,6],num:[1,2],undead:true,d:'墓の主。その手はレベルそのものを奪う。'}),
 M({id:'owlbear',n:'オウルベア',        hd:5.2,ac:5,atk:[{dmg:[1,6],name:'爪'},{dmg:[1,6],name:'爪'},{dmg:[2,6],name:'噛みつき'}],xp:420,mor:10,lv:[3,6],num:[1,2],d:'梟の頭と熊の体。抱きしめられたら終わりだ。'}),
 M({id:'cocka', n:'コカトリス',         hd:5,  ac:6,atk:[{dmg:[1,3],name:'嘴',sp:'petrify'}],xp:1400,mor:8,lv:[4,6],num:[1,2],fly:true,d:'鶏と蛇の混じり物。触れられれば石になる。'}),
 M({id:'troll', n:'トロル',             hd:6.6,ac:4,atk:[{dmg:[1,4,4],name:'爪'},{dmg:[1,4,4],name:'爪'},{dmg:[2,6],name:'噛みつき'}],xp:1400,mor:12,lv:[4,7],num:[1,2],regen:3,d:'ゴム質の緑の肌。斬られた傷が見る間に塞がる。'}),
 M({id:'mino',  n:'ミノタウロス',       hd:6.3,ac:6,atk:[{dmg:[2,4],name:'角'},{dmg:[1,10],name:'グレートアックス'}],xp:1400,mor:12,lv:[4,7],num:[1,2],d:'牛頭の巨人。迷宮の主として君臨している。'}),
 M({id:'basil', n:'バジリスク',         hd:6.1,ac:4,atk:[{dmg:[1,10],name:'噛みつき',sp:'petrify'}],xp:1400,mor:9,lv:[5,7],num:[1,1],d:'八本足の蜥蜴。その視線は石化の呪いを帯びる。'}),
 M({id:'hillg', n:'ヒル・ジャイアント', hd:8,  ac:4,atk:[{dmg:[2,8],name:'大棍棒'}], xp:3000,mor:11,lv:[5,8],num:[1,2],d:'家ほどもある巨人。一撃で人は挽き肉になる。'}),
 M({id:'vamp',  n:'ヴァンパイア',       hd:8.3,ac:1,atk:[{dmg:[1,6,4],name:'触れる手',sp:'drain'}],xp:5000,mor:14,lv:[6,9],num:[1,1],undead:true,regen:3,d:'貴族の装いをした死者。瞳が赤く燃えている。'}),
 M({id:'wyvern',n:'ワイバーン',         hd:7.7,ac:3,atk:[{dmg:[2,8],name:'噛みつき'},{dmg:[1,6],name:'毒尾',sp:'poison'}],xp:1400,mor:11,lv:[5,8],num:[1,2],fly:true,d:'二本足の飛竜。尾の毒針が振り上げられる。'}),
 M({id:'ydrag', n:'ヤング・レッドドラゴン',hd:9,ac:0,atk:[{dmg:[1,8],name:'爪'},{dmg:[1,8],name:'爪'},{dmg:[3,10],name:'噛みつき'}],breath:{dmg:'hp',name:'火炎のブレス'},xp:7000,mor:14,lv:[6,9],num:[1,1],d:'赤銅色の鱗。喉の奥が炉のように赤熱している。'}),
 M({id:'lich',  n:'リッチ',             hd:11, ac:0,atk:[{dmg:[1,10],name:'冷たい掌',sp:'drain'}],xp:9000,mor:16,lv:[7,9],num:[1,1],undead:true,d:'魔法使いの成れの果て。乾いた指が呪文を編む。'}),

 /* ---- ここから先は High Level Campaigns の領域。11レベル以降の相手 ---- */
 M({id:'stoneg',n:'ストーン・ジャイアント',hd:9,ac:0,atk:[{dmg:[3,10],name:'岩の投擲'}],xp:3000,mor:13,lv:[8,13],num:[1,2],d:'灰色の肌をした岩の巨人。人の頭ほどの石を軽々と投げる。'}),
 M({id:'hydra', n:'ハイドラ',           hd:10, ac:5,atk:[{dmg:[1,10],name:'第一の頭'},{dmg:[1,10],name:'第二の頭'},{dmg:[1,10],name:'第三の頭'}],xp:3000,mor:12,lv:[8,13],num:[1,1],regen:2,d:'幾つもの首をもたげる大蛇。斬っても首は生えてくる。'}),
 M({id:'behold',n:'ビホルダー',         hd:10, ac:0,atk:[{dmg:[2,4],name:'大顎'},{dmg:[1,6],name:'魔眼の光条',sp:'paralyze'}],xp:9000,mor:14,lv:[9,15],num:[1,1],fly:true,d:'宙に浮かぶ巨大な眼球。十本の触腕の先すべてに、別の眼が付いている。'}),
 M({id:'fireg', n:'ファイア・ジャイアント',hd:11,ac:3,atk:[{dmg:[5,6],name:'業火の大剣'}],xp:5000,mor:14,lv:[9,16],num:[1,2],d:'黒鉄の肌と燃える髪。踏み出すたびに床が焦げる。'}),
 M({id:'pitf',  n:'ピット・フィーンド',  hd:13, ac:-3,atk:[{dmg:[1,6,6],name:'爪'},{dmg:[2,8],name:'噛みつき',sp:'poison'},{dmg:[2,6],name:'尾の打撃'}],xp:14000,mor:17,lv:[11,20],num:[1,1],fly:true,regen:2,d:'地獄の将。翼を広げれば広間の天井が隠れる。'}),
 M({id:'balor', n:'バロール',           hd:13, ac:-2,atk:[{dmg:[2,10],name:'炎の鞭'},{dmg:[3,8],name:'雷鳴の剣'}],xp:14000,mor:18,lv:[11,20],num:[1,1],fly:true,d:'炎と影でできた大悪魔。鞭と剣を同時に振るう。'}),
 M({id:'adrag', n:'アダルト・レッドドラゴン',hd:13,ac:-1,atk:[{dmg:[1,10],name:'爪'},{dmg:[1,10],name:'爪'},{dmg:[3,12],name:'噛みつき'}],breath:{dmg:[10,8],name:'焦熱のブレス'},xp:14000,mor:16,lv:[10,18],num:[1,1],fly:true,d:'成熟した赤竜。鱗の一枚一枚が盾ほどもある。'}),
 M({id:'sgolem',n:'ストーン・ゴーレム',  hd:14, ac:5,atk:[{dmg:[3,8],name:'石の拳'}],xp:8000,mor:20,lv:[11,18],num:[1,1],d:'命令だけで動く石像。痛みも恐れも知らない。'}),
 M({id:'dknight',n:'デス・ナイト',      hd:15, ac:0,atk:[{dmg:[2,8,4],name:'呪われた大剣',sp:'drain'}],xp:14000,mor:20,lv:[12,20],num:[1,1],undead:true,d:'誓いを裏切った騎士の亡骸。兜の奥に緑の火が揺れる。'}),
 M({id:'pworm', n:'パープル・ワーム',    hd:15, ac:6,atk:[{dmg:[2,12],name:'呑み込み'},{dmg:[2,4],name:'毒針',sp:'poison'}],xp:10000,mor:14,lv:[11,18],num:[1,1],d:'床を突き破って現れる紫の大蟲。丸ごと呑み込みにかかる。'}),
 M({id:'stormg',n:'ストーム・ジャイアント',hd:15,ac:2,atk:[{dmg:[7,6],name:'雷の大剣'}],xp:13000,mor:16,lv:[12,20],num:[1,1],d:'雲の色をした巨人。掌の中で稲妻が鳴っている。'}),
 M({id:'marilith',n:'マリリス',         hd:16, ac:-4,atk:[{dmg:[1,8],name:'第一の剣'},{dmg:[1,8],name:'第二の剣'},{dmg:[1,8],name:'第三の剣'},{dmg:[1,8],name:'第四の剣'},{dmg:[2,6],name:'尾での締めつけ'}],xp:16000,mor:17,lv:[13,22],num:[1,1],d:'蛇の下半身に六本の腕。腕の数だけ刃を持ち、その全てが同時に来る。'}),
 M({id:'nightw',n:'ナイトウォーカー',    hd:19, ac:-4,atk:[{dmg:[4,6],name:'虚無の掌',sp:'drain'},{dmg:[4,6],name:'返す掌'}],xp:20000,mor:19,lv:[15,25],num:[1,1],undead:true,d:'闇そのものが人の形を取ったもの。通り過ぎた場所から光が失われる。'}),
 M({id:'igolem',n:'アイアン・ゴーレム',  hd:18, ac:3,atk:[{dmg:[4,10],name:'鉄塊の一撃'}],xp:15000,mor:20,lv:[14,22],num:[1,1],d:'鉄の巨人。継ぎ目から毒の霧が漏れ出している。'}),
 M({id:'titan', n:'タイタン',           hd:20, ac:-3,atk:[{dmg:[6,6],name:'神代の戦鎚'},{dmg:[6,6],name:'返す一撃'}],xp:23000,mor:19,lv:[16,25],num:[1,1],d:'神々に連なる巨人。その一撃は世界を打つために振るわれる。'}),
 M({id:'anddrag',n:'エンシェント・レッドドラゴン',hd:20,ac:-4,atk:[{dmg:[1,12],name:'爪'},{dmg:[1,12],name:'爪'},{dmg:[3,12],name:'噛みつき'}],breath:{dmg:[14,10],name:'古竜のブレス'},xp:25000,mor:18,lv:[16,26],num:[1,1],fly:true,d:'一つの山ほどもある古竜。目を開けただけで熱風が吹く。'}),
 M({id:'archlich',n:'アーク・リッチ',    hd:22, ac:-6,atk:[{dmg:[2,10],name:'滅びの掌',sp:'drain'},{dmg:[1,8],name:'死の呪言',sp:'petrify'}],xp:30000,mor:20,lv:[18,30],num:[1,1],undead:true,regen:3,d:'幾千年を越えた大魔道の骸。この階層そのものが、彼の魔法陣の内側だ。'})
];
function hdParts(hd){ const n=Math.floor(hd); const p=Math.round((hd-n)*10); return [n,p]; }

function makeFoe(m, idx){
  const [n,plus]=hdParts(m.hd);
  let hp=0; const rolls=[];
  if(m.hd===0.5){ hp=die(4); rolls.push(hp); }
  else { for(let i=0;i<n;i++){ const r=die(8); rolls.push(r); hp+=r; } hp+=plus; }
  hp=Math.max(1,hp);
  const hdNum = m.hd===0.5?1:n;
  // AD&D式 モンスターTHAC0：1-2HD=19, 3-4HD=17, 5-6HD=15, 7-8HD=13 …
  const t0 = m.hd===0.5 ? 20 : Math.max(1, 21 - 2*Math.ceil(hdNum/2));
  return { ...m, idx, name:m.n, hp, maxhp:hp, ac:m.ac, thac0:t0,
           alive:true, known:false, status:{}, hdNum };
}

/* ---------- 罠 ---------- */
const TRAPS=[
 {n:'落とし穴',       d:'床板が抜けた！',                 save:'dex', dmg:[2,6]},
 {n:'毒針',           d:'錠前から細い針が跳ね出た！',     save:'ppd', dmg:[1,3], poison:[2,6]},
 {n:'毒ガスの噴出',   d:'黄緑の霧が噴き出す！',           save:'ppd', dmg:[2,6]},
 {n:'仕掛け矢',       d:'壁の穴から矢が唸りをあげる！',   save:'dex', dmg:[1,6,1]},
 {n:'落石',           d:'天井が崩れ落ちる！',             save:'dex', dmg:[2,6]},
 {n:'魔法のグリフ',   d:'床の紋様が青白く爆ぜた！',       save:'sp',  dmg:[2,4]},
 {n:'炎の噴射',       d:'獣面の彫刻が火を吐いた！',       save:'bw',  dmg:[3,6]},
 {n:'振り子の刃',     d:'闇から巨大な鎌が振り抜かれる！', save:'dex', dmg:[2,4,2]},
 {n:'圧殺天井',       d:'天井全体が軋みながら降りてくる！',save:'dex',dmg:[4,6]}
];

/* ---------- マジックアイテム ---------- */
function itW(base,plus){ const w=WEAPONS[base]; return {uid:uid(),kind:'weapon',base,plus,
  name:`${w.name}+${plus}`, val:(plus*plus)*400+200, d:`命中+${plus}／ダメージ+${plus}`}; }
function itA(base,plus){ const a=ARMORS[base]; return {uid:uid(),kind:'armor',base,plus,
  name:`${a.name}+${plus}`, val:(plus*plus)*500+300, d:`AC${a.ac-plus}相当`}; }
/* 魔法のかかっていない、ただの武具。初期装備も店で買った品もこれで作る。
   外すことも、売ることも、装備し直すこともできる。plus は 0。
   売値の元になる val には店売り価格を入れる
   （sellPrice が半値にするので、75gp のチェインメイルなら 37gp で引き取られる）。 */
function itPlainW(base){ const w=WEAPONS[base]; const [n,s,m=0]=w.dmg;
  return {uid:uid(),kind:'weapon',base,plus:0,
    name:w.name, val:w.price, d:`ダメージ ${n}d${s}${m?`+${m}`:''}`}; }
function itPlainA(base){ const a=ARMORS[base];
  return {uid:uid(),kind:'armor',base,plus:0,
    name:a.name, val:a.price, d:`AC${a.ac}相当`}; }
function itPlainS(){ return {uid:uid(),kind:'shield',plus:0,
  name:'シールド', val:10, d:'AC1点改善'}; }
const MAGIC_TIERS = {
 1:[ ()=>({uid:uid(),kind:'potion',eff:'heal',name:'ヒーリング・ポーション',val:120,d:'2d4+2 HP回復'}),
     ()=>({uid:uid(),kind:'scroll',sp:'magicmissile',name:'マジック・ミサイルの巻物',val:150,d:'誰でも使える。必中の魔法の矢。'}),
     ()=>({uid:uid(),kind:'scroll',sp:'curelight',name:'キュア・ライト・ウーンズの巻物',val:150,d:'誰でも使える。1d8回復。'}),
     ()=>itW('dagger',1), ()=>itW('shortsword',1),
     ()=>({uid:uid(),kind:'misc',eff:'torch',name:'エヴァーバーニング・トーチ',val:200,d:'燃え尽きない松明。明かりが消えない。'}) ],
 2:[ ()=>itW('shortsword',1), ()=>itW('longsword',1), ()=>itW('mace',1), ()=>itA('leather',1),
     ()=>({uid:uid(),kind:'shield',plus:1,name:'シールド+1',val:600,d:'AC1点改善'}),
     ()=>({uid:uid(),kind:'ring',eff:'prot',plus:1,name:'リング・オブ・プロテクション+1',val:1500,d:'AC1点改善／全セーヴ+1'}),
     ()=>({uid:uid(),kind:'potion',eff:'exheal',name:'エクストラ・ヒーリング・ポーション',val:400,d:'3d8+3 HP回復'}),
     ()=>({uid:uid(),kind:'potion',eff:'invis',name:'インビジビリティ・ポーション',val:500,d:'姿を消す（8ラウンド）'}),
     ()=>({uid:uid(),kind:'scroll',sp:'sleep',name:'スリープの巻物',val:200,d:'誰でも使える。'}),
     ()=>({uid:uid(),kind:'misc',eff:'boots',name:'ブーツ・オブ・エルヴンカインド',val:900,d:'隠密判定に+20%（気配察知も有利）'}) ],
 3:[ ()=>itW('longsword',2), ()=>itW('shortsword',2), ()=>itW('battleaxe',2), ()=>itA('chain',1),
     ()=>({uid:uid(),kind:'ring',eff:'invis',name:'インビジビリティ・リング',val:4000,d:'1日3回、姿を消す（8ラウンド）',uses:3,max:3}),
     ()=>({uid:uid(),kind:'ring',eff:'prot',plus:2,name:'リング・オブ・プロテクション+2',val:4000,d:'AC2点改善／全セーヴ+2'}),
     ()=>({uid:uid(),kind:'wand',sp:'magicmissile',name:'ワンド・オブ・マジックミサイル',val:3500,d:'魔法の矢を放つ',uses:ri(6,12),max:12}),
     ()=>({uid:uid(),kind:'potion',eff:'giant',name:'ジャイアント・ストレングスのポーション',val:900,d:'STRが18になる（1戦闘）'}),
     ()=>({uid:uid(),kind:'scroll',sp:'fireball',name:'ファイアーボールの巻物',val:600,d:'誰でも使える。爆炎。'}),
     ()=>({uid:uid(),kind:'misc',eff:'bag',name:'バッグ・オブ・ホールディング',val:2500,d:'見た目より遥かに入る袋。高値で売れる。'}) ],
 4:[ ()=>itW('longsword',3), ()=>itW('shortsword',3), ()=>itW('twohanded',2), ()=>itA('plate',1),
     ()=>({uid:uid(),kind:'weapon',base:'longsword',plus:1,flame:true,name:'フレイム・タン',val:6000,d:'命中+1／ダメージ+1、炎で追加1d6'}),
     ()=>({uid:uid(),kind:'ring',eff:'regen',name:'リング・オブ・リジェネレーション',val:9000,d:'毎ラウンド1HP回復'}),
     ()=>({uid:uid(),kind:'ring',eff:'prot',plus:3,name:'リング・オブ・プロテクション+3',val:8000,d:'AC3点改善／全セーヴ+3'}),
     ()=>({uid:uid(),kind:'wand',sp:'fireball',name:'ワンド・オブ・ファイアーボール',val:9000,d:'爆炎を放つ',uses:ri(4,9),max:9}),
     ()=>({uid:uid(),kind:'potion',eff:'exheal',name:'エクストラ・ヒーリング・ポーション',val:400,d:'3d8+3 HP回復'}) ],
 /* ---- High Level Campaigns。11レベル以降の穴からしか出ない品 ---- */
 5:[ ()=>itW('longsword',4), ()=>itW('battleaxe',4), ()=>itW('twohanded',3), ()=>itW('warhammer',4),
     ()=>itA('plate',2), ()=>itA('chain',3),
     ()=>({uid:uid(),kind:'shield',plus:3,name:'シールド+3',val:4000,d:'AC3点改善'}),
     ()=>({uid:uid(),kind:'ring',eff:'prot',plus:4,name:'リング・オブ・プロテクション+4',val:16000,d:'AC4点改善／全セーヴ+4'}),
     ()=>({uid:uid(),kind:'weapon',base:'longsword',plus:3,flame:true,name:'フレイム・タン+3',val:18000,d:'命中+3／ダメージ+3、炎で追加1d6'}),
     ()=>({uid:uid(),kind:'wand',sp:'coneofcold',name:'ワンド・オヴ・コールド',val:22000,d:'凍てつく扇を放つ',uses:ri(4,9),max:9}),
     ()=>({uid:uid(),kind:'scroll',sp:'flamestrike',name:'フレイム・ストライクの巻物',val:2500,d:'誰でも使える。天からの火柱。'}),
     ()=>({uid:uid(),kind:'potion',eff:'exheal',name:'エクストラ・ヒーリング・ポーション',val:400,d:'3d8+3 HP回復'}) ],
 6:[ ()=>itW('longsword',5), ()=>itW('twohanded',4), ()=>itW('mace',5), ()=>itA('plate',3),
     ()=>({uid:uid(),kind:'weapon',base:'longsword',plus:5,flame:true,name:'ホーリー・アヴェンジャー',val:60000,d:'命中+6／ダメージ+6、聖なる炎で追加1d6'}),
     ()=>({uid:uid(),kind:'ring',eff:'prot',plus:5,name:'リング・オブ・プロテクション+5',val:32000,d:'AC5点改善／全セーヴ+5'}),
     ()=>({uid:uid(),kind:'ring',eff:'regen',name:'リング・オブ・リジェネレーション',val:9000,d:'毎ラウンド1HP回復'}),
     ()=>({uid:uid(),kind:'wand',sp:'meteorswarm',name:'スタッフ・オヴ・ザ・マギ',val:75000,d:'火球の雨を降らせる',uses:ri(3,6),max:6}),
     ()=>({uid:uid(),kind:'scroll',sp:'healsp',name:'ヒールの巻物',val:5000,d:'誰でも使える。HPが最大値まで戻る。'}),
     ()=>({uid:uid(),kind:'shield',plus:4,name:'シールド+4',val:9000,d:'AC4点改善'}) ]
};
const MAGIC_TIER_MAX=6;
const GEMS=[['水晶',10],['瑪瑙',50],['ガーネット',100],['翡翠',250],['ルビー',500],['ダイヤモンド',1000]];
const ART =[['銀の聖印',60],['象牙の小像',150],['金杯',400],['宝石入りの王冠',1200]];

function rollMagic(tier){
  const t=Math.max(1,Math.min(MAGIC_TIER_MAX,tier));
  return pick(MAGIC_TIERS[t])();
}
function rollTreasure(diff, quality){
  // quality: 0=雑魚 1=宝箱 2=豪華 3=ボス
  const out={gold:0,items:[]};
  const mult=[0.5,1,2,4][quality];
  // 金貨1枚＝1経験点。ソロ冒険者が成長できる規模にする（AD&Dの財宝表相当）
  out.gold = Math.floor(rollDmg([2+diff*2,10]).total * mult * (8+diff*4));
  const gemChance=[0.10,0.35,0.6,0.9][quality];
  if(chance(gemChance)){
    const g = chance(0.7)?pick(GEMS):pick(ART);
    out.items.push({uid:uid(),kind:'treasure',name:g[0],val:Math.floor(g[1]*(1+diff*0.2))});
  }
  const magicChance=[0.05,0.28,0.5,1.0][quality];
  if(chance(magicChance)){
    let tier = Math.max(1,Math.min(MAGIC_TIER_MAX, Math.round(diff/1.4) + (quality>=2?1:0) + (chance(0.2)?1:0)));
    out.items.push(rollMagic(tier));
  }
  if(quality>=3 && chance(0.6)) out.items.push(rollMagic(Math.min(MAGIC_TIER_MAX,Math.round(diff/1.3)+1)));
  return out;
}

/* ボスはダンジョンの想定脅威度に見合うHDのものを選ぶ（本体と同じ）。
   低難度では麻痺・レベル吸収・石化といった「失敗＝即終了」の敵をボスにしない */
function pickBoss(diff,floorNo){
  const target = Math.max(2, (diff+floorNo)*0.9 + 1);
  const cruel = m => (m.atk||[]).some(a=>a.sp==='paralyze'||a.sp==='drain'||a.sp==='petrify');
  let cand = MONSTERS.filter(m=>m.hd>=2 && (diff>=2 || !cruel(m)));
  if(!cand.length) cand = MONSTERS.filter(m=>m.hd>=2);
  cand = cand.sort((a,b)=>Math.abs(a.hd-target)-Math.abs(b.hd-target));
  return cand[ri(0, Math.min(2, cand.length-1))] || MONSTERS[MONSTERS.length-1];
}
/* その階に出るモンスター（本体と同じ選び方） */
function monsterPool(diff, floorNo){
  const lvl=diff+floorNo-1;
  const pool=MONSTERS.filter(m=> lvl>=m.lv[0] && lvl<=m.lv[1]+1);
  return pool.length ? pool : MONSTERS.filter(m=>m.lv[0]<=Math.max(1,lvl));
}

/* ============================================================
   パーティ用の調整
   本体は1人旅なので、遭遇数を冒険者のレベルで絞り、財宝も1人で使い切る量にしてある。
   パーティでは AD&D の出現数をほぼそのまま使い、得た経験点は生きている全員で山分けする。
   山分けで1人あたりが痩せすぎないよう、モンスターの経験点と金貨を増やす
   ============================================================ */
const PARTY_XP_MULT=2, PARTY_GOLD_MULT=3;
/* 遭遇数：出現数（num）を振り、パーティの総レベルの 3/4 ぶんのHDを上限の目安にする
   （駆け出しの6人なら4HD：ゴブリン4体、ノール2体まで） */
function encCount(m, dg, partyLv){
  const base=ri(m.num[0], m.num[1]);
  if(dg && dg.narrow) return Math.min(base, 2);          // 古井戸の底：狭くて群れは通れない
  const budget=Math.max(2, partyLv*0.75);
  const hd=Math.max(0.5, Math.floor(m.hd)||0.5);
  return Math.max(1, Math.min(base, Math.floor(budget/hd)));
}

/* ============================================================
   派生値（パーティ用）
   装備は ch.eq（weapon／armor／shield／rings）に持つ。持ち物はパーティの共有の荷物。
   戦闘中だけの効果は ch.cb（その人）と CB.pb（パーティ全体）に置く
   ============================================================ */
let CB=null;   // 戦闘の状態。戦闘の外では null（combat.js が作る）
function cbuf(ch,k){ return (CB && ch.cb && ch.cb[k]>0) ? ch.cb[k] : 0; }
function pbuf(k){ return (CB && CB.pb[k]>0) ? CB.pb[k] : 0; }

function AC(ch){
  const a=ch.eq.armor;
  let ac = a ? ARMORS[a.base].ac - a.plus : ARMORS.none.ac;
  // モンクの無鎧の構え：鎧を着ていないときだけ、レベルに応じてACが下がる
  if(CLASSES[ch.cls].martial && !a) ac = 9 - Math.floor((ch.lv-1)/2);
  const sh=ch.eq.shield;
  if(sh) ac -= (1 + sh.plus);
  ac += dexAC(ch.abil.DEX);
  ch.eq.rings.forEach(r=>{ if(r.eff==='prot') ac -= r.plus; });
  ac -= relicMod(ch,'ac');
  if(cbuf(ch,'shield')) ac -= 4;
  if(CB && ch.cb && ch.cb.defend) ac -= 2;
  return ac;
}
function curWeapon(ch){
  const w=ch.eq.weapon;
  if(w) return {base:WEAPONS[w.base], key:w.base, plus:w.plus, name:w.name, flame:w.flame, holy:w.holy};
  if(CLASSES[ch.cls].martial){
    const d=martialDmg(ch.lv, relicMod(ch,'martial'));
    return {base:{name:'素手',dmg:d}, key:null, plus:0, name:`素手打（${dmgTxt(d)}）`, martial:true};
  }
  return {base:{name:'素手',dmg:[1,2]}, key:null, plus:0, name:'素手'};
}
function THAC0(ch){ return Math.max(THAC0_FLOOR, CLASSES[ch.cls].thac0(ch.lv)); }
function saveTarget(ch, kind){
  const C=CLASSES[ch.cls];
  let t = Math.max(SAVE_FLOOR, C.saves[kind] - Math.floor((ch.lv-1)/C.saveEvery)*C.saveStep);
  if(C.savePlus) t -= C.savePlus;          // 聖戦士の不屈
  t -= relicMod(ch,'save');
  ch.eq.rings.forEach(r=>{ if(r.eff==='prot') t -= r.plus; });
  if(pbuf('bless')) t -= 1;
  if(cbuf(ch,'protevil')) t -= 2;
  return Math.max(2,t);
}
function effSTR(ch){ return cbuf(ch,'giant') ? 18 : ch.abil.STR; }
function hitBonus(ch){
  const C=CLASSES[ch.cls];
  let b = strHit(effSTR(ch)) + curWeapon(ch).plus;
  if(C.hitPlus) b += C.hitPlus;            // 騎士の武芸
  const mas=masteryOf(ch); if(mas) b += mas.hit;
  b += relicMod(ch,'hit');
  if(pbuf('bless')) b += 1;
  if(pbuf('prayer')) b += 1;
  if(cbuf(ch,'invis')) b += 4;
  if(cbuf(ch,'divine')) b += 3;
  return b;
}
function dmgBonus(ch){
  const C=CLASSES[ch.cls];
  let b = strDmg(effSTR(ch)) + curWeapon(ch).plus;
  if(C.dmgPlus) b += C.dmgPlus;            // バーバリアンの剛打
  const mas=masteryOf(ch); if(mas) b += mas.dmg;
  b += relicMod(ch,'dmg');
  return b;
}
/* シーフ技能。モンクは隠密系だけを、シーフより低い値で持つ。
   パーティ用：シーフの道具一式は共有の荷物にあれば効く */
function thiefSkill(ch, kind, bag){
  const monk = CLASSES[ch.cls].stealth;
  if(ch.cls!=='thief' && !monk) return null;
  if(monk && !['ms','hs','hn'].includes(kind)) return null;
  const base={ol:25,ft:20,ms:20,hs:15,hn:15}[kind];
  const gain={ol:5, ft:5, ms:5, hs:5, hn:3}[kind];
  let v = base + gain*(ch.lv-1) + dexSkill(ch.abil.DEX, kind==='hn'?'ms':(kind==='hs'?'ms':kind));
  if(monk) v = Math.floor(v*0.8);
  if(ch.cls==='thief' && (kind==='ol'||kind==='ft') && bag && bag.some(i=>i.eff==='tools')) v += 10;
  v += relicMod(ch,'thief');
  return Math.max(1,Math.min(95,v));
}
function xpNext(ch){ const t=CLASSES[ch.cls].xp; return ch.lv<t.length? t[ch.lv] : null; }
/* レベルアップ時のHP。名声レベルまではヒットダイス、その先は固定値（本体と同じ） */
function hpGainForLevel(ch, lv){
  const C=CLASSES[ch.cls];
  const hdTo=C.hdTo||9;
  if(lv<=hdTo){
    const roll=die(C.hd);
    return {roll, fixed:false, gain:Math.max(1, roll+conHP(ch.abil.CON,C.warrior))};
  }
  const roll=hpAfterName(C);
  return {roll, fixed:true, gain:roll};
}
/* そのレベルまでに覚える呪文をすべて修得させる */
function learnSpellsUpTo(ch){
  const C=CLASSES[ch.cls]; if(!C.spell) return;
  const from=C.spellFrom||1;
  const eff = ch.lv<from ? 0 : ch.lv-from+1;
  ch.spells=[];
  for(let l=1;l<=eff;l++)
    (SPELL_LEARN[C.spell][l]||[]).forEach(s=>{ if(!ch.spells.includes(s)) ch.spells.push(s); });
}
/* 薬・巻物・指輪・杖・道具は職業を問わず使える。武器・鎧・盾だけ職業で決まる */
function canUse(cls, it){
  if(it.kind==='weapon') return WEAPONS[it.base].ok.includes(cls);
  if(it.kind==='armor')  return ARMORS[it.base].ok.includes(cls);
  if(it.kind==='shield') return !NO_SHIELD.includes(cls);
  return true;
}
/* パーティの札に載せる短い職業名 */
const CLASS_SHORT={fighter:'戦士',cleric:'僧侶',thief:'盗賊',mage:'魔術師',barbarian:'蛮族',cavalier:'騎士',paladin:'聖騎士',monk:'武僧'};
function kindJa(k){ return {weapon:'武器',armor:'鎧',shield:'盾',ring:'指輪',potion:'薬',scroll:'巻物',wand:'杖',misc:'道具',treasure:'財宝'}[k]||k; }
function sellPrice(i){ return Math.max(1, Math.floor((i.val||10) * (i.kind==='treasure'?1:0.5))); }
function spJa(s){ return {poison:'毒',paralyze:'麻痺',drain:'レベル吸収',petrify:'石化',blood:'吸血'}[s]||s; }
