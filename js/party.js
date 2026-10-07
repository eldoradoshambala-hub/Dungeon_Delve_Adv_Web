"use strict";
/* ============================================================
   パーティ：冒険者の登録（ギルド）、能力値と職業、装備、隊列、キャンプ
   ============================================================ */
const MAX_PARTY=6, MAX_ROSTER=20;
const NAMES=['アルドリック','セラフィナ','ガルム','ミラベル','ソーン','ヴェスパー','ドラン','リィナ',
  'カエル','ブランドル','イルミナ','ゲイル','ロウェナ','ハーヴィク','ネリス','オズワルド',
  'ベルトラン','シグリッド','トーヴァ','エルリック','マーロウ','フィオナ','ラザール','ユーリア'];
function freshName(){
  const used=new Set((S?S.roster:[]).map(c=>c.name));
  const free=NAMES.filter(n=>!used.has(n));
  return pick(free.length?free:NAMES);
}
/* 今いる画面のメニュー。札を押して開いた冒険者の画面を閉じたとき、ここへ戻る */
let curMenu=null;
let campOpen=false;
function backToMenu(){
  if(MODE==='dungeon') return campOpen ? camp() : dungeonActs();
  (curMenu||townMenu)();
}

function newChar(name, cls, abil, spec){
  const C=CLASSES[cls];
  const hp=Math.max(1, C.hd + conHP(abil.CON, C.warrior));   // 1レベルのHPは最大値（本体と同じ）
  const ch={id:uid(), name, cls, lv:1, xp:0, abil, hp, maxhp:hp, status:'ok', para:0, cb:null,
    eq:{weapon:null, armor:null, shield:null, rings:[]},
    spells:[], slots:[], slotsMax:[], rules:{...S.rules}, spec:spec||null, layOnUsed:0, drained:0, relics:[]};
  const wk = spec || C.gear.weapon;
  if(wk) ch.eq.weapon=itPlainW(wk);
  if(C.gear.armor && C.gear.armor!=='none') ch.eq.armor=itPlainA(C.gear.armor);
  if(C.gear.shield) ch.eq.shield=itPlainS();
  learnSpellsUpTo(ch); rebuildSlots(ch); ch.slots=ch.slotsMax.slice();
  return ch;
}
function rollAbilities(cls){
  const vals=[], det=[];
  for(let i=0;i<6;i++){ const r=[die(6),die(6),die(6),die(6)].sort((a,b)=>b-a); vals.push(r[0]+r[1]+r[2]); det.push(r[0]+r[1]+r[2]); }
  vals.sort((a,b)=>b-a);
  const abil={}; CLASSES[cls].prio.forEach((k,i)=>{ abil[k]=vals[i]; });
  return {abil, det};
}
function register(ch){
  S.roster.push(ch);
  const purse=ri(40,120);
  S.gold+=purse;
  S.bag.push({uid:uid(),kind:'potion',eff:'heal',name:'ヒーリング・ポーション',val:120,d:'2d4+2 HP回復'});
  if(S.party.length<MAX_PARTY) S.party.push(ch.id);
  return purse;
}

/* ============================================================
   冒険者ギルド
   ============================================================ */
function guild(){
  MODE='town'; curMenu=guild;
  refresh();
  head('冒険者ギルド');
  const others=S.roster.filter(c=>!S.party.includes(c.id));
  if(!S.roster.length) dm('「登録はこちら。腕に覚えがあるなら、名前と生業を書いていきな」');
  else {
    let h='<b>■ 名簿</b><br>';
    S.roster.forEach(c=>{
      const inP=S.party.indexOf(c.id);
      h+=`${inP>=0?`<span class="tagp">${inP<3?'前列':'後列'}</span>`:'<span class="tagp off">待機</span>'} `+
         `${esc(c.name)}　${CLASSES[c.cls].name} Lv${c.lv}　HP ${c.hp}/${c.maxhp}`+
         `${c.status!=='ok'?` <span class="ng">［${STATUS_JA[c.status]}］</span>`:''}<br>`;
    });
    log('card',h);
  }
  acts([
    S.roster.length<MAX_ROSTER && {t:'新しく登録する', s:'職業を選び、能力値を振る', cls:S.party.length<MAX_PARTY?'pri':'', fn:()=>createStart()},
    S.party.length<MAX_PARTY && S.roster.length<MAX_ROSTER && {t:'おまかせで揃える', s:`${MAX_PARTY-S.party.length}人をまとめて登録`, fn:autoFill},
    S.party.length<MAX_PARTY && others.length && {t:'パーティに加える', s:`待機 ${others.length}人`, fn:()=>pickFrom(others,'誰を加える？',c=>{ S.party.push(c.id); good(`${esc(c.name)} がパーティに加わった。`); save(); guild(); })},
    S.party.length && {t:'パーティから外す', fn:()=>pickFrom(party(),'誰を外す？',c=>{ S.party=S.party.filter(id=>id!==c.id); dm(`${esc(c.name)} はギルドで待つことにした。`); save(); guild(); })},
    S.party.length>1 && {t:'隊列を変える', s:'前列3人・後列3人', fn:()=>formation(guild)},
    others.length && {t:'名簿から消す', cls:'dgr', fn:()=>pickFrom(others,'誰を名簿から消す？（取り消せない）',c=>{ S.roster=S.roster.filter(x=>x.id!==c.id); bad(`${esc(c.name)} は町を去った。`); save(); guild(); })},
    {t:'町へ出る', cls:S.party.length?'pri':'dim', dis:!S.party.length, fn:()=>town()}
  ], S.party.length ? `パーティ ${S.party.length}/${MAX_PARTY}人　所持金 ${S.gold}gp` : 'まずは冒険者を登録しよう。');
}
function pickFrom(list, q, cb){
  acts(list.map(c=>({t:esc(c.name), s:`${CLASSES[c.cls].name} Lv${c.lv}${c.status!=='ok'?'・'+STATUS_JA[c.status]:''}`, fn:()=>cb(c)}))
    .concat([{t:'やめる', cls:'dim', fn:backToMenu}]), q);
}
/* 足りない役割を順に埋める：戦士2・僧侶・盗賊・魔法使い・僧侶 */
const AUTO_PLAN=['fighter','fighter','cleric','thief','mage','cleric'];
function autoFill(){
  const have=party().map(c=>c.cls);
  const plan=AUTO_PLAN.slice();
  have.forEach(c=>{ const i=plan.indexOf(c); if(i>=0) plan.splice(i,1); });
  const made=[];
  while(S.party.length<MAX_PARTY && S.roster.length<MAX_ROSTER){
    const cls=plan.shift()||pick(['fighter','cleric','thief','mage']);
    const {abil}=rollAbilities(cls);
    const spec = S.rules.spec && CLASSES[cls].warrior ? CLASSES[cls].gear.weapon : null;
    const ch=newChar(freshName(), cls, abil, spec);
    register(ch); made.push(ch);
  }
  made.forEach(c=>good(`${esc(c.name)}（${CLASSES[c.cls].name}）を登録した。STR${c.abil.STR} DEX${c.abil.DEX} CON${c.abil.CON} INT${c.abil.INT} WIS${c.abil.WIS}　HP${c.maxhp}`));
  sys('登録した者には、それぞれの稼ぎから少しの金貨とヒーリング・ポーションを1本ずつ預かった。');
  save(); guild();
}

/* ---------- 一人ずつの登録 ---------- */
let tmp={};
function createStart(){
  tmp={};
  head('新しい冒険者');
  const list=Object.values(CLASSES).filter(C=>!C.extra || S.rules.classes);
  acts(list.map(C=>({t:C.name, s:`HP d${C.hd}・${C.prio[0]}重視${C.spell?C.spell==='arcane'?'・秘術':'・神術':''}`, fn:()=>{
    tmp.cls=C.id; dm(`<b>${C.name}</b> ― ${C.blurb}`); if(C.perk) sys('職業特性：'+C.perk);
    specStep();
  }})).concat([{t:'やめる', cls:'dim', fn:guild}]), '職業を選ぶ（パーティなら前列に戦士系、後列に呪文の使い手を）');
}
function specStep(){
  const C=CLASSES[tmp.cls];
  if(!S.rules.spec || !C.warrior){ tmp.spec=null; return rollStep(); }
  const usable=Object.keys(WEAPONS).filter(k=>WEAPONS[k].ok.includes(tmp.cls));
  acts(usable.map(k=>({t:WEAPONS[k].name, s:dmgTxt(WEAPONS[k].dmg), cls:k===C.gear.weapon?'pri':'', fn:()=>{ tmp.spec=k; dm(`${WEAPONS[k].name}を専門とする。`); rollStep(); }}))
    .concat([{t:'専門化しない', fn:()=>{ tmp.spec=null; rollStep(); }}]), '専門化する武器（Weapon Specialization）');
}
function rollStep(){
  const C=CLASSES[tmp.cls];
  const r=rollAbilities(tmp.cls);
  tmp.abil=r.abil;
  rollLine('能力値 4d6（最低値を除く）×6', r.det.sort((a,b)=>b-a).join('・')+` → ${C.name}の重要度順（${C.prio.join('→')}）に割り振る`);
  const a=r.abil;
  log('abil',['STR','DEX','CON','INT','WIS','CHA'].map(k=>`${k} <b>${a[k]}</b>`).join('　')+
    `　→　HP <b>${Math.max(1,C.hd+conHP(a.CON,C.warrior))}</b>`);
  acts([
    {t:'この能力値で決定', cls:'pri', fn:()=>{ dm('名を記せ。'); askName(freshName(), finishCreate, freshName); }},
    {t:'振り直す', fn:rollStep},
    {t:'職業を選び直す', cls:'dim', fn:createStart}
  ]);
}
function finishCreate(name){
  const ch=newChar(name, tmp.cls, tmp.abil, tmp.spec);
  const purse=register(ch);
  good(`${esc(ch.name)}（${CLASSES[ch.cls].name}）を登録した。${S.party.includes(ch.id)?'パーティに加わった。':'パーティは満員なので、ギルドで待機する。'}`);
  sys(`装備：${gearTxt(ch)}。持参金 ${purse}gp とヒーリング・ポーション1本を共有の荷物に入れた。`);
  save(); guild();
}
function gearTxt(ch){ return [curWeapon(ch).name, ch.eq.armor?ch.eq.armor.name:'鎧なし', ch.eq.shield?ch.eq.shield.name:null].filter(Boolean).join('、'); }

/* ============================================================
   冒険者の画面（パーティの札を押すと開く）
   ============================================================ */
function onPartyCard(id){
  if(MODE==='combat' || MODE==='title') return;
  const ch=byId(id); if(!ch) return;
  sheet(ch);
}
function sheet(ch){
  const C=CLASSES[ch.cls], w=curWeapon(ch), nx=xpNext(ch);
  let h=`<b class="nm">${esc(ch.name)}</b>　${C.name} レベル${ch.lv}${ch.status!=='ok'?`　<span class="ng">［${STATUS_JA[ch.status]}］</span>`:''}<br>`;
  h+=`HP ${ch.hp}/${ch.maxhp}　AC ${AC(ch)}　THAC0 ${THAC0(ch)}　経験点 ${ch.xp}${nx?` / ${nx}${ch.xp>=nx?' <span class="ok">（宿でレベルアップ）</span>':''}`:''}<br>`;
  h+=`<span class="dim">能力値</span> `+['STR','DEX','CON','INT','WIS','CHA'].map(k=>`${k} ${ch.abil[k]}`).join('　')+'<br>';
  h+=`<span class="dim">武器</span> ${esc(w.name)} ${dmgTxt(w.base.dmg)}（命中${hitBonus(ch)>=0?'+':''}${hitBonus(ch)}／ダメージ${dmgBonus(ch)>=0?'+':''}${dmgBonus(ch)}${attackRate(ch)[0]/attackRate(ch)[1]>1?`・${attackRateTxt(ch)}`:''}）<br>`;
  h+=`<span class="dim">防具</span> ${ch.eq.armor?esc(ch.eq.armor.name):'鎧なし'}${ch.eq.shield?'、'+esc(ch.eq.shield.name):''}${ch.eq.rings.map(r=>'、'+esc(r.name)).join('')}<br>`;
  h+=`<span class="dim">セーヴ</span> `+Object.keys(SAVE_NAMES).map(k=>`${SAVE_NAMES[k].split('/')[0]} ${saveTarget(ch,k)}`).join('　')+'<br>';
  const sk={ol:'鍵開け',ft:'罠',ms:'隠密',hs:'隠れる',hn:'聞き耳'};
  const has=Object.keys(sk).filter(k=>thiefSkill(ch,k,S.bag)!==null);
  if(has.length) h+=`<span class="dim">技能</span> `+has.map(k=>`${sk[k]} ${thiefSkill(ch,k,S.bag)}%`).join('　')+'<br>';
  if(ch.slotsMax.length){
    h+=`<span class="dim">呪文</span> `+ch.slotsMax.map((m,i)=>`第${i+1}Lv ${ch.slots[i]||0}/${m}`).join('　')+'<br>';
    h+=`<span class="dim">修得</span> `+ch.spells.map(s=>SPELLS[s].name).join('、')+'<br>';
  }
  if(C.perk) h+=`<span class="dim">特性</span> ${esc(C.perk)}<br>`;
  log('card',h);
  const idx=S.party.indexOf(ch.id);
  const cures=campCures(ch);
  acts([
    alive(ch) && {t:'装備', s:'武器・鎧・盾・指輪', cls:'pri', fn:()=>equipMenu(ch)},
    alive(ch) && cures.length && {t:'癒しの呪文', s:cures.map(s=>SPELLS[s].name.slice(0,6)).join('・'), fn:()=>campCast(ch)},
    alive(ch) && S.bag.some(i=>i.kind==='potion') && {t:'薬を飲む', fn:()=>potionMenu(ch)},
    alive(ch) && CLASSES[ch.cls].layOn && layOnLeft(ch)>0 && {t:'癒しの手', s:`${ch.lv*2}HP`, fn:()=>allyPickOut('誰を癒す？',a=>{ ch.layOnUsed=(Number(ch.layOnUsed)||0)+1; heal(a,ch.lv*2); save(); sheet(ch); })},
    idx>0 && {t:'隊列で前へ', fn:()=>{ swapParty(idx,idx-1); sheet(ch); }},
    idx>=0 && idx<S.party.length-1 && {t:'隊列で後ろへ', fn:()=>{ swapParty(idx,idx+1); sheet(ch); }},
    {t:'閉じる', cls:'dim', fn:backToMenu}
  ]);
}
function swapParty(a,b){ const p=S.party; [p[a],p[b]]=[p[b],p[a]]; save(); refresh(); }
function formation(back){
  acts(party().map((c,i)=>({t:`${i+1}. ${esc(c.name)}`, s:`${i<3?'前列':'後列'}・${CLASSES[c.cls].name}`, fn:()=>{
    acts(party().map((d,j)=>j===i?null:{t:`${j+1}. ${esc(d.name)}`, s:'と入れ替える', fn:()=>{ swapParty(i,j); formation(back); }})
      .concat([{t:'やめる', cls:'dim', fn:()=>formation(back)}]), `${esc(c.name)} を誰と入れ替える？`);
  }})).concat([{t:'決定', cls:'pri', fn:back}]), '入れ替える冒険者を選ぶ（1〜3番が前列）');
}

/* ---------- 装備 ---------- */
const SLOT_JA={weapon:'武器',armor:'鎧',shield:'盾'};
function equipMenu(ch){
  const slots=['weapon','armor'].concat(NO_SHIELD.includes(ch.cls)?[]:['shield']);
  acts(slots.map(k=>{
    const cur=ch.eq[k], cand=S.bag.filter(i=>i.kind===k && canUse(ch.cls,i));
    return {t:`${SLOT_JA[k]}：${cur?esc(cur.name):'なし'}`, s:cand.length?`荷物に${cand.length}品`:'替えはない', fn:()=>slotMenu(ch,k)};
  }).concat([
    {t:`指輪：${ch.eq.rings.length?ch.eq.rings.map(r=>esc(r.name)).join('・'):'なし'}`, s:`荷物に${S.bag.filter(i=>i.kind==='ring').length}品`, fn:()=>ringMenu(ch)},
    {t:'戻る', cls:'dim', fn:()=>sheet(ch)}
  ]), `${esc(ch.name)} の装備（AC ${AC(ch)}）`);
}
function slotMenu(ch,k){
  const cur=ch.eq[k], cand=S.bag.filter(i=>i.kind===k);
  acts(cand.map(it=>{
    const ok=canUse(ch.cls,it);
    return {t:esc(it.name), s:ok?(it.d||''):'この職業は扱えない', dis:!ok, fn:()=>{
      S.bag=S.bag.filter(x=>x!==it);
      if(cur) S.bag.push(cur);
      ch.eq[k]=it;
      good(`${esc(ch.name)} は ${esc(it.name)} を身につけた。（AC ${AC(ch)}）`);
      save(); refresh(); equipMenu(ch);
    }};
  }).concat([
    cur && {t:'外す', s:esc(cur.name)+' を荷物へ', fn:()=>{ S.bag.push(cur); ch.eq[k]=null; dm(`${esc(ch.name)} は ${esc(cur.name)} を外した。`); save(); refresh(); equipMenu(ch); }},
    {t:'戻る', cls:'dim', fn:()=>equipMenu(ch)}
  ]), `${SLOT_JA[k]}を選ぶ`);
}
function ringMenu(ch){
  const cand=S.bag.filter(i=>i.kind==='ring');
  acts(cand.map(it=>({t:esc(it.name), s:it.d||'', dis:ch.eq.rings.length>=2, fn:()=>{
    S.bag=S.bag.filter(x=>x!==it); ch.eq.rings.push(it); good(`${esc(ch.name)} は ${esc(it.name)} をはめた。`); save(); refresh(); ringMenu(ch);
  }})).concat(ch.eq.rings.map(r=>({t:`外す：${esc(r.name)}`, fn:()=>{ ch.eq.rings=ch.eq.rings.filter(x=>x!==r); S.bag.push(r); save(); refresh(); ringMenu(ch); }})))
    .concat([{t:'戻る', cls:'dim', fn:()=>equipMenu(ch)}]), '指輪は2つまで');
}

/* ---------- 戦闘の外での呪文と薬 ---------- */
const CAMP_CURES=['curelight','cureserious','curecritical','healsp'];
function campCures(ch){ return ch.spells.filter(s=>CAMP_CURES.includes(s) && ch.slots[SPELLS[s].lv-1]>0); }
function campCast(ch){
  const list=campCures(ch);
  acts(list.map(s=>({t:SPELLS[s].name, s:`第${SPELLS[s].lv}Lv（残${ch.slots[SPELLS[s].lv-1]}）`, fn:()=>{
    allyPickOut('誰を癒す？', a=>{
      ch.slots[SPELLS[s].lv-1]--;
      log('act',`${esc(ch.name)} は『${SPELLS[s].name}』を唱えた。`);
      const R={curelight:[1,8], cureserious:[2,8,1], curecritical:[3,8,3]}[s];
      heal(a, R ? rollDmg(R).total : a.maxhp-a.hp);
      save(); campCures(ch).length ? campCast(ch) : sheet(ch);
    });
  }})).concat([{t:'戻る', cls:'dim', fn:()=>sheet(ch)}]), `${esc(ch.name)}：どの呪文を？`);
}
function potionMenu(ch){
  const list=S.bag.filter(i=>i.kind==='potion' && (i.eff==='heal'||i.eff==='exheal'));
  acts(list.map(it=>({t:esc(it.name), s:it.d, fn:()=>{
    S.bag=S.bag.filter(x=>x!==it);
    log('act',`${esc(ch.name)} は ${esc(it.name)} を飲み干した。`);
    heal(ch, rollDmg(it.eff==='heal'?[2,4,2]:[3,8,3]).total);
    save(); sheet(ch);
  }})).concat([{t:'戻る', cls:'dim', fn:()=>sheet(ch)}]), '戦闘の外で効くのは傷薬だけ');
}
function allyPickOut(q, cb){
  acts(living().map(a=>({t:esc(a.name), s:`HP ${a.hp}/${a.maxhp}`, fn:()=>cb(a)})).concat([{t:'やめる', cls:'dim', fn:backToMenu}]), q);
}

/* ============================================================
   キャンプ（迷宮の中）
   ============================================================ */
function camp(){
  if(MODE!=='dungeon') return;
  campOpen=true; curMenu=camp;
  const r=roomAt(S.x,S.y), spring=r && r.k==='spring' && !r.usedSpring;
  acts([
    {t:'休む', s:spring?'泉のほとり：安全に全快':'1時間・HPと呪文が戻る・襲われることも', cls:'pri', fn:rest},
    {t:'隊列を変える', fn:()=>formation(camp)},
    {t:'仲間を見る', s:'装備・呪文・薬', fn:()=>pickFrom(party(),'誰の画面を開く？',sheet)},
    {t:'表示：'+styleName(), s:'石壁 ⇄ 線画', fn:()=>{ toggleStyle(); camp(); }},
    {t:'記録してタイトルへ', cls:'dim', fn:()=>{ save(); title(); }},
    {t:'キャンプを畳む', cls:'dim', fn:dungeonActs}
  ], 'キャンプを張った。歩き出すまで時間は進まない。');
}
function rest(){
  const r=roomAt(S.x,S.y), spring=r && r.k==='spring' && !r.usedSpring;
  if(spring){
    r.usedSpring=true;
    dm('澄んだ水で傷を洗うと、痛みが嘘のように引いていった。');
    tick(6*TICKS_PER_TURN, true);
    living().forEach(ch=>{ ch.hp=ch.maxhp; ch.slots=ch.slotsMax.slice(); ch.layOnUsed=0; });
    good('全員のHPと呪文がすべて戻った。泉の力はもう尽きた。');
    save(); refresh(); return camp();
  }
  dm('壁を背に交代で見張りを立て、しばし休む。');
  const roll=die(6);
  rollLine('休息中の遭遇判定', `d6=<b>${roll}</b>（1で遭遇）`, roll>1, ['異常なし','遭遇！']);
  if(tick(6*TICKS_PER_TURN, true)) return;
  if(roll===1){ campOpen=false; return wanderingMonster('見張りが叫んだ。休んでいるところを襲われた！'); }
  living().forEach(ch=>{
    const h=rollDmg([1,8,ch.lv]).total;
    ch.hp=Math.min(ch.maxhp, ch.hp+h);
    ch.slots=ch.slotsMax.slice(); ch.layOnUsed=0;
  });
  good('1時間休んだ。全員のHPが少し戻り（1d8＋レベル）、呪文を記憶し直した。');
  save(); refresh(); camp();
}
