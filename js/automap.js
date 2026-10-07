"use strict";
/* ============================================================
   自動地図：方眼紙に青インクで描いた昔のモジュールの地図のように描く。
   一度見たマスだけを描き、北が常に上。1マス＝10フィート。
   ============================================================ */
const MAP_INK='#1f4a9a', MAP_PAPER='#efe6cc', MAP_GRID='rgba(60,100,170,.16)';

function renderMap(ctx, W, H, L, px, py, face){
  const pad=Math.round(Math.min(W,H)*0.03)+2;
  const cs=Math.floor(Math.min((W-pad*2)/L.w, (H-pad*2)/L.h));
  const ox=Math.round((W-cs*L.w)/2), oy=Math.round((H-cs*L.h)/2);
  const X=x=>ox+x*cs, Y=y=>oy+y*cs;
  const seen=(x,y)=>inside(L,x,y) && L.seen[y*L.w+x]>0;

  ctx.fillStyle=MAP_PAPER; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=MAP_GRID; ctx.lineWidth=1;
  ctx.beginPath();
  for(let i=0;i<=L.w;i++){ ctx.moveTo(X(i)+.5,Y(0)); ctx.lineTo(X(i)+.5,Y(L.h)); }
  for(let j=0;j<=L.h;j++){ ctx.moveTo(X(0),Y(j)+.5); ctx.lineTo(X(L.w),Y(j)+.5); }
  ctx.stroke();

  /* 床 */
  for(let y=0;y<L.h;y++) for(let x=0;x<L.w;x++){
    const s=L.seen[y*L.w+x]; if(!s) continue;
    ctx.fillStyle = s>=2 ? '#fffaf0' : '#f7f0dc';
    ctx.fillRect(X(x),Y(y),cs,cs);
    if(s<2){ /* 見ただけで踏んでいないマスは点を打つ */
      ctx.fillStyle='rgba(31,74,154,.25)';
      ctx.fillRect(X(x)+cs/2-1,Y(y)+cs/2-1,2,2);
    }
  }

  /* 壁と扉。見たマスの4辺を描く（重複して描いても見た目は同じ） */
  const lw=Math.max(1.5,cs/7);
  ctx.lineCap='square';
  for(let y=0;y<L.h;y++) for(let x=0;x<L.w;x++){
    if(!seen(x,y)) continue;
    for(let d=0;d<4;d++){
      const e=edgeAt(L,x,y,d);
      if(e===E_OPEN) continue;
      let x0,y0,x1,y1;
      if(d===0){ x0=X(x); y0=Y(y); x1=X(x+1); y1=Y(y); }
      if(d===2){ x0=X(x); y0=Y(y+1); x1=X(x+1); y1=Y(y+1); }
      if(d===3){ x0=X(x); y0=Y(y); x1=X(x); y1=Y(y+1); }
      if(d===1){ x0=X(x+1); y0=Y(y); x1=X(x+1); y1=Y(y+1); }
      ctx.strokeStyle=MAP_INK; ctx.lineWidth=lw;
      if(isDoor(e)){
        /* 扉：壁を切り、短い横棒で戸を描く */
        const mx=(x0+x1)/2, my=(y0+y1)/2, hor=(y0===y1), q=cs*0.28;
        ctx.beginPath();
        if(hor){ ctx.moveTo(x0,y0); ctx.lineTo(mx-q,y0); ctx.moveTo(mx+q,y0); ctx.lineTo(x1,y1); }
        else   { ctx.moveTo(x0,y0); ctx.lineTo(x0,my-q); ctx.moveTo(x0,my+q); ctx.lineTo(x1,y1); }
        ctx.stroke();
        ctx.fillStyle=MAP_PAPER; ctx.lineWidth=Math.max(1,lw*0.6);
        const t=Math.max(2,cs*0.16);
        if(hor){ ctx.fillRect(mx-q,my-t/2,q*2,t); ctx.strokeRect(mx-q,my-t/2,q*2,t); }
        else   { ctx.fillRect(mx-t/2,my-q,t,q*2); ctx.strokeRect(mx-t/2,my-q,t,q*2); }
        if(e===E_FOUND && cs>=12){
          ctx.fillStyle=MAP_INK; ctx.font=`bold ${Math.round(cs*0.42)}px serif`;
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText('S', hor?mx:mx+cs*0.3, hor?my-cs*0.3:my);
        }
      } else {
        ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
      }
    }
  }

  /* 階段 */
  ctx.fillStyle=MAP_INK; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font=`bold ${Math.max(9,Math.round(cs*0.62))}px serif`;
  if(L.up && seen(L.up.x,L.up.y)) ctx.fillText('▲', X(L.up.x)+cs/2, Y(L.up.y)+cs/2+1);
  if(L.down && seen(L.down.x,L.down.y)) ctx.fillText('▼', X(L.down.x)+cs/2, Y(L.down.y)+cs/2+1);
  if(L.goal>=0){
    const r=L.rooms[L.goal];
    if(r && r.seen){ ctx.fillStyle='#9a2a22'; ctx.fillText('★', X(r.x)+r.w*cs/2, Y(r.y)+r.h*cs/2+1); }
  }

  /* 一行の現在地（赤い矢印） */
  if(px>=0){
    const cxp=X(px)+cs/2, cyp=Y(py)+cs/2, r=cs*0.38;
    ctx.save(); ctx.translate(cxp,cyp); ctx.rotate(face*Math.PI/2);
    ctx.fillStyle='#b8322a'; ctx.strokeStyle='#5a120c'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,-r); ctx.lineTo(r*0.8,r*0.75); ctx.lineTo(0,r*0.35); ctx.lineTo(-r*0.8,r*0.75); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* 方位 */
  ctx.fillStyle=MAP_INK; ctx.font=`bold ${Math.max(10,Math.round(Math.min(W,H)*0.04))}px serif`;
  ctx.textAlign='right'; ctx.textBaseline='top';
  ctx.fillText('N↑', W-4, 3);
}

/* まだ何も描いていない方眼紙 */
function renderBlankMap(ctx, W, H){
  ctx.fillStyle=MAP_PAPER; ctx.fillRect(0,0,W,H);
  const cs=Math.max(8, Math.floor(Math.min(W,H)/18));
  ctx.strokeStyle=MAP_GRID; ctx.lineWidth=1; ctx.beginPath();
  for(let x=(W%cs)/2; x<=W; x+=cs){ ctx.moveTo(Math.round(x)+.5,0); ctx.lineTo(Math.round(x)+.5,H); }
  for(let y=(H%cs)/2; y<=H; y+=cs){ ctx.moveTo(0,Math.round(y)+.5); ctx.lineTo(W,Math.round(y)+.5); }
  ctx.stroke();
  ctx.fillStyle='rgba(31,74,154,.55)'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font=`${Math.round(Math.min(W,H)*0.045)}px serif`;
  ctx.fillText('まだ何も描かれていない', W/2, H/2);
}
