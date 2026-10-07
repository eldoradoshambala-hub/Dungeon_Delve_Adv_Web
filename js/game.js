"use strict";
/* ============================================================
   冒険の状態と進行（第1段階：迷宮の探索のみ）

   時間は AD&D の「ターン」（10分）で数える。
   探索しながらの移動は1ターンに120フィート＝12マス、壁を調べるのは1ターン、
   松明1本は6ターン（1時間）で燃え尽きる。
   ============================================================ */
/* 本体（Dungeon Delve）と同じドメイン・同じ file:// で開いてもセーブが混ざらないよう、名前を分ける */
const SAVEKEY='ddadv.save.auto', SETKEY='ddadv.settings';
const TICKS_PER_TURN=12;
const TORCH_TICKS=6*TICKS_PER_TURN;
const TORCHES_START=6;

let S=null;          // 冒険の状態（そのままセーブする）
let L=null;          // 今いる階（S.levels[S.floor] を展開したもの）
let MODE='title';    // 'title' | 'choose' | 'dungeon' | 'surface'
let SET={style:'stone'};
let previewDg=0;     // タイトル・迷宮選びの背景に出す迷宮
const hinted=new Set();

const $=id=>document.getElementById(id);
const $log=$('log'), $logwrap=$('logwrap'), $acts=$('acts'), $chips=$('chips'), $status=$('status'),
      $view=$('view'), $map=$('map'), $compass=$('compass'), $ahead=$('ahead');

/* ---------- 記録欄 ---------- */
function log(cls, html){
  const p=document.createElement('p'); p.className='l '+cls; p.innerHTML=html;
  $log.appendChild(p);
  while($log.childNodes.length>240) $log.removeChild($log.firstChild);
  $logwrap.scrollTop=$logwrap.scrollHeight;
  return p;
}
const dm=t=>log('dm',t), sys=t=>log('sys',t), good=t=>log('good',t), bad=t=>log('bad',t), head=t=>log('head',t);
function clearLog(){ $log.innerHTML=''; }

function acts(list){
  $acts.innerHTML='';
  for(const a of list){
    if(!a) continue;
    const b=document.createElement('button');
    b.type='button'; b.className='btn '+(a.cls||'');
    b.innerHTML=a.t+(a.s?`<small>${a.s}</small>`:'');
    if(a.dis) b.disabled=true;
    b.onclick=a.fn;
    $acts.appendChild(b);
  }
}

/* ---------- 設定・セーブ ---------- */
function loadSettings(){ try{ Object.assign(SET, JSON.parse(localStorage.getItem(SETKEY)||'{}')); }catch(e){} }
function saveSettings(){ try{ localStorage.setItem(SETKEY, JSON.stringify(SET)); }catch(e){} }
function save(){
  if(!S) return;
  try{
    if(L && S.floor>0) S.levels[S.floor]=packLevel(L);
    localStorage.setItem(SAVEKEY, JSON.stringify(S));
  }catch(e){}
}
function loadSave(){ try{ const j=localStorage.getItem(SAVEKEY); return j?JSON.parse(j):null; }catch(e){ return null; } }

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
function onDown(){ return L && L.down && L.down.x===S.x && L.down.y===S.y; }
function onUp(){ return L && L.up && L.up.x===S.x && L.up.y===S.y; }

/* ============================================================
   画面の描き直し（眺めは requestAnimationFrame で。松明の揺らぎのため少しずつ描き直す）
   ============================================================ */
let dirty=true, mapDirty=true, lastDraw=0;
const demoCache={};
function demoLevel(id){
  if(demoCache[id]) return demoCache[id];
  const save_=_seed;
  const D=genLevel(DUNGEONS[id], 1, 4242+id*77);
  _seed=save_;
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
  if(MODE==='dungeon' && L){
    const lt=lightOf();
    const seen=renderView(ctx,W,H,L,S.x,S.y,S.face,{style:SET.style, theme:THEMES[S.dg], R:lt.R, I:lt.I, flick:lit()&&SET.style==='stone'?flick(now):1});
    for(const [x,y] of seen){ const i=y*L.w+x; if(!L.seen[i]){ L.seen[i]=1; mapDirty=true; } }
  } else if(MODE==='surface'){
    renderSurface(ctx,W,H,now);
  } else {
    const D=demoLevel(previewDg);
    renderView(ctx,W,H,D.L,D.p.x,D.p.y,D.p.f,{style:SET.style, theme:THEMES[previewDg], R:3.6, I:1, flick:SET.style==='stone'?flick(now):1});
  }
}
function drawMap(){
  if(!sizeCanvas($map)) return;
  if(MODE==='surface' && S && S.levels[1]){
    /* 地上では地下1階の地図を眺められる（現在地の矢印はなし） */
    renderMap($map.getContext('2d'), $map.width, $map.height, unpackLevel(S.levels[1]), -1, -1, 0);
    return;
  }
  if(!(MODE==='dungeon' && L)){ renderBlankMap($map.getContext('2d'), $map.width, $map.height); return; }
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
  const inD = MODE==='dungeon';
  document.body.classList.toggle('in-dungeon', inD);
  if(!inD){
    document.body.classList.remove('panel-map');
    $('tabMap').classList.remove('on'); $('tabMap').textContent='地図';
  }
  $compass.textContent = inD ? DIRN[S.face] : '';
  $ahead.innerHTML = inD ? aheadText() : '';
  if(inD){
    const tl=S.torchLeft;
    $chips.innerHTML=
      `<span class="chip">地下<b>${S.floor}</b>階</span>`+
      `<span class="chip"><b>${DIRN[S.face]}</b>向き</span>`+
      `<span class="chip ${tl<=TICKS_PER_TURN?'warn':''}">松明 <b>${tl>0?timeStr(tl):'なし'}</b>${tl>0?`＋${S.torches}本`:''}</span>`;
    statusPanel();
    dungeonActs();
  } else {
    $chips.innerHTML = MODE==='surface' ? `<span class="chip"><b>地上</b></span>` : '';
    guidePanel();
  }
  /* 操作盤の出し入れで記録欄の高さが変わるので、描き直したあとで末尾へ送る（迷宮選びは先頭のまま） */
  if(MODE!=='choose') requestAnimationFrame(()=>{ $logwrap.scrollTop=$logwrap.scrollHeight; });
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
  return t;
}
function statusPanel(){
  const dg=DUNGEONS[S.dg], tl=S.torchLeft;
  $status.innerHTML=
    `<h3>探索</h3>`+
    `<div class="kv"><span>迷宮</span><span>${dg.name}</span></div>`+
    `<div class="kv"><span>現在</span><span>地下${S.floor}階／全${dg.floors}階</span></div>`+
    `<div class="kv"><span>向き</span><span>${DIRN[S.face]}</span></div>`+
    `<div class="kv"><span>潜ってから</span><span>${timeStr(S.ticks)}（${Math.floor(S.ticks/TICKS_PER_TURN)}ターン）</span></div>`+
    `<h3>明かり</h3>`+
    `<div class="kv"><span>松明</span><span>${tl>0?'灯している1本':'なし'}＋予備${S.torches}本</span></div>`+
    `<div class="bar"><i style="width:${Math.round(100*tl/TORCH_TICKS)}%"></i></div>`+
    `<div class="kv"><span>燃え尽きるまで</span><span>${tl>0?timeStr(tl):'―'}</span></div>`+
    keysHtml();
}
function keysHtml(){
  return `<h3 class="pc-only">操作</h3>`+
    `<div class="keys pc-only">`+
      `<span><kbd>↑</kbd> <kbd>W</kbd></span><span>進む</span>`+
      `<span><kbd>↓</kbd> <kbd>S</kbd></span><span>下がる</span>`+
      `<span><kbd>←</kbd> <kbd>→</kbd></span><span>向きを変える（<kbd>A</kbd> <kbd>D</kbd> も）</span>`+
      `<span><kbd>Q</kbd> <kbd>E</kbd></span><span>横へ1歩</span>`+
      `<span><kbd>F</kbd></span><span>壁を調べる（隠し扉）</span>`+
      `<span><kbd>Enter</kbd></span><span>階段を使う</span>`+
      `<span><kbd>V</kbd></span><span>表示を切り替える（石壁／線画）</span>`+
    `</div>`+
    `<p class="note">眺めを指でなでても動けます（上へ：進む／左右：向きを変える）。</p>`;
}
function guidePanel(){
  $status.innerHTML=
    `<h3>この試作版でできること</h3>`+
    `<p class="note" style="margin-top:0">方眼の迷宮を一人称で歩き、地図を埋め、階段を下りて最深部を目指します。`+
    `時間は10分＝1ターンで流れ、松明は1時間で燃え尽きます。壁を調べれば隠し扉が見つかることも。</p>`+
    keysHtml();
}
function dungeonActs(){
  acts([
    onDown() && {t:'▼ 階段を下りる', s:`地下${S.floor+1}階へ`, cls:'pri', fn:descend},
    onUp()   && {t:'▲ 階段を上る', s:S.floor===1?'地上へ':`地下${S.floor-1}階へ`, cls:'pri', fn:ascend},
    {t:'壁を調べる', s:'1ターン・隠し扉を探す', fn:search},
    {t:'メニュー', s:'表示・記録', cls:'dim', fn:menu}
  ]);
}

/* ============================================================
   タイトル・迷宮選び・地上
   ============================================================ */
function title(){
  MODE='title'; previewDg=0; L=null;
  clearLog();
  log('big','DUNGEON DELVE');
  log('sub','ADVANCED ― 古典TRPG（AD&amp;D）風 一人称ダンジョン探索');
  dm('松明の明かりが届くのは、せいぜい三十フィート先まで。その向こうには、まだ誰も地図に描いていない闇がある。');
  sys('【試作版・第1段階】方眼の迷宮を歩いて探索できます。パーティ・戦闘・宝物は次の段階で加えます。');
  const sv=loadSave();
  acts([
    sv && {t:'続きから', s:`${DUNGEONS[sv.dg].name}・${sv.floor?`地下${sv.floor}階`:'地上'}`, cls:'pri', fn:()=>resume(sv)},
    {t:'新しい冒険', s:'迷宮を選ぶ', cls:sv?'':'pri', fn:choose},
    {t:'表示：'+styleName(), s:'石壁 ⇄ 線画', cls:'dim', fn:()=>{ toggleStyle(); title(); }}
  ]);
  refresh();
}

function choose(){
  MODE='choose';
  clearLog();
  head('どの迷宮に挑む？');
  if(loadSave()) sys('新しい冒険を始めると、今の記録は上書きされます。');
  const list=DUNGEONS.slice().sort((a,b)=>a.diff-b.diff);
  for(const dg of list){
    const p=log('dg','');
    const b=document.createElement('button');
    b.type='button'; b.className='btn dgn';
    const stars='★'.repeat(Math.max(1,Math.ceil(dg.diff/2)))+'☆'.repeat(5-Math.max(1,Math.ceil(dg.diff/2)));
    b.innerHTML=`<b>${dg.name}</b>　<span class="st">${stars}</span><small>地下${dg.floors}階まで・推奨レベル${dg.rec}　${dg.d}</small>`;
    b.onclick=()=>newAdventure(dg.id);
    const pv=()=>{ if(previewDg!==dg.id){ previewDg=dg.id; dirty=true; } };
    b.onmouseenter=pv; b.onfocus=pv; b.addEventListener('touchstart',pv,{passive:true});
    p.className='l'; p.appendChild(b);
  }
  $logwrap.scrollTop=0;
  acts([{t:'戻る', cls:'dim', fn:title}]);
  refresh();
}

function newAdventure(id){
  const dg=DUNGEONS[id];
  S={v:1, dg:id, seed:((Date.now()*2654435761)^(Math.random()*4294967296))>>>0,
     floor:0, x:0, y:0, face:0, ticks:0, torches:TORCHES_START-1, torchLeft:TORCH_TICKS, levels:{}, deepest:0};
  L=null; hinted.clear();
  clearLog();
  head(dg.name);
  dm(dg.d);
  dm('松明に火を点け、入口の階段を下りていく。');
  enterFloor(1,'down');
}

function resume(sv){
  S=sv; hinted.clear(); clearLog();
  if(!S.floor){ L=null; MODE='surface'; surfaceScreen(false); return; }
  L=unpackLevel(S.levels[S.floor]);
  MODE='dungeon';
  head(`${DUNGEONS[S.dg].name}　地下${S.floor}階`);
  sys('記録から再開した。');
  refresh();
}

function surfaceScreen(arrived){
  MODE='surface';
  if(arrived){
    head('地上');
    dm('階段を上りきると、冷たい夜気が肺に満ちた。星が出ている。');
    S.torches=TORCHES_START-1; S.torchLeft=TORCH_TICKS;
    sys(`村の雑貨屋で松明を買い足した（${TORCHES_START}本）。潜っていた時間：${timeStr(S.ticks)}。`);
  } else {
    head('地上');
    dm(`${DUNGEONS[S.dg].name}の入口に立っている。`);
  }
  acts([
    {t:'迷宮へ戻る', s:'地下1階から', cls:'pri', fn:()=>{ dm('ふたたび闇へ下りていく。'); enterFloor(1,'down'); }},
    {t:'別の迷宮へ', s:'今の迷宮の地図は失われる', fn:choose},
    {t:'記録してタイトルへ', cls:'dim', fn:()=>{ save(); title(); }}
  ]);
  save();
  refresh();
}

/* ============================================================
   迷宮の中
   ============================================================ */
function enterFloor(n, from){
  if(L && S.floor>0) S.levels[S.floor]=packLevel(L);
  S.floor=n;
  if(S.levels[n]) L=unpackLevel(S.levels[n]);
  else{
    L=genLevel(DUNGEONS[S.dg], n, mixSeed(S.seed,n));
    srand((Date.now() ^ (Math.random()*4294967296))>>>0);   // 迷路の種のあとは、遊びの乱数を種から切り離す
  }
  const p = from==='up' ? L.down : L.up;
  S.x=p.x; S.y=p.y; S.face=openFacing(L,p.x,p.y);
  S.deepest=Math.max(S.deepest||0, n);
  MODE='dungeon';
  head(`${DUNGEONS[S.dg].name}　地下${n}階`);
  visit();
  save();
  refresh();
}

function descend(){
  if(!onDown()) return;
  dm('階段を下りる。空気がひやりと重くなった。');
  tick(1);
  enterFloor(S.floor+1,'down');
}
function ascend(){
  if(!onUp()) return;
  if(S.floor===1){
    S.levels[1]=packLevel(L); L=null; S.floor=0;
    surfaceScreen(true);
    return;
  }
  dm('階段を上る。');
  tick(1);
  enterFloor(S.floor-1,'up');
}

/* 時間を進める。松明が燃え、ターンが変わるたびに遠くの物音を判定する */
function tick(n){
  for(let i=0;i<n;i++){
    S.ticks++;
    if(S.torchLeft>0){
      S.torchLeft--;
      if(S.torchLeft===0){
        if(S.torches>0){ S.torches--; S.torchLeft=TORCH_TICKS; sys(`松明が燃え尽きた。新しい松明に火を移す（予備あと${S.torches}本）。`); }
        else bad('最後の松明が燃え尽きた。あたりは真の闇だ。');
      } else if(S.torchLeft===TICKS_PER_TURN && S.torches===0) bad('松明の火が細くなってきた。予備はもうない。');
    }
    if(S.ticks%TICKS_PER_TURN===0 && MODE==='dungeon' && chance(1/6)) sys(pick(AMBIENT));
  }
}

/* そのマスに入ったときのこと：踏んだ記録、部屋の描写、隠し扉の気配 */
function visit(){
  const i=S.y*L.w+S.x;
  if(L.seen[i]<2){ L.seen[i]=2; mapDirty=true; }
  const r=roomAt(S.x,S.y);
  if(r && !r.seen){
    r.seen=true;
    const k=ROOM_KINDS.find(z=>z.k===r.k);
    head(k.n+`<span style="color:var(--dim);font-weight:400;font-size:12px">　${r.w*10}×${r.h*10}フィート</span>`);
    dm(k.d);
    const cats=shuffle(Object.keys(DRESSING)).slice(0, chance(.4)?2:1);
    for(const c of cats) dm(pick(DRESSING[c]));
    if(L.goal>=0 && L.rooms[L.goal]===r){
      good('ここが、この迷宮の最も深い場所らしい。');
      sys('【試作版】ここには守り手と宝物を置く予定です（次の段階で実装）。');
    }
  }
  if(onDown()) dm('下へ続く階段がある。');
  if(onUp() && S.floor>1) dm('上へ続く階段がある。');
  /* 隠し扉のそばを通ると、ときどき違和感に気づく（エルフの勘のように） */
  for(let d=0;d<4;d++){
    if(edgeAt(L,S.x,S.y,d)!==E_SECRET) continue;
    const key=`${S.floor}:${S.x}:${S.y}:${d}`;
    if(hinted.has(key)) continue;
    if(chance(1/6)){ hinted.add(key); sys(`${relDir(d)}の壁の継ぎ目に、かすかな違和感がある……。`); }
  }
}

let stepCount=0;
function tryMove(dir, kind){
  const e=edgeAt(L,S.x,S.y,dir);
  if(!isPass(e)){ bump(dir); return; }
  S.x+=DX[dir]; S.y+=DY[dir];
  anim(kind);
  tick(1);
  visit();
  if(++stepCount%10===0) save();
  refresh();
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
  if(MODE!=='dungeon') return;
  switch(k){
    case 'fw': tryMove(S.face,'fw'); break;
    case 'bk': tryMove((S.face+2)%4,'bk'); break;
    case 'sl': tryMove((S.face+3)%4,'sl'); break;
    case 'sr': tryMove((S.face+1)%4,'sr'); break;
    case 'tl': S.face=(S.face+3)%4; anim('tl'); refresh(); break;
    case 'tr': S.face=(S.face+1)%4; anim('tr'); refresh(); break;
  }
}

function search(){
  if(MODE!=='dungeon') return;
  tick(TICKS_PER_TURN);
  const p = lit() ? 1/3 : 1/6;
  const found=[];
  for(let d=0;d<4;d++){
    if(edgeAt(L,S.x,S.y,d)===E_SECRET && chance(p)){ setEdge(L,S.x,S.y,d,E_FOUND); found.push(d); }
  }
  if(found.length){
    for(const d of found) good(`${relDir(d)}（${DIRN[d]}）の壁に<b>隠し扉</b>を見つけた！`);
  } else dm('1ターン（10分）かけて、まわりの壁を叩いて調べた。何も見つからない。');
  save();
  refresh();
}

function menu(){
  acts([
    {t:'表示：'+styleName(), s:'石壁 ⇄ 線画', fn:()=>{ toggleStyle(); menu(); }},
    {t:'記録してタイトルへ', fn:()=>{ save(); title(); }},
    {t:'戻る', cls:'pri', fn:dungeonActs}
  ]);
}

function toggleStyle(){
  SET.style = SET.style==='wire' ? 'stone' : 'wire';
  saveSettings(); dirty=true;
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
