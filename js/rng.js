"use strict";
/* ============================================================
   乱数・ダイス（Dungeon Delve 本体と同じ xorshift32）
   ============================================================ */
let _seed = (Date.now() ^ 0x9e3779b9) >>> 0;
function srand(s){ _seed = (s>>>0) || 1; }
function rand(){
  _seed ^= _seed << 13; _seed >>>= 0;
  _seed ^= _seed >>> 17;
  _seed ^= _seed << 5;  _seed >>>= 0;
  return _seed / 4294967296;
}
function ri(a,b){ return a + Math.floor(rand()*(b-a+1)); }
function die(s){ return ri(1,s); }
function pick(a){ return a[Math.floor(rand()*a.length)]; }
function chance(p){ return rand() < p; }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
/* 階ごとに決まった種から迷路を作るための種づくり（同じ冒険なら同じ階は同じ形になる） */
function mixSeed(a,b){ let h=(a^Math.imul(b+0x632be5ab,0x9e3779b1))>>>0; h^=h>>>15; h=Math.imul(h,0x85ebca77)>>>0; h^=h>>>13; return h>>>0 || 1; }
