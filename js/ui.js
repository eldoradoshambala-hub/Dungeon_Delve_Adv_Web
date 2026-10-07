"use strict";
/* ============================================================
   画面の部品：記録欄・操作ボタン・見出しのチップ・パーティの札
   ============================================================ */
const $=id=>document.getElementById(id);
const $log=$('log'), $logwrap=$('logwrap'), $acts=$('acts'), $chips=$('chips'), $status=$('status'),
      $view=$('view'), $map=$('map'), $compass=$('compass'), $ahead=$('ahead'), $party=$('party');

function esc(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function log(cls, html){
  const p=document.createElement('p'); p.className='l '+cls; p.innerHTML=html;
  $log.appendChild(p);
  while($log.childNodes.length>320) $log.removeChild($log.firstChild);
  scrollLog();
  return p;
}
let scrollReq=0;
function scrollLog(){ cancelAnimationFrame(scrollReq); scrollReq=requestAnimationFrame(()=>{ $logwrap.scrollTop=$logwrap.scrollHeight; }); }
const dm=t=>log('dm',t), sys=t=>log('sys',t), good=t=>log('good',t), bad=t=>log('bad',t),
      head=t=>log('head',t), loot=t=>log('loot',t);
function clearLog(){ $log.innerHTML=''; }
/* ダイスの結果は全部見せる（本体と同じ流儀）。words=[肯定,否定]、invert=true で肯定を赤にする */
function rollLine(label, detail, ok, words, invert){
  const w=words||['成功','失敗'];
  const positive = invert ? !ok : ok;
  const mark = ok===undefined ? '' : ` → <span class="${positive?'ok':'ng'}">${ok?w[0]:w[1]}</span>`;
  log('roll', `<span class="d">🎲 ${label}</span>　${detail}${mark}`);
}

/* 操作ボタン。{t:表示, s:小さな説明, cls, fn, dis} の並び。偽の要素は飛ばす */
let actsPrompt='';
function acts(list, prompt){
  $acts.innerHTML='';
  if(prompt){ const p=document.createElement('p'); p.className='prompt'; p.innerHTML=prompt; $acts.appendChild(p); }
  for(const a of list){
    if(!a) continue;
    const b=document.createElement('button');
    b.type='button'; b.className='btn '+(a.cls||'');
    b.innerHTML=a.t+(a.s?`<small>${a.s}</small>`:'');
    if(a.dis) b.disabled=true; else b.onclick=a.fn;
    $acts.appendChild(b);
  }
}
/* 名前の入力欄（prompt() はブラウザによって無効なので画面内で） */
function askName(initial, onOk, onAgain){
  $acts.innerHTML='';
  const inp=document.createElement('input');
  inp.type='text'; inp.maxLength=12; inp.value=initial; inp.className='name';
  inp.setAttribute('aria-label','名前');
  const ok=document.createElement('button'); ok.type='button'; ok.className='btn pri'; ok.textContent='この名前で登録';
  ok.onclick=()=>onOk(String(inp.value||'').trim().slice(0,12) || initial);
  const again=document.createElement('button'); again.type='button'; again.className='btn'; again.textContent='別の名を提案';
  again.onclick=()=>{ inp.value=onAgain(); };
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); ok.onclick(); } });
  $acts.appendChild(inp); $acts.appendChild(ok); $acts.appendChild(again);
  try{ inp.focus(); inp.select(); }catch(_){}
}

/* ---------- パーティの札（前列3・後列3） ---------- */
const STATUS_JA={ok:'',dead:'死亡',ashes:'灰',stone:'石化',lost:'消失'};
function renderParty(){
  if(!S){ $party.innerHTML=''; return; }
  const P=party();
  if(!P.length){ $party.innerHTML='<p class="empty">パーティはまだいない。冒険者ギルドで登録しよう。</p>'; return; }
  let h='';
  for(let i=0;i<6;i++){
    const ch=P[i];
    if(!ch){ h+=`<div class="pm none"></div>`; continue; }
    const st = ch.status!=='ok' ? STATUS_JA[ch.status] : (ch.para>0 ? '麻痺' : '');
    const pct=Math.max(0,Math.min(100,ch.hp/ch.maxhp*100));
    const low=ch.status==='ok' && ch.hp<=ch.maxhp*0.34;
    const cmd = CB && CB.cmds && CB.cmds[ch.id] ? `<span class="cmd">${CB.cmds[ch.id].label}</span>` : '';
    const up = ch.status==='ok' && xpNext(ch)!==null && ch.xp>=xpNext(ch) ? '<span class="up" title="宿で休めばレベルが上がる">▲</span>' : '';
    h+=`<button type="button" class="pm ${i<3?'front':'back'} ${ch.status!=='ok'?'out':''} ${low?'low':''} ${CB&&CB.actor===ch.id?'acting':''}" data-id="${ch.id}">`+
       `<span class="nm">${esc(ch.name)}${up}</span>`+
       `<span class="cl">${CLASS_SHORT[ch.cls]}${ch.lv}</span>`+
       `<span class="hpbar"><i style="width:${pct}%"></i></span>`+
       `<span class="st">${st?`<b>${st}</b>`:`HP ${ch.hp}/${ch.maxhp}`}<span class="ac">AC${AC(ch)}</span></span>${cmd}`+
       `</button>`;
  }
  $party.innerHTML=h;
  $party.querySelectorAll('.pm[data-id]').forEach(b=>b.onclick=()=>onPartyCard(b.dataset.id));
}
