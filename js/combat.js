"use strict";
/* ============================================================
   戦闘（パーティ用）

   ラウンドの流れ：
     1. イニシアチブ：パーティと敵が d10 を振り、低い方が先に動く（本体と同じ）
     2. 動ける者から順に行動を決める（Wizardry の流儀。前列の3人だけが武器で殴れる）
     3. 決めた行動と敵の行動を、イニシアチブの順に1つずつ解決する
   敵は前列の誰かを狙う。前列が全員倒れていれば後列が狙われる。
   命中・ダメージ・セーヴ・士気・呪文の効果は本体の AD&D ルールそのまま
   ============================================================ */
const PACE=300;      // 1つの行動を見せる間（ミリ秒）。「早送り」で 0 にする

function aliveFoes(){ return CB.foes.filter(f=>f.alive); }
function foeStatus(f){
  if(!f.alive) return '撃破';
  if(f.status.sleep) return '睡眠';
  if(f.status.hold) return '麻痺';
  if(f.status.stun) return '立ち尽くす';
  const p=f.hp/f.maxhp;
  return p>=0.99?'無傷':p>=0.7?'かすり傷':p>=0.4?'手負い':p>=0.15?'重傷':'虫の息';
}
function foeGroups(){
  const g=[];
  CB.foes.forEach(f=>{ let x=g.find(e=>e.id===f.id); if(!x){ x={id:f.id, n:f.n, boss:f.boss, all:[]}; g.push(x); } x.all.push(f); });
  g.forEach(x=>{ x.alive=x.all.filter(f=>f.alive); });
  return g;
}
function foeSummary(){
  if(!CB) return '';
  return foeGroups().filter(g=>g.alive.length).map(g=>
    `<em>${esc(g.boss?'＊'+g.n:g.n)}</em> ${g.alive.length}${g.all.length>1?`/${g.all.length}`:''}体`+
    (g.alive.length===1?`（${foeStatus(g.alive[0])}）`:'')).join('　');
}
function pace(ms){ return new Promise(r=>setTimeout(r, CB && CB.fast ? 0 : (ms==null?PACE:ms))); }

/* ---------- 敵の絵 ---------- */
function renderFoes(ctx, W, H, now){
  const gs=foeGroups().filter(g=>g.alive.length);
  const n=gs.length;
  const xs = n===1?[0.5] : n===2?[0.32,0.7] : [0.2,0.5,0.8];
  const big = n===1 ? 1 : 0.78;
  gs.slice(0,3).forEach((g,i)=>{
    const h=MART.height(g.id);
    let unit=H*0.66*big*(g.boss?1.15:1);
    unit=Math.min(unit, H*0.97*100/h);
    let x=W*xs[i], y=H*0.95;
    const hit = CB.hitFx && CB.hitFx.id===g.id && now-CB.hitFx.t<220;
    if(hit) x+=Math.sin(now/18)*W*0.012;
    const k=g.alive.length;
    /* 群れは奥に2体まで重ねて描く（奥ほど小さく暗い） */
    const back=[[-0.14,0.8],[0.14,0.8]].slice(0,Math.min(2,k-1));
    back.forEach(([dx,s],j)=>MART.draw(ctx,g.id,x+W*dx*(n===1?1:0.7),y-H*0.06,unit*s,{t:now,ph:j+1,dim:0.55}));
    MART.draw(ctx,g.id,x,y,unit,{t:now,ph:0});
    if(hit){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.fillStyle='rgba(255,220,180,.10)'; ctx.fillRect(0,0,W,H); ctx.restore(); }
  });
  /* 味方が傷を負った瞬間は、画面の縁が赤く染まる */
  if(now-hurtT<260){
    const a=0.45*(1-(now-hurtT)/260);
    const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3,W/2,H/2,Math.max(W,H)*0.7);
    g.addColorStop(0,'rgba(160,0,0,0)'); g.addColorStop(1,`rgba(170,10,0,${a.toFixed(3)})`);
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
}

/* ============================================================
   開戦
   ============================================================ */
/* spec = {groups:[{mid,cnt,boss}], room:部屋の番号（徘徊なら -1）} */
function startCombat(spec){
  const foes=[];
  spec.groups.forEach(gr=>{
    const m=MONSTERS.find(x=>x.id===gr.mid);
    for(let i=0;i<gr.cnt;i++){
      const f=makeFoe(m, foes.length);
      if(gr.boss){ f.maxhp=Math.floor(f.maxhp*1.6)+10; f.hp=f.maxhp; f.boss=true; f.xp=Math.floor(f.xp*2.5); f.name='＊'+m.n; }
      else if(gr.cnt>1) f.name=m.n+'ABCDEFGHIJKL'[i];      // 同じ敵が並ぶときは A・B・C… で見分ける
      foes.push(f);
    }
  });
  CB={foes, round:0, pb:{bless:0,prayer:0,cloud:0}, room:spec.room, over:false, fast:false, cmds:{}, actor:null,
      hitFx:null, moraleChecked:false};
  party().forEach(ch=>{ ch.cb={shield:0,invis:0,mirror:0,stoneskin:0,divine:0,protevil:0,giant:0,defend:false}; ch.para=0; });
  MODE='combat';
  document.body.classList.remove('panel-map');
  const gs=foeGroups();
  head(`⚔ 戦闘：${gs.map(g=>`${esc(g.boss?'＊'+g.n+'（主）':g.n)} ×${g.all.length}`).join('、')}`);
  gs.forEach(g=>dm(MONSTERS.find(m=>m.id===g.id).d));
  refresh();
  /* 奇襲：双方 d6、1〜2 で不意を突かれる。シーフがいれば +1 */
  const thief=living().some(c=>c.cls==='thief');
  const ps=die(6), fs=die(6);
  rollLine('奇襲判定', `パーティ d6=<b>${ps}</b>${thief?'(+1)':''}　敵 d6=<b>${fs}</b>　※1〜2で不意を突かれる`);
  const partySurp=(ps+(thief?1:0))<=2, foeSurp=fs<=2 && !foes.some(f=>f.boss);
  if(partySurp && !foeSurp){
    bad('不意を突かれた！ 敵が先に襲いかかる。');
    (async()=>{ await foesAct(); if(await afterHalf()) return; beginRound(); })();
    return;
  }
  if(foeSurp && !partySurp){
    good('敵はまだこちらに気づいていない！ 1ラウンドぶん自由に動ける。');
    CB.foeSurprised=true; CB.round=1;
    return commandPhase();
  }
  beginRound();
}

function beginRound(){
  if(checkEnd()) return;
  CB.round++;
  const dec=o=>{ for(const k in o) if(typeof o[k]==='number' && o[k]>0 && k!=='stoneskin' && k!=='mirror') o[k]--; };
  party().forEach(ch=>{
    if(ch.cb){ dec(ch.cb); ch.cb.defend=false; }
    if(ch.para>0 && alive(ch)){ ch.para--; if(!ch.para) good(`${esc(ch.name)} の体の自由が戻った。`); }
  });
  ['bless','prayer'].forEach(k=>{ if(CB.pb[k]>0) CB.pb[k]--; });
  if(CB.pb.cloud>0){
    CB.pb.cloud--;
    sys(`燃える雲がまだ渦を巻いている。（残${CB.pb.cloud}ラウンド）`);
    aliveFoes().forEach(f=>{ const d=rollDmg([4,6]); rollLine(`インセンディアリー・クラウド → ${esc(f.name)}`,`4d6 = <b>${d.total}</b>`); damageFoe(f,d.total); });
    if(checkEnd()) return;
  }
  CB.foes.forEach(f=>{ if(f.alive && f.regen && f.hp<f.maxhp) f.hp=Math.min(f.maxhp,f.hp+f.regen); });
  living().forEach(ch=>{ const rg=ch.eq.rings.some(r=>r.eff==='regen')?1:0; if(rg && ch.hp<ch.maxhp) ch.hp=Math.min(ch.maxhp,ch.hp+rg); });
  log('round',`― 第 ${CB.round} ラウンド ―`);
  const pi=die(10), fi=die(10);
  CB.partyFirst = pi<=fi;
  rollLine('イニシアチブ（d10・低い方が先）', `パーティ=<b>${pi}</b>　敵=<b>${fi}</b>`, CB.partyFirst, ['先手','後手']);
  commandPhase();
}

/* ============================================================
   行動の入力
   ============================================================ */
let CMDQ=[];
function commandPhase(){
  CB.cmds={};
  CMDQ=party().filter(canAct);
  if(!CMDQ.length){ dm('動ける者がいない……'); return resolveRound(); }
  askCmd(0);
}
function front(ch){ return S.party.indexOf(ch.id)<3; }
function askCmd(i){
  if(i>=CMDQ.length){ CB.actor=null; return resolveRound(); }
  const ch=CMDQ[i];
  CB.actor=ch.id; refresh();
  const set=(c)=>{ CB.cmds[ch.id]=c; askCmd(i+1); };
  const usable=S.bag.filter(it=>it.kind==='potion'||it.kind==='scroll'||(it.kind==='wand'&&it.uses>0))
    .concat(ch.eq.rings.filter(r=>r.eff==='invis'&&r.uses>0));
  const w=curWeapon(ch);
  acts([
    front(ch) ? {t:'攻撃', s:`${esc(w.name)} ${dmgTxt(w.base.dmg)}`, cls:'pri', fn:()=>set({k:'attack', label:'攻撃'})}
              : {t:'攻撃', s:'後列からは届かない', dis:true},
    ch.spells.length && ch.slots.some(s=>s>0) && {t:'呪文', s:slotTxt(ch), cls:'pri', fn:()=>spellPick(ch, c=>set(c), ()=>askCmd(i))},
    usable.length && {t:'道具', s:`${usable.length}品`, fn:()=>itemPick(ch, usable, c=>set(c), ()=>askCmd(i))},
    CLASSES[ch.cls].layOn && layOnLeft(ch)>0 && {t:'癒しの手', s:`${ch.lv*2}HP・残${layOnLeft(ch)}回`, fn:()=>allyPick('誰を癒す？', a=>set({k:'layon', target:a.id, label:'癒しの手'}), ()=>askCmd(i))},
    {t:'防御', s:'AC-2', fn:()=>set({k:'defend', label:'防御'})},
    i===0 && {t:'全員で戦う', s:'前列は攻撃・後列は防御', fn:()=>{ CMDQ.forEach(c=>{ CB.cmds[c.id] = front(c) ? {k:'attack',label:'攻撃'} : {k:'defend',label:'防御'}; }); CB.actor=null; resolveRound(); }},
    i===0 && {t:'逃げる', s:fleeHint(), cls:'dgr', fn:()=>{ CB.actor=null; tryFlee(); }},
    i>0 && {t:'戻る', s:`${esc(CMDQ[i-1].name)} の行動から`, cls:'dim', fn:()=>{ delete CB.cmds[CMDQ[i-1].id]; askCmd(i-1); }}
  ], `<b>${esc(ch.name)}</b>（${CLASSES[ch.cls].name}・${front(ch)?'前列':'後列'}）の行動は？　HP ${ch.hp}/${ch.maxhp}`);
}
function slotTxt(ch){ return ch.slotsMax.map((m,i)=>`${i+1}:${ch.slots[i]||0}`).join(' '); }
/* 呪文の対象：敵1体／味方1人／自分／敵全体 */
const ALLY_SPELLS=['curelight','cureserious','curecritical','healsp','protevil'];
const PARTY_SPELLS=['bless','prayer'];
function spellTarget(key){
  if(ALLY_SPELLS.includes(key)) return 'ally';
  if(PARTY_SPELLS.includes(key)) return 'party';
  const t=SPELLS[key].tgt;
  return t==='enemy' ? 'enemy' : t==='self' ? 'self' : t==='util' ? 'none' : 'all';
}
function spellPick(ch, done, back){
  const list=ch.spells.filter(s=>ch.slots[SPELLS[s].lv-1]>0 && s!=='knock');
  acts(list.map(s=>({t:SPELLS[s].name, s:`第${SPELLS[s].lv}Lv（残${ch.slots[SPELLS[s].lv-1]}）`, fn:()=>{
    const cmd={k:'spell', sp:s, label:SPELLS[s].name.slice(0,7)};
    const tg=spellTarget(s);
    if(tg==='enemy') return foePick(f=>{ cmd.target=f.idx; done(cmd); }, back, cmd.label);
    if(tg==='ally') return allyPick('誰に？', a=>{ cmd.target=a.id; done(cmd); }, back);
    done(cmd);
  }})).concat([{t:'やめる', cls:'dim', fn:back}]), `${esc(ch.name)}：どの呪文を？`);
}
function itemPick(ch, usable, done, back){
  acts(usable.map(it=>({t:it.name, s:(it.d||'')+(it.uses!=null?`（残${it.uses}）`:''), fn:()=>{
    const cmd={k:'item', uid:it.uid, label:it.name.slice(0,7)};
    const sp=it.sp, tg=sp ? spellTarget(sp) : (it.kind==='potion'?'ally':'none');
    if(tg==='enemy') return foePick(f=>{ cmd.target=f.idx; done(cmd); }, back, cmd.label);
    if(tg==='ally') return allyPick(it.kind==='potion'?'誰に飲ませる？':'誰に？', a=>{ cmd.target=a.id; done(cmd); }, back);
    done(cmd);
  }})).concat([{t:'やめる', cls:'dim', fn:back}]), `${esc(ch.name)}：何を使う？`);
}
function foePick(cb, back, what){
  const list=aliveFoes();
  if(list.length===1) return cb(list[0]);
  acts(list.map(f=>({t:`${esc(f.name)}`, s:foeStatus(f), fn:()=>cb(f)})).concat([{t:'やめる', cls:'dim', fn:back}]), `${what||''}：どれを狙う？`);
}
function allyPick(q, cb, back){
  acts(living().map(a=>({t:esc(a.name), s:`HP ${a.hp}/${a.maxhp}`, fn:()=>cb(a)})).concat([{t:'やめる', cls:'dim', fn:back}]), q);
}

/* ============================================================
   解決
   ============================================================ */
async function resolveRound(){
  acts([{t:'早送り', s:'このラウンドの結果をまとめて出す', cls:'dim', fn:()=>{ CB.fast=true; }}]);
  refresh();
  if(CB.foeSurprised){
    CB.foeSurprised=false;
    await partyActs();
    if(await afterHalf()) return;
    sys('敵がこちらに気づいた。');
    CB.fast=false; return beginRound();
  }
  if(CB.partyFirst){
    await partyActs(); if(await afterHalf()) return;
    await foesAct();   if(await afterHalf()) return;
  } else {
    await foesAct();   if(await afterHalf()) return;
    await partyActs(); if(await afterHalf()) return;
  }
  checkMorale();
  if(checkEnd()) return;
  compactParty();
  CB.fast=false;
  beginRound();
}
/* 半分ごとの後始末。戦闘が終わっていれば true */
async function afterHalf(){ refresh(); return checkEnd(); }

async function partyActs(){
  for(const ch of party()){
    if(!CB || CB.over) return;
    const c=CB.cmds[ch.id];
    if(!c || !canAct(ch)) continue;
    if(!aliveFoes().length) return;
    CB.actor=ch.id; renderParty();
    if(c.k==='attack'){
      if(!front(ch)){ dm(`${esc(ch.name)} は後列に下がっていて、刃が届かない。`); continue; }
      const n=attacksThisRound(ch, CB.round);
      for(let k=0;k<n;k++){
        const t=pickTarget(ch); if(!t) break;
        swing(ch,t,n>1?k+1:0);
        if(!aliveFoes().length) break;
      }
    } else if(c.k==='defend'){
      ch.cb.defend=true; log('act',`${esc(ch.name)} は身を固めた。（AC ${AC(ch)}）`);
    } else if(c.k==='spell'){
      const lvI=SPELLS[c.sp].lv-1;
      if(!(ch.slots[lvI]>0)){ dm(`${esc(ch.name)} にはもう唱える力が残っていない。`); continue; }
      ch.slots[lvI]--;
      log('act',`${esc(ch.name)} は『${SPELLS[c.sp].name}』を唱えた！`);
      castEffect(c.sp, ch, c.target, ch.lv);
    } else if(c.k==='item'){
      useItemInCombat(ch, c);
    } else if(c.k==='layon'){
      const a=byId(c.target);
      if(layOnLeft(ch)<=0 || !a || !alive(a)){ dm('癒しの手は届かなかった。'); continue; }
      ch.layOnUsed=(Number(ch.layOnUsed)||0)+1;
      log('act',`${esc(ch.name)} が ${esc(a.name)} の傷に手をかざす。掌が淡く光る。`);
      heal(a, ch.lv*2);
    }
    refresh();
    await pace();
  }
  if(CB) CB.actor=null;
}
/* 狙う相手：敵の前の方（先頭3体）のうち、いちばん弱っているもの */
function pickTarget(ch){
  const list=aliveFoes(); if(!list.length) return null;
  const head3=list.slice(0,3);
  return head3.slice().sort((a,b)=>a.hp-b.hp)[0];
}
function foeAC(f){ return f.ac + (f.status.blind?4:0); }
function swing(ch, f, nth){
  const w=curWeapon(ch), C=CLASSES[ch.cls];
  const backstab = ch.cls==='thief' && (CB.foeSurprised || f.status.sleep);
  const r=die(20);
  let bonus=hitBonus(ch) + (lit()?0:-4);
  if(backstab) bonus+=4;
  if(f.status.sleep||f.status.hold) bonus+=4;
  const bane=(C.undeadBane||0)+relicMod(ch,'undead')+(w.holy?2:0);
  if(bane && f.undead) bonus+=bane;
  const fac=foeAC(f), need=THAC0(ch)-fac, total=r+bonus;
  const hit = r===20 ? true : (r===1 ? false : total>=need);
  rollLine(`${esc(ch.name)}${nth?`（${nth}回目）`:''} → ${esc(f.name)}`,
    `d20=<b>${r}</b>${bonus>=0?'+':''}${bonus} = <b>${total}</b> vs <b>${need}</b>（THAC0 ${THAC0(ch)}−AC ${fac}）${backstab?' ★背後から':''}`, hit, ['命中','外れ']);
  if(!hit) return;
  const d=rollDmg(w.base.dmg);
  let dmg=d.total+dmgBonus(ch), extra='';
  if(w.flame){ const fd=rollDmg([1,6]); dmg+=fd.total; extra+=` ＋炎${fd.total}`; }
  if(w.holy && f.undead){ const hd=rollDmg([1,8]); dmg+=hd.total; extra+=` ＋聖光${hd.total}`; }
  if(backstab){ const mult=(ch.lv<5?2 : ch.lv<9?3 : ch.lv<13?4 : 5)+relicMod(ch,'backstab'); dmg*=mult; extra+=` ×${mult}`; }
  if(f.status.sleep){ dmg*=2; extra+=' ×2（無防備）'; f.status.sleep=0; }
  dmg=Math.max(1,dmg);
  rollLine('ダメージ', `${d.txt}[${d.rolls.join(',')}]${dmgBonus(ch)?`${dmgBonus(ch)>0?'+':''}${dmgBonus(ch)}`:''}${extra} = <b>${dmg}</b>`);
  damageFoe(f,dmg);
}
function damageFoe(f,dmg){
  if(!f.alive) return;
  f.hp-=dmg;
  CB.hitFx={id:f.id, t:performance.now()}; dirty=true;
  if(f.hp<=0){ f.alive=false; good(`${esc(f.name)} を倒した！`); }
  else if(f.regen) sys(`${esc(f.name)} の傷口がぶくぶくと泡立ち、塞がっていく……`);
}
function foeSave(f, kind){
  const t=Math.max(3, 17 - Math.floor(f.hdNum*0.9)), r=die(20);
  const mod = pbuf('prayer') ? -1 : 0, ok=(r+mod)>=t;
  rollLine(`${esc(f.name)} のセーヴ`, `d20=<b>${r}</b>${mod?mod:''} vs <b>${t}</b>以上`, ok, ['成功','失敗'], true);
  return ok;
}

/* ---------- 敵の番 ---------- */
async function foesAct(){
  for(const f of aliveFoes()){
    if(!CB || CB.over) return;
    if(!living().length) return;
    if(f.status.sleep){ sys(`${esc(f.name)} は眠っている。`); continue; }
    if(f.status.hold){ f.status.hold--; sys(`${esc(f.name)} は動けない。`); if(f.status.hold<=0) delete f.status.hold; continue; }
    if(f.status.stun){ f.status.stun--; sys(`${esc(f.name)} は立ち尽くしている。`); if(f.status.stun<=0) delete f.status.stun; continue; }
    if(f.breath && chance(0.33)){
      bad(`${esc(f.name)} が大きく息を吸い込んだ――${f.breath.name}！`);
      const byHp=f.breath.dmg==='hp';
      living().forEach(ch=>{
        const dmg=byHp ? Math.max(1,f.hp) : rollDmg(f.breath.dmg).total;
        const ok=savingThrow(ch,'bw','ブレス');
        hurt(ch, ok?Math.floor(dmg/2):dmg, f.breath.name);
      });
    } else {
      foeAttack(f);
    }
    refresh();
    await pace();
  }
}
/* 狙われるのは前列。前列に立っている者がいなければ後列 */
function foeTarget(){
  const P=party();
  const fr=P.slice(0,3).filter(alive), bk=P.slice(3).filter(alive);
  const pool=fr.length?fr:bk;
  return pool.length ? pick(pool) : null;
}
function foeAttack(f){
  const ch=foeTarget(); if(!ch) return;
  for(const a of f.atk){
    if(!alive(ch)) return;
    const cb=ch.cb||{};
    if(cb.mirror>0){
      if(die(cb.mirror+1)>1){ cb.mirror--; sys(`${esc(ch.name)} の幻影が一体、霧のように消えた。（残${cb.mirror}）`); continue; }
    }
    if(cb.stoneskin>0){ cb.stoneskin--; sys(`石の肌が ${esc(f.name)} の${a.name}を弾いた。（残${cb.stoneskin}回）`); continue; }
    const r=die(20);
    let mod=0;
    if(cb.invis>0) mod-=4;
    if(cb.protevil>0) mod-=2;
    if(pbuf('prayer')) mod-=1;
    if(f.status.blind) mod-=4;
    if(ch.para>0) mod+=4;
    const ac=AC(ch), need=f.thac0-ac, total=r+mod;
    const hit = r===20 ? true : (r===1 ? false : total>=need);
    rollLine(`${esc(f.name)} の${a.name} → ${esc(ch.name)}`,
      `d20=<b>${r}</b>${mod?(mod>0?'+'+mod:mod):''} = <b>${total}</b> vs <b>${need}</b>（THAC0 ${f.thac0}−AC ${ac}）`, hit, ['命中','外れ'], true);
    if(!hit) continue;
    const d=rollDmg(a.dmg);
    hurt(ch, d.total, `${f.name}の${a.name}`);
    if(a.sp && alive(ch)) specialAttack(f,a,ch);
  }
}
function specialAttack(f,a,ch){
  switch(a.sp){
    case 'poison':
      if(!savingThrow(ch,'ppd','毒')){ const p=rollDmg([2,6]); bad(`毒が回る！`); hurt(ch,p.total,'毒'); }
      return;
    case 'paralyze':
      if(!savingThrow(ch,'ppd','麻痺')){ ch.para=rollDmg([1,6,2]).total; bad(`${esc(ch.name)} は麻痺した！（${ch.para}ラウンド）`); }
      return;
    case 'drain':
      if(!savingThrow(ch,'ppd','レベル吸収')){
        if(ch.lv>1){
          ch.lv--; ch.drained=(ch.drained||0)+1;
          const loss=rollDmg([1,CLASSES[ch.cls].hd]).total;
          ch.maxhp=Math.max(1,ch.maxhp-loss); ch.hp=Math.min(ch.hp,ch.maxhp);
          ch.xp=Math.max(0, CLASSES[ch.cls].xp[ch.lv-1]||0);
          learnSpellsUpTo(ch); rebuildSlots(ch);
          bad(`${esc(ch.name)} は生命を吸われ、レベルを1つ失った！（レベル${ch.lv}）`);
        } else { bad(`${esc(ch.name)} は生命を吸い尽くされた。`); ch.hp=0; ch.status='dead'; }
      }
      return;
    case 'petrify':
      if(!savingThrow(ch,'pp','石化')){ ch.status='stone'; ch.para=0; bad(`${esc(ch.name)} は石になった！`); }
      return;
    case 'blood':
      hurt(ch, rollDmg([1,4]).total, '吸血');
      return;
  }
}

/* ---------- 呪文の効果（本体の castEffect をパーティ用に） ---------- */
function castEffect(key, ch, target, cl){
  const sp=SPELLS[key];
  const foeT=()=>{ const f=CB.foes.find(x=>x.idx===target); return f&&f.alive ? f : aliveFoes()[0]; };
  const ally=()=>{ const a=byId(target); return a&&alive(a) ? a : ch; };
  const area=(dmgFn, label, saveHalf)=>{
    aliveFoes().forEach(f=>{
      const d=dmgFn(f); let dmg=d.total;
      rollLine(`${label} → ${esc(f.name)}`, `${d.txt} = <b>${dmg}</b>`);
      if(saveHalf && foeSave(f,'sp')) dmg=Math.floor(dmg/2);
      damageFoe(f, Math.max(1,dmg));
    });
  };
  switch(key){
    case 'magicmissile':{
      const n=1+Math.floor((cl-1)/2), f=foeT(); if(!f) return;
      let tot=0, det=[]; for(let i=0;i<n;i++){ const d=rollDmg([1,4,1]); tot+=d.total; det.push(d.total); }
      rollLine(`マジック・ミサイル → ${esc(f.name)}（必中）`, `${n}本 × 1d4+1 = [${det.join(',')}] = <b>${tot}</b>`);
      return damageFoe(f,tot);
    }
    case 'burninghands': return area(()=>({total:cl, txt:`術者レベル`}), 'バーニング・ハンズ', true);
    case 'fireball': case 'lightning': { const n=Math.min(10,cl); return area(()=>rollDmg([n,6]), sp.name, true); }
    case 'sleep':{
      const pool=rollDmg([2,4]).total; let left=pool, any=false;
      rollLine('スリープ', `2d4 = <b>${pool}</b> HD分を眠らせる`);
      aliveFoes().sort((a,b)=>a.hdNum-b.hdNum).forEach(f=>{
        if(f.undead || f.hdNum>4) return;
        if(left>=f.hdNum){ left-=f.hdNum; f.status.sleep=99; any=true; good(`${esc(f.name)} は崩れるように眠りに落ちた。`); }
      });
      if(!any) dm('誰も眠らなかった。');
      return;
    }
    case 'shieldsp': ch.cb.shield=8; good(`不可視の盾が ${esc(ch.name)} を守る。（AC ${AC(ch)}）`); return;
    case 'invisibilitysp': ch.cb.invis=8; good(`${esc(ch.name)} の姿が消えた。`); return;
    case 'mirrorimage': { const n=rollDmg([1,4]).total; ch.cb.mirror=n; good(`${n}体の幻影が ${esc(ch.name)} の周りを舞う。`); return; }
    case 'curelight':    { const a=ally(), d=rollDmg([1,8]); rollLine('キュア・ライト・ウーンズ',`1d8 = <b>${d.total}</b>`); return heal(a,d.total); }
    case 'cureserious':  { const a=ally(), d=rollDmg([2,8,1]); rollLine('キュア・シリアス・ウーンズ',`2d8+1 = <b>${d.total}</b>`); return heal(a,d.total); }
    case 'curecritical': { const a=ally(), d=rollDmg([3,8,3]); rollLine('キュア・クリティカル・ウーンズ',`3d8+3 = <b>${d.total}</b>`); return heal(a,d.total); }
    case 'healsp': { const a=ally(); return heal(a, a.maxhp-a.hp); }
    case 'bless': CB.pb.bless=10; good('神の加護がパーティを包む。命中とセーヴに+1。'); return;
    case 'protevil': { const a=ally(); a.cb.protevil=10; good(`${esc(a.name)} を邪悪を退ける光が包む。`); return; }
    case 'prayer': CB.pb.prayer=rollDmg([1,6,6]).total; good('祈りが響く。味方の命中+1、敵の命中とセーヴに-1。'); return;
    case 'spiritualhammer': { const f=foeT(); if(!f) return; const d=rollDmg([2,4,cl]); rollLine(`スピリチュアル・ハンマー → ${esc(f.name)}`,`2d4+${cl} = <b>${d.total}</b>`); return damageFoe(f,d.total); }
    case 'holdperson': {
      const f=foeT(); if(!f) return;
      if(f.undead){ dm(`${esc(f.name)} には効かない。`); return; }
      if(foeSave(f,'sp')) dm(`${esc(f.name)} は抗った。`); else { f.status.hold=rollDmg([1,4,4]).total; good(`${esc(f.name)} は身動きが取れなくなった！`); }
      return;
    }
    case 'icestorm': return area(()=>rollDmg([3,10]), 'アイス・ストーム', false);
    case 'stoneskin': { const n=rollDmg([1,4]).total+Math.floor(cl/2); ch.cb.stoneskin=n; good(`${esc(ch.name)} の肌が岩に変わった。次の ${n} 回の攻撃は当たらない。`); return; }
    case 'coneofcold': { const n=Math.min(20,cl); return area(()=>rollDmg([n,4,cl]), 'コーン・オヴ・コールド', true); }
    case 'cloudkill':
      aliveFoes().forEach(f=>{
        if(f.hdNum<=4 && !f.undead){ bad(`${esc(f.name)} は霧に呑まれ、声もなく崩れ落ちた。`); return damageFoe(f,f.hp); }
        let dmg=rollDmg([1,10]).total; if(foeSave(f,'sp')) dmg=Math.floor(dmg/2); damageFoe(f,Math.max(1,dmg));
      });
      return;
    case 'chainlightning': {
      const n=Math.min(20,cl); let mult=1;
      aliveFoes().forEach(f=>{ const d=rollDmg([n,6]); let dmg=Math.max(1,Math.floor(d.total*mult));
        rollLine(`チェイン・ライトニング → ${esc(f.name)}`, `${n}d6${mult<1?`×${mult}`:''} = <b>${dmg}</b>`);
        if(foeSave(f,'sp')) dmg=Math.floor(dmg/2); damageFoe(f,Math.max(1,dmg)); mult/=2; });
      return;
    }
    case 'disintegrate': { const f=foeT(); if(!f) return; if(foeSave(f,'sp')) dm(`${esc(f.name)} は光をかいくぐった。`); else { good(`${esc(f.name)} は灰も残さず消え去った。`); damageFoe(f,f.hp); } return; }
    case 'delayedblast': { const n=Math.min(20,cl); return area(()=>rollDmg([n,6,cl]), 'ディレイド・ブラスト', true); }
    case 'powerwordstun': { const f=foeT(); if(!f) return; f.status.stun=rollDmg([1,4,1]).total; good(`${esc(f.name)} は言葉に打たれ、その場に立ち尽くした。`); return; }
    case 'powerwordblind': { const f=foeT(); if(!f) return; f.status.blind=true; good(`${esc(f.name)} の視界が閉ざされた。`); return; }
    case 'incendiarycloud': CB.pb.cloud=3; good('燃える雲が湧き上がり、敵を包み込んだ。'); return area(()=>rollDmg([4,6]), 'インセンディアリー・クラウド', false);
    case 'meteorswarm': return area(()=>rollDmg([20,6]), 'メテオ・スウォーム', false);
    case 'powerwordkill': {
      const f=aliveFoes().slice().sort((a,b)=>a.hp-b.hp)[0]; if(!f) return;
      if(f.hp<=60){ good(`「死ね」―― ${esc(f.name)} はその一言で崩れ落ちた。`); damageFoe(f,f.hp); } else dm(`${esc(f.name)} は言葉を撥ね返した。`);
      return;
    }
    case 'divinepower': { ch.cb.divine=10; const d=rollDmg([1,8]); good(`${esc(ch.name)} の腕に神の力が満ちる。`); return heal(ch,d.total); }
    case 'flamestrike': return area(()=>rollDmg([6,8]), 'フレイム・ストライク', true);
    case 'slayliving': {
      const f=foeT(); if(!f) return;
      if(f.undead){ dm('生ある者ではない。'); return; }
      if(foeSave(f,'ppd')){ const d=rollDmg([3,6,cl]); damageFoe(f,d.total); } else { good(`${esc(f.name)} の生命が、糸を切るように断たれた。`); damageFoe(f,f.hp); }
      return;
    }
    case 'harm': { const f=foeT(); if(!f) return; if(foeSave(f,'sp')){ dm(`${esc(f.name)} は掌を撥ね返した。`); return; } const left=rollDmg([1,4]).total; damageFoe(f,Math.max(1,f.hp-left)); return; }
    case 'holyword':
      aliveFoes().forEach(f=>{ if(f.hdNum<=5){ good(`${esc(f.name)} は聖なる言葉に灼かれて消えた。`); return damageFoe(f,f.hp); }
        const d=rollDmg([2,8]); f.status.stun=2; damageFoe(f,d.total); });
      return;
    case 'sunray': return area(f=>rollDmg([f.undead?8:6,6]), 'サン・レイ', true);
    default: dm('何も起こらなかった。');
  }
}
function useItemInCombat(ch, c){
  let it=S.bag.find(x=>x.uid===c.uid);
  const ring=ch.eq.rings.find(x=>x.uid===c.uid);
  if(ring){ if(ring.uses>0){ ring.uses--; ch.cb.invis=8; good(`${esc(ch.name)} が指輪をひねると、姿が消えた。`); } return; }
  if(!it){ dm('その品はもうない。'); return; }
  if(it.kind==='potion'){
    S.bag=S.bag.filter(x=>x!==it);
    const a=byId(c.target)||ch;
    log('act',`${esc(a.name)} が ${esc(it.name)} を飲み干した。`);
    drinkPotion(it, a);
  } else if(it.kind==='scroll'){
    S.bag=S.bag.filter(x=>x!==it);
    log('act',`${esc(ch.name)} が ${esc(it.name)} を読み上げた。`);
    castEffect(it.sp, ch, c.target, Math.max(ch.lv, 5));
  } else if(it.kind==='wand'){
    if(!(it.uses>0)){ dm('もう力が残っていない。'); return; }
    it.uses--;
    log('act',`${esc(ch.name)} が ${esc(it.name)} を振るった。（残${it.uses}）`);
    castEffect(it.sp, ch, c.target, 6);
  }
}
function drinkPotion(it, a){
  if(it.eff==='heal'){ const d=rollDmg([2,4,2]); heal(a,d.total); }
  else if(it.eff==='exheal'){ const d=rollDmg([3,8,3]); heal(a,d.total); }
  else if(it.eff==='invis'){ if(a.cb){ a.cb.invis=8; good(`${esc(a.name)} の姿が消えた。`); } }
  else if(it.eff==='giant'){ if(a.cb){ a.cb.giant=99; good(`${esc(a.name)} の腕に巨人の力が漲る。`); } }
}

/* ---------- 逃走・士気・決着 ---------- */
function fleeHint(){ const fly=aliveFoes().some(f=>f.fly); return `敏捷の平均で判定${fly?'・飛ぶ敵に-4':''}`; }
async function tryFlee(){
  const L_=living();
  const avg=Math.round(L_.reduce((n,c)=>n+c.abil.DEX,0)/L_.length);
  const fly=aliveFoes().some(f=>f.fly), thief=L_.some(c=>c.cls==='thief');
  const mod=(fly?-4:0)+(thief?2:0)+(lit()?0:-4);
  const r=die(20), t=avg+mod, ok=r<=t;
  rollLine('逃走（パーティの敏捷の平均）', `d20=<b>${r}</b> vs <b>${t}</b>以下${fly?'（飛ぶ敵 -4）':''}${thief?'（シーフ +2）':''}`, ok);
  if(ok){
    good('来た道へ駆け戻り、戦いから離れた！');
    CB.over=true;
    endCombat('fled');
    return;
  }
  bad('逃げ切れない！ 背中に追撃を受ける。');
  CB.cmds={};
  acts([{t:'早送り', cls:'dim', fn:()=>{ CB.fast=true; }}]);
  await foesAct();
  if(await afterHalf()) return;
  compactParty(); CB.fast=false;
  beginRound();
}
function checkMorale(){
  const alive_=aliveFoes(); if(!alive_.length || CB.moraleChecked) return;
  if(alive_.length > CB.foes.length/2) return;
  CB.moraleChecked=true;
  const f=alive_[0];
  if(alive_.some(x=>x.boss||x.undead)){ sys(`${esc(f.n)} は退かない。`); return; }
  const brk=Math.max(0,...living().map(c=>(CLASSES[c.cls].moraleBreak||0)+relicMod(c,'morale')));
  const r=rollDmg([2,10]), mor=f.mor-brk, ok=r.total<=mor;
  rollLine('敵の士気判定', `2d10 = <b>${r.total}</b> vs 士気 <b>${mor}</b>以下${brk?`（騎士の威風 −${brk}）`:''}`, ok, ['踏みとどまる','敗走'], true);
  if(!ok){
    good('敵は悲鳴をあげ、闇へ逃げ散った！');
    alive_.forEach(x=>{ x.alive=false; x.routed=true; });
  } else dm('敵は退かない。');
}
function checkEnd(){
  if(!CB || CB.over) return true;
  if(!living().length){ CB.over=true; checkWipe(); return true; }
  if(!aliveFoes().length){ CB.over=true; endCombat('won'); return true; }
  return false;
}
function endCombat(how){
  const c=CB;
  party().forEach(ch=>{ if(ch.para>0){ ch.para=0; } ch.cb=null; });
  compactParty();
  if(how==='won'){
    log('round','― 戦闘終了 ―');
    const xp=c.foes.reduce((n,f)=>n+(f.routed?Math.floor(f.xp/2):f.xp),0)*PARTY_XP_MULT;
    good('すべての敵を退けた！');
    gainXP(xp,'モンスターの撃破');
    const boss=c.foes.some(f=>f.boss);
    if(c.room>=0){ const r=L.rooms[c.room]; r.cleared=true; }
    const t=rollTreasure(DG().diff+S.floor-1, boss?3:0);
    if(t.gold||t.items.length){ dm('骸を検分する。'); giveTreasure(t); }
    if(boss) sys('奥に何かが置かれている。宝箱を調べよう。');
    party().filter(ch=>ch.status==='ok' && ch.hp<=0).forEach(ch=>{ ch.status='dead'; });
  } else if(how==='fled'){
    /* 来たマスへ戻る。部屋の番人はその場に残る */
    if(S.px>=0 && (S.px!==S.x || S.py!==S.y)){ S.x=S.px; S.y=S.py; }
  }
  CB=null;
  MODE='dungeon';
  save(); refresh();
  if(how==='won') visit();
  if(MODE==='dungeon'){ refresh(); dungeonActs(); }
}
