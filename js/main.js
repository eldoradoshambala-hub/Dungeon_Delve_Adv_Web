"use strict";
/* ============================================================
   入力と起動
   ============================================================ */
window.addEventListener('error', e=>{ try{ bad('内部エラー: '+e.message); }catch(_){} });

/* ---------- キーボード ---------- */
const KEYMAP={
  ArrowUp:'fw', w:'fw', W:'fw', '8':'fw',
  ArrowDown:'bk', s:'bk', S:'bk', '2':'bk',
  ArrowLeft:'tl', a:'tl', A:'tl', '4':'tl',
  ArrowRight:'tr', d:'tr', D:'tr', '6':'tr',
  q:'sl', Q:'sl', '7':'sl',
  e:'sr', E:'sr', '9':'sr'
};
let lastKey=0;
document.addEventListener('keydown', e=>{
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const k=e.key;
  if(e.target && e.target.tagName==='INPUT') return;          // 名前の入力中
  if(MODE==='dungeon' && !campOpen){
    if(KEYMAP[k]){
      e.preventDefault();
      const now=performance.now();
      if(now-lastKey<95) return;
      lastKey=now;
      act(KEYMAP[k]); flashPad(KEYMAP[k]);
      return;
    }
    if(e.repeat) return;
    if(k==='f' || k==='F' || k==='5'){ search(); return; }
    if(k==='Enter' || k===' '){
      if(document.activeElement && document.activeElement.tagName==='BUTTON') return;
      e.preventDefault();
      if(onDown()) descend(); else if(onUp()) ascend(); else if(chestHere()) chestMenu();
      return;
    }
    if(k==='m' || k==='M'){ toggleMapPanel(); return; }
    if(k==='c' || k==='C'){ camp(); return; }
  }
  if((k==='v' || k==='V') && !e.repeat && MODE!=='combat'){ toggleStyle(); if(MODE==='title') title(); }
});

/* ---------- 操作盤（押した瞬間に動く。押しっぱなしで歩き続ける） ---------- */
let holdTimer=0;
function stopHold(){ clearTimeout(holdTimer); holdTimer=0; }
document.querySelectorAll('#pad button').forEach(b=>{
  const k=b.dataset.k;
  b.addEventListener('pointerdown', e=>{
    e.preventDefault();
    act(k);
    stopHold();
    if(k==='tl' || k==='tr') return;
    const rep=()=>{ act(k); holdTimer=setTimeout(rep,170); };
    holdTimer=setTimeout(rep,380);
  });
  ['pointerup','pointerleave','pointercancel'].forEach(t=>b.addEventListener(t, stopHold));
  b.addEventListener('click', e=>{ if(e.detail===0) act(k); });   // キーボードで押したとき
  b.addEventListener('contextmenu', e=>e.preventDefault());
});
function flashPad(k){
  const b=document.querySelector(`#pad button[data-k="${k}"]`);
  if(!b) return;
  b.classList.add('hit'); setTimeout(()=>b.classList.remove('hit'), 110);
}

/* ---------- 眺めをなでる（上：進む／下：下がる／左右：向きを変える） ---------- */
let swipe=null;
$view.addEventListener('pointerdown', e=>{ swipe={x:e.clientX, y:e.clientY, t:performance.now()}; });
$view.addEventListener('pointerup', e=>{
  if(!swipe || MODE!=='dungeon'){ swipe=null; return; }
  const dx=e.clientX-swipe.x, dy=e.clientY-swipe.y; swipe=null;
  const ax=Math.abs(dx), ay=Math.abs(dy);
  if(Math.max(ax,ay)<28) return;
  if(ax>ay) act(dx<0 ? 'tr' : 'tl');   // 景色を左へ押しやる＝右を向く
  else act(dy<0 ? 'fw' : 'bk');
});
$view.addEventListener('pointercancel', ()=>{ swipe=null; });

/* ---------- 地図タブ（狭い画面だけ） ---------- */
const $tabMap=$('tabMap');
function toggleMapPanel(){
  const on=!document.body.classList.contains('panel-map');
  document.body.classList.toggle('panel-map', on);
  $tabMap.classList.toggle('on', on);
  $tabMap.textContent = on ? '記録' : '地図';
  mapDirty=true;
}
$tabMap.addEventListener('click', toggleMapPanel);

/* ---------- 大きさが変わったら描き直す ---------- */
if(window.ResizeObserver){
  new ResizeObserver(()=>{ dirty=true; }).observe($view);
  new ResizeObserver(()=>{ mapDirty=true; }).observe($map);
} else window.addEventListener('resize', ()=>{ dirty=true; mapDirty=true; });

/* ---------- 閉じる・隠れるときに記録 ---------- */
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) save(); });

/* ---------- 起動 ---------- */
loadSettings();
title();
requestAnimationFrame(frame);
