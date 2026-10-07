"use strict";
/* ============================================================
   冒険の状態・記録・描画の流れ・迷宮の探索

   時間は AD&D の「ターン」（10分）で数える。
   探索しながらの移動は1ターンに120フィート＝12マス、壁を調べるのは1ターン、
   松明1本は6ターン（1時間）で燃え尽きる。ターンが変わるたびに 1/6 で徘徊する敵に出くわす。
   ============================================================ */
/* 本体（Dungeon Delve）と同じドメイン・同じ file:// で開いてもセーブが混ざらないよう、名前を分ける */
const SAVEKEY='ddadv.save2', SETKEY='ddadv.settings';
const SAVE_VER=2;
const TICKS_PER_TURN=12;
const TORCH_TICKS=6*TICKS_PER_TURN;
const TORCH_STOCK=6;          // 地上で揃える松明の本数（灯している1本を含む）

let S=null;          // 冒険の状態（そのままセーブする）
let L=null;          // 今いる階（S.levels[S.floor] を展開したもの）
let MODE='title';    // 'title' | 'town' | 'dungeon' | 'combat'
let SET={style:'stone'};
let previewDg=0;     // タイトル・迷宮選びの背景に出す迷宮
const hinted=new Set();

/* ---------- パーティ ---------- */
function byId(id){ return S.roster.find(c=>c.id===id); }
function party(){ return S ? S.party.map(byId).filter(Boolean) : []; }
function alive(ch){ return ch.status==='ok'; }
function canAct(ch){ return ch.status==='ok' && !(ch.para>0); }
function living(){ return party().filter(alive); }
function partyLevel(){ return living().reduce((n,c)=>n+c.lv,0); }
function bestOf(list, f){ let b=null, bv=-Infinity; list.forEach(c=>{ const v=f(c); if(v!=null && v>bv){ bv=v; b=c; } }); return b; }
/* 倒れた者・石になった者は後ろへ回し、生きている者が前列に立つ（Wizardry の流儀） */
function compactParty(){
  const P=party();
  const up=P.filter(alive), down=P.filter(c=>!alive(c));
  S.party=up.concat(down).map(c=>c.id);
}

/* ---------- 設定・記録 ---------- */
function loadSettings(){ try{ Object.assign(SET, JSON.parse(localStorage.getItem(SETKEY)||'{}')); }catch(e){} }
function saveSettings(){ try{ localStorage.setItem(SETKEY, JSON.stringify(SET)); }catch(e){} }
function save(){
  if(!S || MODE==='combat') return;           // 戦闘中は記録しない（再開時に戦闘を戻せないため）
  try{
    if(L && S.floor>0) S.levels[S.floor]=packLevel(L);
    localStorage.setItem(SAVEKEY, JSON.stringify(S));
  }catch(e){}
}
function loadSave(){
  try{ const j=localStorage.getItem(SAVEKEY); const d=j?JSON.parse(j):null; return d && d.v===SAVE_VER ? d : null; }
  catch(e){ return null; }
}

/* ---------- 表記 ---------- */
function timeStr(t){
  const min=Math.floor(t*10/TICKS_PER_TURN), h=Math.floor(min/60), m=min%60;
  return h ? `${h}時間${m}分` : `${m}分`;
}
const REL=['前','右','後ろ','左'];
function relDir(d){ return REL[(d-S.face+4)%4]; }
function styleName(){ return SET.style==='wire' ? '線画' : '石壁'; }
function wallWord(){ const p=THEMES[S.dg].pattern; return p==='rough'?'岩肌':p==='bone'?'骨を組んだ壁':'石の壁'; }
function lit(){ return S && S.torchLeft>0; }
function lightOf(){ return lit() ? {R:3.6, I:1} : {R:1.3, I:0.3}; }
function roomAt(x,y){ const r=L.room[y*L.w+x]; return r>=0 ? L.rooms[r] : null; }
function roomIndexAt(x,y){ return L.room[y*L.w+x]; }
function onDown(){ return L && L.down && L.down.x===S.x && L.down.y===S.y; }
function onUp(){ return L && L.up && L.up.x===S.x && L.up.y===S.y; }
function chestHere(){ if(!L) return null; const c=chestAt(L,S.x,S.y); return c && !c.opened ? c : null; }
function DG(){ return DUNGEONS[S.dg]; }

/* ============================================================
   描画（眺めは requestAnimationFrame で。松明の揺らぎと敵の息遣いのため少しずつ描き直す）
   ============================================================ */
let dirty=true, mapDirty=true, lastDraw=0;
const demoCache={};
function demoLevel(id){
  if(demoCache[id]) return demoCache[id];
  const keep=_seed;
  const D=genLevel(DUNGEONS[id], 1, 4242+id*77);
  _seed=keep;
  /* 見通しのいい場所を探す（扉が見えるとなお良い） */
  let best=null, bs=-1;
  for(let y=0;y<D.h;y++) for(let x=0;x<D.w;x++) for(let f=0;f<4;f++){
    let n=0, cx=x, cy=y, door=0;
    while(n<4){ const e=edgeAt(D,cx,cy,f); if(isDoor(e)) door=1; if(!isPass(e)) break; cx+=DX[f]; cy+=DY[f]; n++; }
    const s=n*2+door*3+(D.room[y*D.w+x]<0?1:0);
    if(n>=2 && n<=4 && s>bs){ bs=s; best={x,y,f}; }
  }
  return demoCache[id]={L:D, p:best||{x:D.up.x,y:D.up.y,f:0}};
}
function sizeCanvas(cv){
  const dpr=Math.min(window.devicePixelRatio||1, 2);
  const w=Math.round(cv.clientWidth*dpr), h=Math.round(cv.clientHeight*dpr);
  if(!w || !h) return false;
  if(cv.width!==w || cv.height!==h){ cv.width=w; cv.height=h; }
  return true;
}
function flick(now){ return 1 + 0.035*Math.sin(now/170) + 0.022*Math.sin(now/53+1.3) + (Math.random()-0.5)*0.025; }

function drawView(now){
  if(!sizeCanvas($view)) return;
  const ctx=$view.getContext('2d'), W=$view.width, H=$view.height;
  if((MODE==='dungeon' || MODE==='combat') && L){
    const lt=lightOf(), fight=MODE==='combat';
    const seen=renderView(ctx,W,H,L,S.x,S.y,S.face,{style:SET.style, theme:THEMES[S.dg], R:lt.R,
      I:lt.I*(fight?0.55:1), flick:lit()&&SET.style==='stone'?flick(now):1});
    if(!fight) for(const [x,y] of seen){ const i=y*L.w+x; if(!L.seen[i]){ L.seen[i]=1; mapDirty=true; } }
    if(fight && CB) renderFoes(ctx,W,H,now);
  } else if(MODE==='town'){
    renderSurface(ctx,W,H,now);
  } else {
    const D=demoLevel(previewDg);
    renderView(ctx,W,H,D.L,D.p.x,D.p.y,D.p.f,{style:SET.style, theme:THEMES[previewDg], R:3.6, I:1, flick:SET.style==='stone'?flick(now):1});
  }
}
function drawMap(){
  if(!sizeCanvas($map)) return;
  if(MODE==='town' && S && S.levels[1]){
    /* 地上では地下1階の地図を眺められる（現在地の矢印はなし） */
    renderMap($map.getContext('2d'), $map.width, $map.height, unpackLevel(S.levels[1]), -1, -1, 0);
    return;
  }
  if(!((MODE==='dungeon'||MODE==='combat') && L)){ renderBlankMap($map.getContext('2d'), $map.width, $map.height); return; }
  renderMap($map.getContext('2d'), $map.width, $map.height, L, S.x, S.y, S.face);
}
function frame(now){
  requestAnimationFrame(frame);
  const anim = MODE!=='dungeon' || (lit() && SET.style==='stone');
  if(dirty || (anim && now-lastDraw>95)){ dirty=false; lastDraw=now; drawView(now); }
  if(mapDirty){ mapDirty=false; drawMap(); }
}

/* ---------- 画面上の小物（見出しのチップ、状態欄、前方の説明） ---------- */
function refresh(){
  dirty=true; mapDirty=true;
  const inD = MODE==='dungeon', inC = MODE==='combat';
  document.body.classList.toggle('in-dungeon', inD);
  document.body.classList.toggle('in-combat', inC);
  document.body.classList.toggle('has-party', !!(S && S.party.length));
  if(!inD){
    document.body.classList.remove('panel-map');
    $('tabMap').classList.remove('on'); $('tabMap').textContent='地図';
  }
  $compass.textContent = (inD||inC) ? DIRN[S.face] : '';
  if(inD) $ahead.innerHTML=aheadText();
  else if(inC) $ahead.innerHTML=foeSummary();
  else $ahead.innerHTML='';
  if(S){
    const chips=[];
    if(inD||inC){
      const tl=S.torchLeft;
      chips.push(`<span class="chip">地下<b>${S.floor}</b>階</span>`);
      chips.push(`<span class="chip ${tl<=TICKS_PER_TURN?'warn':''}">松明 <b>${tl>0?timeStr(tl):'なし'}</b>${tl>0?`＋${S.torches}`:''}</span>`);
    } else if(MODE==='town') chips.push(`<span class="chip"><b>地上</b></span>`);
    if(MODE!=='title') chips.push(`<span class="chip">💰 <b>${S.gold}</b></span>`);
    $chips.innerHTML=chips.join('');
  } else $chips.innerHTML='';
  if(inD||inC) statusPanel(); else guidePanel();
  renderParty();
}
function aheadText(){
  const e=edgeAt(L,S.x,S.y,S.face);
  let t;
  if(!lit()) t='闇。手で壁を探りながら進むしかない';
  else if(isDoor(e)) t='前方：<em>扉</em>';
  else if(looksSolid(e)) t='前方：'+wallWord();
  else{
    const nx=S.x+DX[S.face], ny=S.y+DY[S.face];
    const r=roomAt(nx,ny);
    t = r && r!==roomAt(S.x,S.y) ? '前方：部屋が開けている' : r ? '部屋の中' : '前方：通路が続いている';
  }
  if(onDown()) t+='　／　足もとに<em>下り階段</em>';
  if(onUp()) t+= S.floor===1 ? '　／　足もとに<em>地上への階段</em>' : '　／　足もとに<em>上り階段</em>';
  if(chestHere()) t+='　／　足もとに<em>宝箱</em>';
  return t;
}
function statusPanel(){
  const dg=DG(), tl=S.torchLeft;
  $status.innerHTML=
    `<div class="kv"><span>迷宮</span><span>${dg.name}　地下${S.floor}階／全${dg.floors}階</span></div>`+
    `<div class="kv"><span>向き・経過</span><span>${DIRN[S.face]}　${timeStr(S.ticks)}（${Math.floor(S.ticks/TICKS_PER_TURN)}ターン）</span></div>`+
    `<div class="kv"><span>松明</span><span>${tl>0?`残り${timeStr(tl)}`:'なし'}＋予備${S.torches}本</span></div>`+
    `<div class="bar"><i style="width:${Math.round(100*tl/TORCH_TICKS)}%"></i></div>`+
    keysHtml();
}
function keysHtml(){
  return `<div class="keys pc-only">`+
      `<span><kbd>↑</kbd><kbd>↓</kbd></span><span>進む／下がる（<kbd>W</kbd><kbd>S</kbd>）</span>`+
      `<span><kbd>←</kbd><kbd>→</kbd></span><span>向きを変える（<kbd>A</kbd><kbd>D</kbd>）</span>`+
      `<span><kbd>Q</kbd><kbd>E</kbd></span><span>横へ1歩</span>`+
      `<span><kbd>F</kbd></span><span>壁を調べる</span>`+
      `<span><kbd>Enter</kbd></span><span>階段・宝箱</span>`+
      `<span><kbd>C</kbd></span><span>キャンプ</span>`+
    `</div>`;
}
function guidePanel(){
  $status.innerHTML = MODE==='title' ?
    `<p class="note" style="margin-top:0">最大6人のパーティで方眼の迷宮へ潜り、敵を倒し、宝を持ち帰る。前列の3人が剣を振るい、後列の3人は呪文で支える。`+
    `経験を積んだ者は宿で休めばレベルが上がる。倒れた仲間は寺院で蘇らせられる。</p>` : '';
}

/* ============================================================
   タイトル・新しい冒険
   ============================================================ */
function title(){
  MODE='title'; previewDg=0; L=null; CB=null;
  const sv=loadSave();
  clearLog();
  log('big','DUNGEON DELVE');
  log('sub','ADVANCED ― 古典TRPG（AD&amp;D）風 一人称ダンジョン探索');
  dm('松明の明かりが届くのは、せいぜい三十フィート先まで。その向こうには、まだ誰も地図に描いていない闇がある。');
  sys('最大6人のパーティで潜る。前列の3人が戦い、後列の3人は呪文で支える。');
  acts([
    sv && {t:'続きから', s:resumeLabel(sv), cls:'pri', fn:()=>resume(sv)},
    {t:'新しい冒険', s:'パーティを一から作る', cls:sv?'':'pri', fn:()=>newGame(!!sv)},
    {t:'表示：'+styleName(), s:'石壁 ⇄ 線画', cls:'dim', fn:()=>{ toggleStyle(); title(); }}
  ]);
  S=null; refresh();
}
function resumeLabel(sv){
  const n=sv.party.length;
  const where = sv.floor>0 ? `${DUNGEONS[sv.dg].name}・地下${sv.floor}階` : '町';
  return `${n}人のパーティ・${where}`;
}
let newRules={};
function newGame(hadSave){
  newRules={spec:false, classes:false, mage:false};
  clearLog();
  head('新しい冒険');
  if(hadSave) bad('今の記録は、新しいパーティを登録した時点で上書きされる。');
  dm('使う追加ルールを選ぶ。選んだ内容はこの冒険の間ずっと有効になる（本体の Dungeon Delve と同じもの）。');
  RULE_DEFS.forEach(r=>log('dg',`<b>${r.name}</b>　${r.d}`));
  rulesMenu();
}
function rulesMenu(){
  acts(RULE_DEFS.map(r=>({t:(newRules[r.key]?'☑ ':'☐ ')+r.name, cls:newRules[r.key]?'pri':'', fn:()=>{ newRules[r.key]=!newRules[r.key]; rulesMenu(); }}))
    .concat([{t:'この設定で始める', s:'冒険者ギルドへ', cls:'pri', fn:startNewGame},
             {t:'戻る', cls:'dim', fn:title}]), '押すたびに切り替わる');
}
function startNewGame(){
  S={v:SAVE_VER, rules:{...newRules}, roster:[], party:[], gold:0, bag:[], torches:TORCH_STOCK-1, torchLeft:TORCH_TICKS,
     dg:0, seed:0, floor:0, x:0, y:0, face:0, px:-1, py:-1, ticks:0, levels:{}, cleared:[], shopStock:null, deepest:0};
  MODE='town';
  clearLog();
  head('辺境の町 ダスクホロウ');
  dm('酒場の暖炉が爆ぜている。壁の掲示板に、いくつもの穴の場所が貼り出されている。');
  sys('まずは冒険者ギルドで仲間を登録しよう。');
  guild();
}
function resume(sv){
  S=sv; hinted.clear(); CB=null; clearLog();
  S.roster.forEach(c=>{ c.para=0; c.cb=null; });
  if(!S.floor){ L=null; town(false); return; }
  L=unpackLevel(S.levels[S.floor]);
  MODE='dungeon';
  head(`${DG().name}　地下${S.floor}階`);
  sys('記録から再開した。');
  refresh(); dungeonActs();
}

/* ============================================================
   迷宮の中
   ============================================================ */
function enterDungeon(id){
  if(!living().length){ bad('動ける者がいない。'); return; }
  if(S.dg!==id || !S.seed){
    S.dg=id; S.levels={}; S.seed=((Date.now()*2654435761)^(Math.random()*4294967296))>>>0;
  }
  if(S.torchLeft<=0 && S.torches<=0){ bad('松明がない。道具屋で買ってから潜ろう。'); return; }
  if(S.torchLeft<=0){ S.torches--; S.torchLeft=TORCH_TICKS; }
  clearLog();
  head(DG().name);
  dm(DG().d);
  dm('松明に火を点け、入口の階段を下りていく。');
  enterFloor(1,'down');
}
function enterFloor(n, from){
  if(L && S.floor>0) S.levels[S.floor]=packLevel(L);
  S.floor=n;
  if(S.levels[n]) L=unpackLevel(S.levels[n]);
  else{
    L=genLevel(DG(), n, mixSeed(S.seed,n));
    populateLevel(L, DG(), n);
    srand((Date.now() ^ (Math.random()*4294967296))>>>0);   // 迷路の種のあとは、遊びの乱数を種から切り離す
  }
  const p = from==='up' ? L.down : L.up;
  S.x=p.x; S.y=p.y; S.px=p.x; S.py=p.y; S.face=openFacing(L,p.x,p.y);
  S.deepest=Math.max(S.deepest||0, n);
  MODE='dungeon';
  head(`${DG().name}　地下${n}階`);
  visit(true);
  save();
  refresh();
  if(MODE==='dungeon') dungeonActs();
}
function descend(){
  if(!onDown()) return;
  dm('階段を下りる。空気がひやりと重くなった。');
  if(tick(1)) return;
  enterFloor(S.floor+1,'down');
}
function ascend(){
  if(!onUp()) return;
  if(S.floor===1){
    S.levels[1]=packLevel(L); L=null; S.floor=0;
    dm('階段を上りきると、冷たい夜気が肺に満ちた。星が出ている。');
    town(true);
    return;
  }
  dm('階段を上る。');
  if(tick(1)) return;
  enterFloor(S.floor-1,'up');
}

/* 時間を進める。松明が燃え、ターンが変わるたびに徘徊する敵の判定をする。
   敵が現れたら true を返す（呼び出し側はそこで止める） */
function tick(n, noWander){
  for(let i=0;i<n;i++){
    S.ticks++;
    if(S.torchLeft>0){
      S.torchLeft--;
      if(S.torchLeft===0){
        if(S.torches>0){ S.torches--; S.torchLeft=TORCH_TICKS; sys(`松明が燃え尽きた。新しい松明に火を移す（予備あと${S.torches}本）。`); }
        else bad('最後の松明が燃え尽きた。あたりは真の闇だ。');
      } else if(S.torchLeft===TICKS_PER_TURN && S.torches===0) bad('松明の火が細くなってきた。予備はもうない。');
    }
    if(S.ticks%TICKS_PER_TURN===0 && MODE==='dungeon'){
      if(!noWander && chance(1/6)){ wanderingMonster(); return true; }
      if(chance(1/6)) sys(pick(AMBIENT));
    }
  }
  return false;
}
function wanderingMonster(why){
  const m=pick(monsterPool(DG().diff, S.floor));
  bad(why || '通路の奥から、いくつもの足音が近づいてくる――');
  startCombat({groups:[{mid:m.id, cnt:encCount(m, DG(), partyLevel())}], room:-1});
}

/* そのマスに入ったときのこと：踏んだ記録、部屋の描写、番人との遭遇、隠し扉の気配 */
function visit(first){
  const i=S.y*L.w+S.x;
  if(L.seen[i]<2){ L.seen[i]=2; mapDirty=true; }
  const ri_=roomIndexAt(S.x,S.y), r=ri_>=0 ? L.rooms[ri_] : null;
  if(r && !r.seen){
    r.seen=true;
    const k=ROOM_KINDS.find(z=>z.k===r.k);
    head(k.n+`<span class="dim">　${r.w*10}×${r.h*10}フィート</span>`);
    dm(k.d);
    if(!r.foes || r.cleared){
      const cats=shuffle(Object.keys(DRESSING)).slice(0, chance(.4)?2:1);
      for(const c of cats) dm(pick(DRESSING[c]));
    }
    if(r.chest && !r.chest.opened) dm(r.chest.quality>=3 ? '奥に、鉄枷で幾重にも補強された大きな箱がある。' : '部屋の隅に古びた宝箱がある。');
    if(r.k==='spring') good('澄んだ泉が湧いている。ここなら安全に休めそうだ（キャンプ →「休む」）。');
  }
  /* 部屋の番人：部屋のどこに踏み込んでも、こちらに気づいて襲ってくる */
  if(r && r.foes && !r.cleared){
    const m=MONSTERS.find(x=>x.id===r.foes.mid);
    const groups=[];
    if(r.foes.boss){
      big_('― 気配が、一つ。ただし桁が違う ―');
      groups.push({mid:m.id, cnt:1, boss:true});
      const e=MONSTERS.find(x=>x.id===r.foes.escort);
      if(e && e.id!==m.id) groups.push({mid:e.id, cnt:Math.max(1,Math.floor(encCount(e,DG(),partyLevel())/2))});
    } else groups.push({mid:m.id, cnt:encCount(m, DG(), partyLevel())});
    startCombat({groups, room:ri_});
    return;
  }
  if(onDown()) dm('下へ続く階段がある。');
  if(onUp() && S.floor>1 && !first) dm('上へ続く階段がある。');
  if(chestHere() && !(r && !r.seen)) dm('足もとに宝箱がある。');
  /* 隠し扉のそばを通ると、ときどき違和感に気づく（エルフの勘のように） */
  for(let d=0;d<4;d++){
    if(edgeAt(L,S.x,S.y,d)!==E_SECRET) continue;
    const key=`${S.floor}:${S.x}:${S.y}:${d}`;
    if(hinted.has(key)) continue;
    if(chance(1/6)){ hinted.add(key); sys(`${relDir(d)}の壁の継ぎ目に、かすかな違和感がある……。`); }
  }
}
function big_(t){ log('big2',t); }

let stepCount=0;
function tryMove(dir, kind){
  const e=edgeAt(L,S.x,S.y,dir);
  if(!isPass(e)){ bump(dir); return; }
  S.px=S.x; S.py=S.y;
  S.x+=DX[dir]; S.y+=DY[dir];
  anim(kind);
  if(tick(1)) return;
  visit();
  if(MODE!=='dungeon') return;
  if(++stepCount%10===0) save();
  refresh(); dungeonActs();
}
let bumpTimer=0;
function bump(dir){
  anim('bump');
  clearTimeout(bumpTimer);
  const what = isDoor(edgeAt(L,S.x,S.y,dir)) ? '扉' : (lit() ? wallWord() : '何か固いもの');
  $ahead.innerHTML=`${relDir(dir)}は${what}だ。進めない。`;
  bumpTimer=setTimeout(()=>{ if(MODE==='dungeon') $ahead.innerHTML=aheadText(); }, 1100);
}
function act(k){
  if(MODE!=='dungeon' || campOpen) return;
  switch(k){
    case 'fw': tryMove(S.face,'fw'); break;
    case 'bk': tryMove((S.face+2)%4,'bk'); break;
    case 'sl': tryMove((S.face+3)%4,'sl'); break;
    case 'sr': tryMove((S.face+1)%4,'sr'); break;
    case 'tl': S.face=(S.face+3)%4; anim('tl'); refresh(); break;
    case 'tr': S.face=(S.face+1)%4; anim('tr'); refresh(); break;
  }
}
function dungeonActs(){
  campOpen=false;
  acts([
    onDown() && {t:'▼ 階段を下りる', s:`地下${S.floor+1}階へ`, cls:'pri', fn:descend},
    onUp()   && {t:'▲ 階段を上る', s:S.floor===1?'地上へ':`地下${S.floor-1}階へ`, cls:'pri', fn:ascend},
    chestHere() && {t:'宝箱を調べる', s:'罠・錠前', cls:'pri', fn:chestMenu},
    {t:'壁を調べる', s:'1ターン・隠し扉', fn:search},
    {t:'キャンプ', s:'休息・呪文・装備', cls:'dim', fn:camp}
  ]);
}
function search(){
  if(MODE!=='dungeon') return;
  if(tick(TICKS_PER_TURN)) return;
  const p = lit() ? 1/3 : 1/6;
  const found=[];
  for(let d=0;d<4;d++){
    if(edgeAt(L,S.x,S.y,d)===E_SECRET && chance(p)){ setEdge(L,S.x,S.y,d,E_FOUND); found.push(d); }
  }
  if(found.length){ for(const d of found) good(`${relDir(d)}（${DIRN[d]}）の壁に<b>隠し扉</b>を見つけた！`); }
  else dm('1ターン（10分）かけて、まわりの壁を叩いて調べた。何も見つからない。');
  save(); refresh(); dungeonActs();
}
function toggleStyle(){
  SET.style = SET.style==='wire' ? 'stone' : 'wire';
  saveSettings(); dirty=true;
}

/* ============================================================
   宝箱（罠を調べる → 外す → 錠を開ける → 開ける）
   シーフがいればシーフが、いなければ一番器用な者が手を出す
   ============================================================ */
function bestThief(kind){ return bestOf(living().filter(c=>canAct(c)), c=>thiefSkill(c,kind,S.bag)); }
function nimblest(){ return bestOf(living().filter(c=>canAct(c)), c=>c.abil.DEX); }
function strongest(){ return bestOf(living().filter(c=>canAct(c)), c=>c.abil.STR); }
function wisest(){ return bestOf(living().filter(c=>canAct(c)), c=>c.abil.WIS+wildSense(c)); }
function abilCheck(ch, stat, mod, label){
  const r=die(20), tgt=ch.abil[stat]+mod;
  const ok = r===1 ? true : (r===20 ? false : r<=tgt);
  rollLine(`${esc(ch.name)}：${label}`, `d20=<b>${r}</b> vs ${stat} ${ch.abil[stat]}${mod?(mod>0?'+'+mod:mod):''} = <b>${tgt}</b>`, ok);
  return ok;
}
function pctCheck(ch, target, label){
  const r=ri(1,100), ok=r<=target;
  rollLine(`${esc(ch.name)}：${label}`, `d100=<b>${r}</b> vs <b>${target}%</b>`, ok);
  return ok;
}
function chestMenu(){
  const c=chestHere(); if(!c) return dungeonActs();
  const th=bestThief('ft'), op=bestThief('ol');
  const knocker=living().find(ch=>canAct(ch) && ch.spells.includes('knock') && ch.slots[1]>0);
  acts([
    !c.checked && {t:'罠を調べる', s:th?`${th.name}（${thiefSkill(th,'ft',S.bag)}%）`:`${(wisest()||{}).name||''}（判断力・難）`, cls:'pri', fn:()=>{
      const who=th||wisest(); if(!who) return;
      if(tick(1,true)) return;
      c.checked=true;
      const ok = th ? pctCheck(th, thiefSkill(th,'ft',S.bag), '罠の発見') : abilCheck(who,'WIS',-4,'罠の発見（難）');
      if(ok){
        if(c.trapped){ c.trapFound=true; c.trap=c.trap||{...pick(TRAPS)}; bad(`錠前に罠が仕込まれている！ 「${c.trap.n}」`); }
        else good('罠はない。安全に開けられる。');
      } else dm('よく分からない。開けてみるしかないか……');
      refresh(); chestMenu();
    }},
    c.trapFound && !c.disarmed && {t:'罠を外す', s:th?`${th.name}（${thiefSkill(th,'ft',S.bag)}%）`:'敏捷・至難', cls:'dgr', fn:()=>{
      const who=th||nimblest(); if(!who) return;
      if(tick(1,true)) return;
      const ok = th ? pctCheck(th, thiefSkill(th,'ft',S.bag), '罠の解除') : abilCheck(who,'DEX',-6,'罠の解除（至難）');
      if(ok){ c.disarmed=true; c.trapped=false; good('罠を殺した。'); gainXP(25*Math.max(1,DG().diff),'宝箱の罠の解除'); }
      else { bad('しくじった！'); springTrap(c, who); c.trapped=false; }
      if(checkWipe()) return;
      refresh(); chestMenu();
    }},
    c.locked && {t:'鍵を開ける', s:op?`${op.name}（${thiefSkill(op,'ol',S.bag)}%）`:'敏捷・難', fn:()=>{
      const who=op||nimblest(); if(!who) return;
      if(tick(1,true)) return;
      const ok = op ? pctCheck(op, thiefSkill(op,'ol',S.bag), '鍵開け') : abilCheck(who,'DEX',-4,'鍵開け（難）');
      if(ok){ c.locked=false; good('かちり、と錠が落ちた。'); } else dm('歯が立たない。');
      refresh(); chestMenu();
    }},
    c.locked && {t:'こじ開ける', s:`${(strongest()||{}).name||''}（筋力）`, fn:()=>{
      const who=strongest(); if(!who) return;
      if(tick(1,true)) return;
      const r2=die(6), t=strOpenDoor(who.abil.STR), ok=r2<=t;
      rollLine(`${esc(who.name)}：力ずく`, `d6=<b>${r2}</b> vs <b>${t}</b>以下`, ok);
      if(ok){ c.locked=false; good('木が裂け、蓋が跳ね上がった。'); }
      else {
        dm('びくともしない。');
        if(c.trapped && !c.trapFound && chance(0.4)){ bad('衝撃で仕掛けが作動した！'); springTrap(c, who); c.trapped=false; if(checkWipe()) return; }
      }
      refresh(); chestMenu();
    }},
    c.locked && knocker && {t:'ノックを唱える', s:knocker.name, fn:()=>{
      knocker.slots[1]--; c.locked=false; good(`${esc(knocker.name)}『ノック』――錠前がひとりでに開いた。`); refresh(); chestMenu();
    }},
    !c.locked && {t:'宝箱を開ける', cls:'pri', fn:()=>openChest(c)},
    {t:'放っておく', cls:'dim', fn:dungeonActs}
  ], c.locked ? '錠がかかっている。' : '錠は開いている。');
}
function springTrap(c, who){
  const t=c.trap||{...pick(TRAPS)};
  c.trap=t;
  bad(`罠だ！ ${t.d}`);
  /* 毒ガスと炎は周りを巻き込む。それ以外は手を出した者だけ */
  const victims = (t.n==='毒ガスの噴出'||t.n==='炎の噴射'||t.n==='魔法のグリフ') ? living() : [who];
  victims.forEach(ch=>{
    const ok = t.save==='dex' ? dexSave(ch) : savingThrow(ch,t.save);
    const d=rollDmg(t.dmg);
    const n=Math.max(1, ok?Math.floor(d.total/2):d.total);
    rollLine(`${t.n} → ${esc(ch.name)}`, `${d.txt} = <b>${d.total}</b>${ok?'（半減）':''}`);
    hurt(ch,n,t.n);
    if(alive(ch) && t.poison && !ok){
      if(!savingThrow(ch,'ppd','毒')){ const p=rollDmg(t.poison); hurt(ch,p.total,'毒'); }
    }
  });
}
function openChest(c){
  if(c.trapped){ const who=bestThief('ft')||nimblest(); springTrap(c, who); c.trapped=false; if(checkWipe()) return; }
  c.opened=true;
  dm('蓋を持ち上げる。');
  const t=rollTreasure(DG().diff+S.floor-1, c.quality);
  giveTreasure(t);
  if(c.quality>=3) clearDungeonNote();
  save(); refresh(); dungeonActs();
}
function clearDungeonNote(){
  if(S.cleared.includes(S.dg)) return;
  S.cleared.push(S.dg);
  log('big2',`★ ${DG().name} 踏破 ★`);
  const bonus=DG().diff*200*PARTY_GOLD_MULT;
  S.gold+=bonus;
  good(`この迷宮の最も深い宝を手にした。踏破の報奨 ${bonus}gp（町のギルドから）。`);
  gainXP(Math.max(1,DG().diff)*500,'迷宮の踏破');
  sys('上り階段から地上へ戻ろう。');
}
/* 財宝を受け取る。金貨1枚＝1経験点を生きている全員で山分け（パーティ用に金貨は多め） */
function giveTreasure(t){
  const gold=Math.floor((t.gold||0)*PARTY_GOLD_MULT);
  let h='<b>■ 発見物</b><br>';
  if(gold>0){ S.gold+=gold; h+=`金貨 <b>${gold} gp</b><br>`; }
  (t.items||[]).forEach(i=>{ S.bag.push(i); h+=`${esc(i.name)}${i.d?` <span class="dim">― ${esc(i.d)}</span>`:''}<br>`; });
  if(!gold && !(t.items||[]).length) h+='空だった。';
  loot(h);
  if((t.items||[]).some(i=>['weapon','armor','shield','ring'].includes(i.kind))) sys('武具は、仲間の札を押して「装備」から身につけられる。');
  if(gold>0) gainXP(gold,'財宝（金貨1枚＝1経験点）');
}
/* 経験点は生きている全員で山分け。レベルは宿で休んだときに上がる */
function gainXP(n, why){
  const L_=living(); if(!L_.length || n<=0) return;
  const each=Math.max(1,Math.floor(n/L_.length));
  const ready=[];
  L_.forEach(c=>{ const was=xpNext(c)!==null && c.xp>=xpNext(c); c.xp+=each; if(!was && xpNext(c)!==null && c.xp>=xpNext(c)) ready.push(c.name); });
  sys(`経験点 ${n}（${why}）→ ${L_.length}人で山分けして 1人 +${each}`);
  if(ready.length) good(`${ready.map(esc).join('、')} は十分な経験を積んだ。宿で休めばレベルが上がる。`);
}

/* ============================================================
   ダメージ・判定（戦闘でも罠でも使う）
   ============================================================ */
function hurt(ch, n, src){
  if(!alive(ch)) return;
  ch.hp-=n;
  if(ch.hp<=0){
    ch.hp=0; ch.status='dead'; ch.para=0;
    bad(`${esc(ch.name)} は倒れた。${src?`（${esc(src)}）`:''}`);
    hurtFx();
  } else {
    log('hurt',`${esc(ch.name)} に ${n} ダメージ。（${ch.hp}/${ch.maxhp}）`);
    hurtFx();
  }
  renderParty();
}
function heal(ch, n){
  if(!alive(ch)) return;
  const b=ch.hp; ch.hp=Math.min(ch.maxhp, ch.hp+n);
  good(`${esc(ch.name)} のHPが ${ch.hp-b} 回復した。（${ch.hp}/${ch.maxhp}）`);
  renderParty();
}
function savingThrow(ch, kind, label){
  const t=saveTarget(ch,kind), r=die(20), ok=r>=t;
  rollLine(`${esc(ch.name)}：セーヴ（${label||SAVE_NAMES[kind]}）`, `d20=<b>${r}</b> vs 目標 <b>${t}</b>以上`, ok);
  return ok;
}
function dexSave(ch){
  const t=12+dexAC(ch.abil.DEX), r=die(20), ok=r>=t;
  rollLine(`${esc(ch.name)}：回避（敏捷）`, `d20=<b>${r}</b> vs 目標 <b>${t}</b>以上`, ok);
  return ok;
}
let hurtT=0;
function hurtFx(){ hurtT=performance.now(); dirty=true; }
/* 全滅したら、通りかかった冒険者が亡骸を地上へ運んでくれる（謝礼に所持金の半分） */
function checkWipe(){
  if(living().length) return false;
  CB=null;
  log('big2','― 全滅 ―');
  dm('松明が転がり、ゆっくりと闇が広がっていく……');
  dm('どれほど経ったか。通りかかった冒険者の一行が、亡骸を地上まで運び上げてくれた。');
  const fee=Math.floor(S.gold/2);
  S.gold-=fee;
  if(fee) sys(`運び手への謝礼として ${fee}gp を支払った。`);
  sys('寺院で仲間を蘇らせるか、ギルドで新しい冒険者を雇おう。');
  party().forEach(c=>{ c.para=0; });
  if(L && S.floor>0) S.levels[S.floor]=packLevel(L);
  L=null; S.floor=0;
  MODE='town'; save();
  town(false, true);
  return true;
}

/* ---------- 動きの演出 ---------- */
const ANIMS={
  fw:[{transform:'scale(1.08)',opacity:.65},{transform:'scale(1)',opacity:1}],
  bk:[{transform:'scale(.93)',opacity:.65},{transform:'scale(1)',opacity:1}],
  tl:[{transform:'translateX(-8%)',opacity:.55},{transform:'none',opacity:1}],
  tr:[{transform:'translateX(8%)',opacity:.55},{transform:'none',opacity:1}],
  sl:[{transform:'translateX(-6%)',opacity:.7},{transform:'none',opacity:1}],
  sr:[{transform:'translateX(6%)',opacity:.7},{transform:'none',opacity:1}],
  bump:[{transform:'none'},{transform:'translateX(-7px)'},{transform:'translateX(6px)'},{transform:'translateX(-3px)'},{transform:'none'}]
};
function anim(k){
  if(!$view.animate) return;
  try{ $view.animate(ANIMS[k], {duration:k==='bump'?230:140, easing:'ease-out'}); }catch(e){}
}
