"use strict";
/* ============================================================
   一人称の3D表示（Canvas）

   画面の奥行きは「面」で考える。今いるマスの手前の面が z=0（画面いっぱい）、
   1マス先が z=1（半分の大きさ）、2マス先が z=2（3分の1）…と縮む。
   横方向は半マス単位の lat で表し、マスの境目は lat=±1, ±3, ±5 にある。

   描く順番は「奥から手前、外側の列から内側の列」。手前の壁が後から上書きするので、
   奥の物が手前の壁に隠れる処理はこれだけで済む（画家のアルゴリズム）。

   光は松明の届く範囲までしか描かない。届かない所は闇のまま。
   ============================================================ */
const VIEW_DEPTH=5, VIEW_LAT=3;

function hash4(a,b,c,d){
  let h=Math.imul(a+0x9e37,0x85ebca6b)^Math.imul(b+0x7f4a,0xc2b2ae35)^Math.imul(c+0x1656,0x27d4eb2f)^Math.imul(d+1,0x9e3779b1);
  h^=h>>>15; h=Math.imul(h,0x2c1b3c6d); h^=h>>>12; h=Math.imul(h,0x297a2d39); h^=h>>>15;
  return (h>>>0)/4294967296;
}

/* 見えるマス。今いるマスから、前へ・外側へと、壁に遮られずにたどれるマスを拾う。
   画面の外にはみ出す列（手前の大きく横に離れたマス）は除く */
function visibleCells(L, px, py, face){
  const fx=DX[face], fy=DY[face], rx=DX[(face+1)%4], ry=DY[(face+1)%4];
  const left=(face+3)%4, right=(face+1)%4;
  const vis=new Set(), K=(d,l)=>d*16+l+8;
  const wx=(d,l)=>px+fx*d+rx*l, wy=(d,l)=>py+fy*d+ry*l;
  const onScreen=(d,l)=>2*Math.abs(l)-1 < d+2;
  vis.add(K(0,0));
  for(let d=0; d<=VIEW_DEPTH; d++){
    if(d>0) for(let l=-VIEW_LAT; l<=VIEW_LAT; l++){
      if(vis.has(K(d-1,l)) && onScreen(d,l) && !looksSolid(edgeAt(L,wx(d-1,l),wy(d-1,l),face))) vis.add(K(d,l));
    }
    for(let l=1; l<=VIEW_LAT; l++){
      if(onScreen(d,l)   && vis.has(K(d,l-1))    && !looksSolid(edgeAt(L,wx(d,l-1),wy(d,l-1),right)))   vis.add(K(d,l));
      if(onScreen(d,-l)  && vis.has(K(d,-(l-1))) && !looksSolid(edgeAt(L,wx(d,-(l-1)),wy(d,-(l-1)),left))) vis.add(K(d,-l));
    }
  }
  return {has:(d,l)=>vis.has(K(d,l)), wx, wy, left, right};
}

const TORCH_TINT=[1.10,0.94,0.76];
function rgb(c,b,t){
  t=t||TORCH_TINT;
  return `rgb(${Math.min(255,Math.round(c[0]*b*t[0]))},${Math.min(255,Math.round(c[1]*b*t[1]))},${Math.min(255,Math.round(c[2]*b*t[2]))})`;
}

/* o = {style:'stone'|'wire', theme, R:光の届く距離（マス）, I:明るさ, flick:揺らぎ}
   戻り値：描いたマスの座標（地図の「見た」記録に使う） */
function renderView(ctx, W, H, L, px, py, face, o){
  const T=o.theme, wire=o.style==='wire';
  const cx=W/2, cy=H/2, HW=W/2, HH=H/2;
  const SX=(z,lat)=>cx+lat*HW/(z+1);
  const SY=(z,v)=>cy+v*HH/(z+1);
  const B=z=>{ if(z>=o.R) return 0; return Math.pow((o.R-z)/o.R,1.15)*o.I*o.flick; };
  const LW=z=>Math.max(1, W/360*2/(z+1));
  const seen=[];
  ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
  ctx.lineJoin='round'; ctx.lineCap='round';
  const V=visibleCells(L,px,py,face);

  /* 面の上の点 (u,v) → 画面座標。u：面の横（側面なら手前0→奥1）、v：上0→下1 */
  const frontP=(z,l)=>(u,v)=>[SX(z,2*l-1+2*u), SY(z,-1+2*v)];
  const sideP=(z0,lat)=>(u,v)=>[SX(z0+u,lat), SY(z0+u,-1+2*v)];
  const floorP=(d,l,vv)=>(u,t)=>[SX(d+t,2*l-1+2*u), SY(d+t,vv)];
  function poly(pts){ ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath(); }
  function seg(P,u1,v1,u2,v2){ const a=P(u1,v1), b=P(u2,v2); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); }
  function quad(P,u0,v0,u1,v1){ poly([P(u0,v0),P(u1,v0),P(u1,v1),P(u0,v1)]); }

  /* 石積み。石ひとつずつ明るさを少し変えて塗り、目地を引く。
     bAt(u)：面の横位置 u での明るさ（側面は奥ほど暗い） */
  function pattern(P, key, zMid, bAt){
    const pat=T.pattern, b=bAt(0.5);
    if(pat==='bone'){
      ctx.strokeStyle=rgb(T.wall, b*0.52); ctx.lineWidth=LW(zMid)*0.9;
      ctx.beginPath();
      for(const u of [0.14,0.38,0.62,0.86]) seg(P,u,0.04,u,0.98);
      seg(P,0,0.1,1,0.1);
      ctx.stroke();
      ctx.strokeStyle=rgb(T.wall, b*1.18); ctx.lineWidth=LW(zMid)*0.6;
      ctx.beginPath();
      for(const u of [0.16,0.40,0.64,0.88]) seg(P,u,0.12,u,0.96);
      ctx.stroke();
      return;
    }
    const rows = pat==='brick'?6 : pat==='block'?3 : 5;
    const vs=[0], vm=[0];
    for(let r=1; r<rows; r++){
      let v=r/rows;
      if(pat==='rough') v+=(hash4(key[0],key[1],key[2],r)-0.5)*0.6/rows;
      vs.push(v);
      /* 荒い岩肌は目地を途中で折る */
      vm.push(pat==='rough' ? v+(hash4(key[0],key[2],r,key[1])-0.5)*0.4/rows : v);
    }
    vs.push(1); vm.push(1);
    const rowV=(r,u)=> u<=0.5 ? vs[r]+(vm[r]-vs[r])*u*2 : vm[r]+(vs[r]-vm[r])*(u-0.5)*2;
    const joints=r=> pat==='brick' ? (r%2 ? [0.25,0.75] : [0.5])
                   : pat==='block' ? (r%2 ? [0.62] : [0.3,0.84])
                   : [0.2+hash4(key[0],key[1],r,7)*0.6];
    for(let r=0; r<rows; r++){
      const cuts=[0].concat(joints(r),[1]);
      for(let j=0; j<cuts.length-1; j++){
        const u0=cuts[j], u1=cuts[j+1], us=[u0];
        if(u0<0.5 && u1>0.5) us.push(0.5);
        us.push(u1);
        const k=hash4(key[0]*7+r, key[1]*13+j, key[2], 99);
        ctx.fillStyle=rgb(T.wall, bAt((u0+u1)/2)*(0.86+0.26*k));
        const pts=us.map(u=>P(u,rowV(r,u))).concat(us.slice().reverse().map(u=>P(u,rowV(r+1,u))));
        poly(pts); ctx.fill();
      }
    }
    ctx.strokeStyle=rgb(T.wall, b*0.45); ctx.lineWidth=LW(zMid)*0.9;
    ctx.beginPath();
    for(let r=1; r<rows; r++){ seg(P,0,vs[r],0.5,vm[r]); seg(P,0.5,vm[r],1,vs[r]); }
    for(let r=0; r<rows; r++) for(const u of joints(r)) seg(P,u,rowV(r,u),u,rowV(r+1,u));
    ctx.stroke();
  }

  /* 木の扉。上がアーチ、鉄の帯と環の取っ手 */
  function door(P, zMid, b){
    const top=u=>0.34-0.12*Math.sin(Math.PI*(u-0.28)/0.44);
    const arch=[];
    for(let i=0;i<=10;i++){ const u=0.28+0.044*i; arch.push(P(u,top(u))); }
    const outline=[P(0.28,1)].concat(arch,[P(0.72,1)]);
    if(wire){
      ctx.strokeStyle=rgb([210,210,210],b,[1,1,1]); ctx.lineWidth=LW(zMid);
      poly(outline); ctx.stroke(); return;
    }
    /* 戸口の石枠 */
    ctx.strokeStyle=rgb(T.wall, b*1.25); ctx.lineWidth=LW(zMid)*3.2;
    poly(outline); ctx.stroke();
    ctx.fillStyle=rgb(T.door,b); poly(outline); ctx.fill();
    ctx.strokeStyle=rgb(T.door,b*0.5); ctx.lineWidth=LW(zMid)*0.9;
    ctx.beginPath();
    for(const u of [0.39,0.5,0.61]) seg(P,u,top(u)+0.01,u,1);
    ctx.stroke();
    ctx.strokeStyle=rgb([60,58,56],b*1.3,[1,1,1]); ctx.lineWidth=LW(zMid)*2.2;
    ctx.beginPath(); seg(P,0.285,0.48,0.715,0.48); seg(P,0.285,0.82,0.715,0.82); ctx.stroke();
    const h=P(0.64,0.64), h2=P(0.64,0.70);
    ctx.strokeStyle=rgb([150,130,90],b,[1,1,1]); ctx.lineWidth=LW(zMid)*1.2;
    ctx.beginPath(); ctx.ellipse(h[0],(h[1]+h2[1])/2, Math.max(1.5,Math.abs(h2[1]-h[1])*0.45), Math.max(2,Math.abs(h2[1]-h[1])*0.5),0,0,Math.PI*2); ctx.stroke();
  }

  /* 坑道の坑木 */
  function beams(P, zMid, b, side){
    ctx.fillStyle=rgb(T.door, b*0.75);
    if(side){ quad(P,0,0,0.07,1); ctx.fill(); quad(P,0,0,1,0.07); ctx.fill(); return; }
    quad(P,0,0,0.07,1); ctx.fill(); quad(P,0.93,0,1,1); ctx.fill(); quad(P,0,0,1,0.08); ctx.fill();
  }

  function face_(P, e, key, zNear, zFar, outline){
    const zMid=(zNear+zFar)/2, bN=B(zNear), bF=B(zFar), b=(bN+bF)/2;
    if(wire){
      ctx.fillStyle='#000'; poly(outline); ctx.fill();
      ctx.strokeStyle=rgb([215,215,215],b,[1,1,1]); ctx.lineWidth=LW(zMid);
      poly(outline); ctx.stroke();
      if(isDoor(e)) door(P,zMid,b);
      return;
    }
    if(zNear!==zFar){
      const a=outline[0][0], c=outline[1][0];
      const g=ctx.createLinearGradient(a,0,c,0);
      g.addColorStop(0,rgb(T.wall,bN)); g.addColorStop(1,rgb(T.wall,bF));
      ctx.fillStyle=g;
    } else ctx.fillStyle=rgb(T.wall,b);
    poly(outline); ctx.fill();
    pattern(P,key,zMid,u=>B(zNear+(zFar-zNear)*u));
    if(T.beams && !isDoor(e)) beams(P,zMid,b,zNear!==zFar);
    ctx.strokeStyle=rgb(T.wall,b*0.35); ctx.lineWidth=LW(zMid)*1.1;
    poly(outline); ctx.stroke();
    if(isDoor(e)) door(P,zMid,b);
  }

  function floorCeil(d,l){
    if(wire) return;
    const bN=B(d), bF=B(d+1);
    for(const vv of [1,-1]){
      const P=floorP(d,l,vv), pts=[P(0,0),P(1,0),P(1,1),P(0,1)];
      const col=vv>0?T.floor:T.ceil;
      const g=ctx.createLinearGradient(0,SY(d,vv),0,SY(d+1,vv));
      g.addColorStop(0,rgb(col,bN)); g.addColorStop(1,rgb(col,bF));
      ctx.fillStyle=g; poly(pts); ctx.fill();
      ctx.strokeStyle=rgb(col,(bN+bF)/2*0.55); ctx.lineWidth=LW(d+0.5)*0.8;
      poly(pts); ctx.stroke();
    }
  }

  function stairs(d,l,kind){
    const zMid=d+0.5, b=B(zMid);
    const line=wire?rgb([215,215,215],b,[1,1,1]):rgb(T.floor,b*1.5);
    if(kind==='down'){
      const P=floorP(d,l,1);
      ctx.fillStyle=wire?'#000':rgb(T.floor,b*0.18);
      quad(P,0.18,0.15,0.82,0.85); ctx.fill();
      ctx.strokeStyle=line; ctx.lineWidth=LW(zMid);
      quad(P,0.18,0.15,0.82,0.85); ctx.stroke();
      ctx.beginPath();
      for(let k=1;k<=4;k++){ const t=0.15+0.7*k/5; seg(P,0.22,t,0.78,t); }
      ctx.stroke();
      return;
    }
    /* 上り階段：奥へ向かって段が上がっていく */
    const n=5, sl=2*l-1;
    for(let k=n-1;k>=0;k--){
      const t0=d+0.2+0.13*k, t1=t0+0.13;
      const h0=1-0.34*k, h1=1-0.34*(k+1);
      const xs=(z,u)=>SX(z,sl+2*u);
      const front=[[xs(t0,0.2),SY(t0,h1)],[xs(t0,0.8),SY(t0,h1)],[xs(t0,0.8),SY(t0,h0)],[xs(t0,0.2),SY(t0,h0)]];
      const tread=[[xs(t0,0.2),SY(t0,h1)],[xs(t1,0.2),SY(t1,h1)],[xs(t1,0.8),SY(t1,h1)],[xs(t0,0.8),SY(t0,h1)]];
      const bb=B(t0);
      ctx.fillStyle=wire?'#000':rgb(T.wall,bb*0.95); poly(tread); ctx.fill();
      ctx.fillStyle=wire?'#000':rgb(T.wall,bb*0.7);  poly(front); ctx.fill();
      ctx.strokeStyle=wire?rgb([215,215,215],bb,[1,1,1]):rgb(T.wall,bb*0.4); ctx.lineWidth=LW(t0);
      poly(tread); ctx.stroke(); poly(front); ctx.stroke();
    }
  }

  /* 宝箱：床に置かれた鉄枷つきの木箱。開いていれば蓋が後ろへ倒れている */
  function chest(d,l,open){
    const z0=d+0.34, z1=d+0.62, sl=2*l-1, u0=0.27, u1=0.73, hT=0.6;
    const P=(z,u,h)=>[SX(z,sl+2*u), SY(z,h)];
    const b=B(z0);
    const fill=(pts,c)=>{ poly(pts); if(wire){ ctx.fillStyle='#000'; ctx.fill(); ctx.strokeStyle=rgb([215,215,215],b,[1,1,1]); ctx.lineWidth=LW(z0); ctx.stroke(); } else { ctx.fillStyle=c; ctx.fill(); ctx.strokeStyle=rgb(T.door,b*0.35); ctx.lineWidth=LW(z0)*0.9; ctx.stroke(); } };
    const wood=T.door;
    if(l>0) fill([P(z0,u0,1),P(z1,u0,1),P(z1,u0,hT),P(z0,u0,hT)], rgb(wood,b*0.6));
    if(l<0) fill([P(z0,u1,1),P(z1,u1,1),P(z1,u1,hT),P(z0,u1,hT)], rgb(wood,b*0.6));
    if(open){
      fill([P(z0,u0,hT),P(z0,u1,hT),P(z1,u1,hT),P(z1,u0,hT)], rgb([20,14,10],b));
      fill([P(z1,u0,hT),P(z1,u1,hT),P(z1+0.06,u1,hT-0.42),P(z1+0.06,u0,hT-0.42)], rgb(wood,b*0.75));
    } else {
      fill([P(z0,u0,hT),P(z0,u1,hT),P(z1,u1,hT),P(z1,u0,hT)], rgb(wood,b*1.15));
    }
    fill([P(z0,u0,1),P(z0,u1,1),P(z0,u1,hT),P(z0,u0,hT)], rgb(wood,b*0.95));
    if(!wire){
      ctx.strokeStyle=rgb([70,66,62],b*1.2,[1,1,1]); ctx.lineWidth=LW(z0)*1.8;
      ctx.beginPath();
      for(const u of [0.36,0.64]){ const a=P(z0,u,1), c=P(z0,u,hT); ctx.moveTo(a[0],a[1]); ctx.lineTo(c[0],c[1]); }
      const a=P(z0,u0,hT+0.08), c=P(z0,u1,hT+0.08); ctx.moveTo(a[0],a[1]); ctx.lineTo(c[0],c[1]);
      ctx.stroke();
      if(!open){ const k=P(z0,0.5,hT+0.14), r=Math.max(1.5,LW(z0)*1.6); ctx.fillStyle=rgb([220,180,80],b,[1,1,1]); ctx.fillRect(k[0]-r,k[1]-r,r*2,r*2.4); }
    }
  }

  const order=[];
  for(let k=VIEW_LAT;k>=1;k--){ order.push(-k,k); }
  order.push(0);
  for(let d=VIEW_DEPTH; d>=0; d--){
    if(d>=o.R) continue;
    for(const l of order){
      if(!V.has(d,l)) continue;
      const x=V.wx(d,l), y=V.wy(d,l);
      if(!inside(L,x,y)) continue;
      seen.push([x,y]);
      floorCeil(d,l);
      const ef=edgeAt(L,x,y,face);
      if(looksSolid(ef)){
        const z=d+1, P=frontP(z,l);
        face_(P, ef, [x,y,face], z, z, [P(0,0),P(1,0),P(1,1),P(0,1)]);
      }
      if(l<=0){
        const e=edgeAt(L,x,y,V.left);
        if(looksSolid(e)){ const P=sideP(d,2*l-1); face_(P,e,[x,y,V.left],d,d+1,[P(0,0),P(1,0),P(1,1),P(0,1)]); }
      }
      if(l>=0){
        const e=edgeAt(L,x,y,V.right);
        if(looksSolid(e)){ const P=sideP(d,2*l+1); face_(P,e,[x,y,V.right],d,d+1,[P(0,0),P(1,0),P(1,1),P(0,1)]); }
      }
      /* マスの中に立つ物は、そのマスの奥の壁より後に描く */
      if(L.down && L.down.x===x && L.down.y===y) stairs(d,l,'down');
      if(L.up && L.up.x===x && L.up.y===y) stairs(d,l,'up');
      const ch=typeof chestAt==='function' ? chestAt(L,x,y) : null;
      if(ch) chest(d,l,ch.opened);
    }
  }

  /* 松明の光の輪：周辺を落とす */
  if(!wire){
    const g=ctx.createRadialGradient(cx,cy*1.05,Math.min(W,H)*0.25,cx,cy,Math.max(W,H)*0.72);
    g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.5)');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  return seen;
}

/* 地上：星空と、丘に口を開けた迷宮の入口。松明が2本 */
function renderSurface(ctx, W, H, now){
  const sky=ctx.createLinearGradient(0,0,0,H*0.72);
  sky.addColorStop(0,'#04060d'); sky.addColorStop(1,'#1c2338');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
  for(let i=0;i<110;i++){
    const x=hash4(i,1,2,3)*W, y=hash4(i,4,5,6)*H*0.62, s=hash4(i,7,8,9);
    const a=0.25+0.75*s*(0.75+0.25*Math.sin(now/500+i*1.7));
    ctx.fillStyle=`rgba(255,248,225,${a.toFixed(3)})`;
    const r=s>0.9?2:1; ctx.fillRect(x,y,r*W/640+0.5,r*W/640+0.5);
  }
  /* 月 */
  ctx.fillStyle='#e9e2c8'; ctx.beginPath(); ctx.arc(W*0.8,H*0.17,W*0.035,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#04060d'; ctx.beginPath(); ctx.arc(W*0.812,H*0.16,W*0.031,0,Math.PI*2); ctx.fill();
  /* 遠い丘 */
  ctx.fillStyle='#0e121c'; ctx.beginPath(); ctx.moveTo(0,H);
  for(let i=0;i<=24;i++){ const x=W*i/24; ctx.lineTo(x, H*0.58 - H*0.08*Math.sin(i*0.7) - H*0.05*hash4(i,3,3,3)); }
  ctx.lineTo(W,H); ctx.fill();
  /* 入口のある丘 */
  ctx.fillStyle='#16130f'; ctx.beginPath(); ctx.moveTo(0,H);
  ctx.bezierCurveTo(W*0.15,H*0.62, W*0.32,H*0.42, W*0.5,H*0.40);
  ctx.bezierCurveTo(W*0.68,H*0.42, W*0.85,H*0.62, W,H*0.70);
  ctx.lineTo(W,H); ctx.fill();
  /* 石のアーチ */
  const ax=W*0.5, ab=H*0.86, aw=W*0.16, ah=H*0.30;
  ctx.fillStyle='#4a4136';
  ctx.beginPath(); ctx.moveTo(ax-aw*1.35,ab); ctx.lineTo(ax-aw*1.35,ab-ah); ctx.ellipse(ax,ab-ah,aw*1.35,aw*0.95,0,Math.PI,0); ctx.lineTo(ax+aw*1.35,ab); ctx.fill();
  ctx.fillStyle='#000';
  ctx.beginPath(); ctx.moveTo(ax-aw,ab); ctx.lineTo(ax-aw,ab-ah); ctx.ellipse(ax,ab-ah,aw,aw*0.7,0,Math.PI,0); ctx.lineTo(ax+aw,ab); ctx.fill();
  ctx.strokeStyle='#2a241d'; ctx.lineWidth=Math.max(1,W/400);
  ctx.beginPath();
  for(let k=1;k<5;k++){ const y=ab-ah*k/4.2; ctx.moveTo(ax-aw*1.35,y); ctx.lineTo(ax-aw,y); ctx.moveTo(ax+aw,y); ctx.lineTo(ax+aw*1.35,y); }
  ctx.stroke();
  /* 下り階段の段鼻がうっすら */
  ctx.strokeStyle='rgba(120,100,70,.35)';
  ctx.beginPath(); for(let k=0;k<4;k++){ const y=ab-H*0.02-k*H*0.035, w=aw*(0.9-k*0.12); ctx.moveTo(ax-w,y); ctx.lineTo(ax+w,y); } ctx.stroke();
  /* 地面 */
  ctx.fillStyle='#120f0c'; ctx.fillRect(0,ab,W,H-ab);
  /* 松明 */
  for(const s of [-1,1]){
    const tx=ax+s*aw*1.6, ty=ab-ah*0.55;
    const f=1+0.12*Math.sin(now/90+s)+0.08*Math.sin(now/37+s*2);
    const glow=ctx.createRadialGradient(tx,ty,0,tx,ty,W*0.16*f);
    glow.addColorStop(0,'rgba(255,170,70,.45)'); glow.addColorStop(1,'rgba(255,120,40,0)');
    ctx.fillStyle=glow; ctx.fillRect(tx-W*0.2,ty-W*0.2,W*0.4,W*0.4);
    ctx.fillStyle='#3a2a1a'; ctx.fillRect(tx-W*0.006,ty,W*0.012,H*0.12);
    ctx.fillStyle='#ffcf6a';
    ctx.beginPath(); ctx.ellipse(tx,ty-H*0.02*f,W*0.012,H*0.035*f,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff3c0';
    ctx.beginPath(); ctx.ellipse(tx,ty-H*0.012,W*0.005,H*0.014,0,0,Math.PI*2); ctx.fill();
  }
}
