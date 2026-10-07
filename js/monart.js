"use strict";
/* ============================================================
   モンスターの絵（Canvas で描く。画像ファイルは使わない）

   どの絵も「足もとが原点、背丈 100 の箱」で描き、呼び出し側が大きさを決める。
   光は手前（こちらの松明）から当たるので、面の中央が明るく縁が暗い。
   目は闇の中で光らせる。

   描き方は体つきごとに分けてある（人型・骸骨・獣・虫・竜…）。
   モンスターごとの違いは ART の表で色や頭の形を変えて出す
   ============================================================ */
const MART=(function(){
  let X=null, T=0;
  const hx=h=>{ const n=parseInt(h.slice(1),16); return [n>>16&255, n>>8&255, n&255]; };
  /* k<1 で暗く、k>1 で白に寄せる */
  function col(h,k,a){
    const c=hx(h), f=v=>Math.max(0,Math.min(255,Math.round(k>=1 ? v+(255-v)*(k-1) : v*k)));
    return a==null ? `rgb(${f(c[0])},${f(c[1])},${f(c[2])})` : `rgba(${f(c[0])},${f(c[1])},${f(c[2])},${a})`;
  }
  /* 丸みのある塗り：左上寄りが明るく、縁へ向かって暗くなる */
  function rg(h,cx,cy,r,k0,k1){
    const g=X.createRadialGradient(cx-r*0.3,cy-r*0.35,r*0.05,cx,cy,r*1.05);
    g.addColorStop(0,col(h,k0==null?1.25:k0)); g.addColorStop(1,col(h,k1==null?0.42:k1));
    return g;
  }
  function lg(h,x0,y0,x1,y1,k0,k1){
    const g=X.createLinearGradient(x0,y0,x1,y1);
    g.addColorStop(0,col(h,k0==null?1.15:k0)); g.addColorStop(1,col(h,k1==null?0.45:k1));
    return g;
  }
  function path(pts){ X.beginPath(); X.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) X.lineTo(pts[i][0],pts[i][1]); X.closePath(); }
  function shape(pts,fill,h,lw){ path(pts); X.fillStyle=fill; X.fill(); if(h){ X.strokeStyle=col(h,0.28); X.lineWidth=lw||1.2; X.stroke(); } }
  function ell(x,y,rx,ry,fill,h,rot){ X.beginPath(); X.ellipse(x,y,Math.abs(rx),Math.abs(ry),rot||0,0,Math.PI*2); X.fillStyle=fill; X.fill(); if(h){ X.strokeStyle=col(h,0.28); X.lineWidth=1.2; X.stroke(); } }
  function blob(x,y,rx,ry,h,rot){ ell(x,y,rx,ry,rg(h,x,y,Math.max(rx,ry)),h,rot); }
  function limb(x0,y0,x1,y1,w,h){
    X.lineCap='round';
    X.strokeStyle=col(h,0.3); X.lineWidth=w+2; X.beginPath(); X.moveTo(x0,y0); X.lineTo(x1,y1); X.stroke();
    X.strokeStyle=lg(h,x0-w,y0,x1+w,y1,1.15,0.6); X.lineWidth=w; X.beginPath(); X.moveTo(x0,y0); X.lineTo(x1,y1); X.stroke();
  }
  function curve(pts,w,color){
    X.lineCap='round'; X.lineJoin='round'; X.strokeStyle=color; X.lineWidth=w;
    X.beginPath(); X.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length-1;i++){ const mx=(pts[i][0]+pts[i+1][0])/2, my=(pts[i][1]+pts[i+1][1])/2; X.quadraticCurveTo(pts[i][0],pts[i][1],mx,my); }
    const l=pts[pts.length-1]; X.lineTo(l[0],l[1]); X.stroke();
  }
  /* 光る目。闇の中で最初に目に入るもの */
  function eyes(list, r, c){
    X.save(); X.shadowColor=c; X.shadowBlur=r*5;
    X.fillStyle=c; list.forEach(([x,y])=>{ X.beginPath(); X.arc(x,y,r,0,Math.PI*2); X.fill(); });
    X.shadowBlur=0; X.fillStyle='rgba(255,255,240,.9)';
    list.forEach(([x,y])=>{ X.beginPath(); X.arc(x-r*0.25,y-r*0.25,r*0.35,0,Math.PI*2); X.fill(); });
    X.restore();
  }
  function teeth(x0,x1,y,n,len,down){
    X.fillStyle='#efe6cf';
    const w=(x1-x0)/n;
    for(let i=0;i<n;i++){ X.beginPath(); X.moveTo(x0+i*w,y); X.lineTo(x0+(i+0.5)*w,y+(down?len:-len)); X.lineTo(x0+(i+1)*w,y); X.closePath(); X.fill(); }
  }
  const breathe=(ph)=>1+0.014*Math.sin(T/520+(ph||0));

  /* ---------- 武器（右手＝こちらから見て左の手に持つ） ---------- */
  function weapon(kind, x, y, s){
    s=s||1;
    X.save(); X.translate(x,y); X.scale(s,s);
    const steel='#c8ccd2', wood='#6a4a2a';
    if(kind==='sword' || kind==='greatsword'){
      const L=kind==='greatsword'?62:42;
      X.rotate(-0.35);
      limb(0,6,0,-2,3.5,wood);
      shape([[-7,-2],[7,-2],[7,-5],[-7,-5]], col('#8a7040',1), '#8a7040');
      shape([[-3.2,-5],[3.2,-5],[2.4,-L],[0,-L-6],[-2.4,-L]], lg(steel,-3,0,3,0,1.4,0.5), steel);
    } else if(kind==='axe' || kind==='greataxe'){
      const L=kind==='greataxe'?60:40;
      X.rotate(-0.3);
      limb(0,8,0,-L,3.4,wood);
      const b=kind==='greataxe'?16:11;
      shape([[0,-L+4],[-b,-L-6],[-b-3,-L+8],[-b,-L+18],[0,-L+14]], lg(steel,-b,0,0,0,1.4,0.5), steel);
      if(kind==='greataxe') shape([[0,-L+4],[b,-L-6],[b+3,-L+8],[b,-L+18],[0,-L+14]], lg(steel,0,0,b,0,1.2,0.5), steel);
    } else if(kind==='spear' || kind==='halberd'){
      X.rotate(-0.12);
      limb(0,14,0,-62,2.6,wood);
      shape([[-3,-60],[3,-60],[0,-74]], lg(steel,-3,0,3,0,1.4,0.5), steel);
      if(kind==='halberd') shape([[0,-58],[-12,-64],[-13,-52],[0,-50]], lg(steel,-12,0,0,0,1.3,0.5), steel);
    } else if(kind==='club'){
      X.rotate(-0.45);
      X.lineCap='round';
      X.strokeStyle=lg('#7a5530',-6,0,6,0,1.2,0.5); X.lineWidth=7; X.beginPath(); X.moveTo(0,6); X.lineTo(0,-24); X.stroke();
      blob(0,-30,7.5,11,'#7a5530');
    } else if(kind==='hammer'){
      X.rotate(-0.35);
      limb(0,10,0,-50,3.4,wood);
      shape([[-12,-48],[12,-48],[12,-62],[-12,-62]], lg('#b0a070',-12,0,12,0,1.3,0.45), '#b0a070');
    } else if(kind==='rock'){
      blob(0,-8,10,9,'#8a8580');
    } else if(kind==='staff'){
      limb(0,30,0,-62,2.8,'#4a3428');
      X.save(); X.shadowColor='#b070ff'; X.shadowBlur=18; ell(0,-66,5,5,'#d8b0ff'); X.restore();
    } else if(kind==='whip'){
      limb(0,6,0,-6,3,'#3a2a20');
      curve([[0,-6],[-14,-30],[-4,-56],[-26,-70],[-40,-60]],2.2,'#ffb040');
    }
    X.restore();
  }

  /* ---------- 人型 ----------
     o.skin 肌  o.cloth 衣  o.armor 鎧  o.head 頭の形  o.weapon 得物  o.bulk 肩幅  o.hunch 前屈み */
  function humanoid(o){
    const b=o.bulk||1, sk=o.skin, cl=o.cloth||'#5a4a3a', ar=o.armor;
    const hs=o.headSize||1;
    X.save(); X.scale(1,breathe(o.ph));
    // 脚
    const legW=10*b;
    limb(-8*b,-40,-10*b,-4,legW,cl); limb(8*b,-40,10*b,-4,legW,cl);
    ell(-11*b,-2,legW*0.75,4,col(o.boots||'#3a2a1e',0.9)); ell(11*b,-2,legW*0.75,4,col(o.boots||'#3a2a1e',0.9));
    // 胴
    const top=-80+(o.hunch||0), sw=19*b, ww=14*b;
    shape([[-sw,top+2],[sw,top+2],[ww+2,-40],[-ww-2,-40]], rg(ar||cl,0,top+18,30*b), ar||cl);
    if(ar){ X.strokeStyle=col(ar,0.35); X.lineWidth=1; X.beginPath(); for(let yy=top+10;yy<-42;yy+=7){ X.moveTo(-ww-1,yy); X.lineTo(ww+1,yy); } X.stroke(); }
    shape([[-ww-2,-46],[ww+2,-46],[ww+2,-40],[-ww-2,-40]], col('#3a2a1a',1), '#3a2a1a');   // 帯
    // 腕
    const ax=sw+3, hy=-42+(o.armsUp?-18:0);
    const handL=[-(ax+8*b), hy], handR=[ax+8*b, hy];
    if(o.armsForward){ handL[0]=-(ax-2); handL[1]=top+16; handR[0]=ax-2; handR[1]=top+16; }
    limb(-ax,top+6,handL[0],handL[1],8*b,ar&&!o.bareArms?ar:sk);
    limb(ax,top+6,handR[0],handR[1],8*b,ar&&!o.bareArms?ar:sk);
    blob(handL[0],handL[1],4.5*b,4.5*b,sk); blob(handR[0],handR[1],4.5*b,4.5*b,sk);
    if(o.claws){ X.strokeStyle='#e8e0c8'; X.lineWidth=1.3; [handL,handR].forEach(([x,y])=>{ for(let k=-1;k<=1;k++){ X.beginPath(); X.moveTo(x+k*2.5,y+3); X.lineTo(x+k*3.5,y+10); X.stroke(); } }); }
    // 頭
    const hy0=top-9*hs, hr=10*hs;
    head(o.head, 0, hy0, hr, o);
    // 得物
    if(o.weapon) weapon(o.weapon, handL[0], handL[1], o.wscale||Math.min(1.1, 0.8+b*0.2));
    if(o.shieldCol){ blob(handR[0]+2,handR[1]-6,9*b,12*b,o.shieldCol); }
    X.restore();
  }
  function head(kind, x, y, r, o){
    const sk=o.skin, ec=o.eye||'#ffd040';
    if(kind==='goblin'){
      shape([[x-r*0.8,y-r*0.2],[x-r*2.1,y-r*0.9],[x-r*0.9,y+r*0.35]], rg(sk,x-r*1.4,y,r), sk);
      shape([[x+r*0.8,y-r*0.2],[x+r*2.1,y-r*0.9],[x+r*0.9,y+r*0.35]], rg(sk,x+r*1.4,y,r), sk);
      blob(x,y,r,r*1.05,sk);
      ell(x,y+r*0.25,r*0.25,r*0.35,col(sk,0.75));
      X.strokeStyle=col(sk,0.25); X.lineWidth=1; X.beginPath(); X.moveTo(x-r*0.5,y+r*0.6); X.lineTo(x+r*0.5,y+r*0.6); X.stroke();
      teeth(x-r*0.45,x+r*0.45,y+r*0.6,4,r*0.2,true);
      eyes([[x-r*0.38,y-r*0.15],[x+r*0.38,y-r*0.15]], r*0.16, ec);
    } else if(kind==='orc' || kind==='troll' || kind==='ogre'){
      blob(x,y,r*1.05,r*1.1,sk);
      ell(x,y+r*0.2,r*0.42,r*0.3,col(sk,0.8));                    // 鼻面
      X.fillStyle='#2a1a10'; ell(x-r*0.15,y+r*0.25,r*0.07,r*0.1,'#2a1a10'); ell(x+r*0.15,y+r*0.25,r*0.07,r*0.1,'#2a1a10');
      shape([[x-r*0.55,y-r*0.45],[x-r*0.1,y-r*0.3],[x-r*0.55,y-r*0.28]], col(sk,0.4));   // 眉
      shape([[x+r*0.55,y-r*0.45],[x+r*0.1,y-r*0.3],[x+r*0.55,y-r*0.28]], col(sk,0.4));
      X.strokeStyle=col(sk,0.25); X.lineWidth=1.2; X.beginPath(); X.moveTo(x-r*0.5,y+r*0.62); X.lineTo(x+r*0.5,y+r*0.62); X.stroke();
      if(kind!=='troll'){ X.fillStyle='#efe6cf'; shape([[x-r*0.42,y+r*0.62],[x-r*0.32,y+r*0.25],[x-r*0.24,y+r*0.62]],'#efe6cf'); shape([[x+r*0.42,y+r*0.62],[x+r*0.32,y+r*0.25],[x+r*0.24,y+r*0.62]],'#efe6cf'); }
      else { curve([[x-r*0.6,y-r*0.9],[x-r*1.1,y-r*1.6],[x-r*0.4,y-r*2.0]],2.2,col('#2a3a20',1)); curve([[x+r*0.6,y-r*0.9],[x+r*1.2,y-r*1.4],[x+r*0.8,y-r*2.1]],2.2,col('#2a3a20',1)); teeth(x-r*0.45,x+r*0.45,y+r*0.62,5,r*0.25,true); }
      eyes([[x-r*0.35,y-r*0.12],[x+r*0.35,y-r*0.12]], r*0.13, ec);
    } else if(kind==='dog' || kind==='hyena'){
      const hy=kind==='hyena';
      shape([[x-r*0.7,y-r*0.6],[x-r*0.95,y-r*1.6],[x-r*0.2,y-r*0.85]], rg(sk,x-r*0.6,y-r,r), sk);
      shape([[x+r*0.7,y-r*0.6],[x+r*0.95,y-r*1.6],[x+r*0.2,y-r*0.85]], rg(sk,x+r*0.6,y-r,r), sk);
      blob(x,y,r,r*0.95,sk);
      blob(x,y+r*0.55,r*0.55,r*0.5,hy?'#8a6a40':sk);
      ell(x,y+r*0.3,r*0.18,r*0.13,'#1a1410');
      X.strokeStyle='#1a1410'; X.lineWidth=1.1; X.beginPath(); X.moveTo(x-r*0.4,y+r*0.8); X.quadraticCurveTo(x,y+r*1.0,x+r*0.4,y+r*0.8); X.stroke();
      teeth(x-r*0.3,x+r*0.3,y+r*0.8,3,r*0.18,false);
      if(hy){ X.fillStyle=col('#3a2a1a',1); for(let i=-2;i<=2;i++) ell(x+i*r*0.3,y-r*0.7,r*0.12,r*0.2,'#3a2a1a'); }
      eyes([[x-r*0.35,y-r*0.12],[x+r*0.35,y-r*0.12]], r*0.13, ec);
    } else if(kind==='bull'){
      curve([[x-r*0.8,y-r*0.5],[x-r*1.9,y-r*0.7],[x-r*2.0,y-r*1.7]],3.5,'#e8dcc0');
      curve([[x+r*0.8,y-r*0.5],[x+r*1.9,y-r*0.7],[x+r*2.0,y-r*1.7]],3.5,'#e8dcc0');
      blob(x,y,r*1.05,r*1.1,sk);
      blob(x,y+r*0.6,r*0.65,r*0.5,sk);
      ell(x-r*0.25,y+r*0.68,r*0.1,r*0.08,'#1a1008'); ell(x+r*0.25,y+r*0.68,r*0.1,r*0.08,'#1a1008');
      X.strokeStyle='#d8c890'; X.lineWidth=1.4; X.beginPath(); X.arc(x,y+r*0.85,r*0.22,0.2,Math.PI-0.2); X.stroke();
      eyes([[x-r*0.45,y-r*0.15],[x+r*0.45,y-r*0.15]], r*0.13, '#ff4020');
    } else if(kind==='giant' || kind==='helm' || kind==='human'){
      blob(x,y,r*0.95,r*1.1,sk);
      if(o.hair==='flame'){
        X.save(); X.shadowColor='#ff8020'; X.shadowBlur=14;
        for(let i=-3;i<=3;i++) shape([[x+i*r*0.28-r*0.18,y-r*0.7],[x+i*r*0.32,y-r*(1.6+0.25*Math.sin(T/120+i))],[x+i*r*0.28+r*0.18,y-r*0.7]], i%2?'#ffb030':'#ff6018');
        X.restore();
      } else if(o.hair){ shape([[x-r*1.0,y-r*0.1],[x-r*0.9,y-r*0.95],[x,y-r*1.2],[x+r*0.9,y-r*0.95],[x+r*1.0,y-r*0.1],[x+r*0.75,y-r*0.6],[x-r*0.75,y-r*0.6]], rg(o.hair,x,y-r,r*1.2), o.hair); }
      if(o.beard) shape([[x-r*0.8,y+r*0.2],[x+r*0.8,y+r*0.2],[x+r*0.4,y+r*1.5],[x,y+r*1.8],[x-r*0.4,y+r*1.5]], rg(o.beard,x,y+r,r), o.beard);
      if(kind==='helm'){ shape([[x-r*1.05,y+r*0.1],[x-r*1.0,y-r*0.9],[x,y-r*1.25],[x+r*1.0,y-r*0.9],[x+r*1.05,y+r*0.1]], rg(o.helmCol||'#707880',x,y-r*0.5,r*1.2), o.helmCol||'#707880'); shape([[x-r*0.8,y-r*0.2],[x+r*0.8,y-r*0.2],[x+r*0.8,y+r*0.02],[x-r*0.8,y+r*0.02]],'#0a0806'); }
      if(o.crown){ X.save(); X.shadowColor='#ffd060'; X.shadowBlur=8; shape([[x-r*0.8,y-r*0.8],[x-r*0.8,y-r*1.4],[x-r*0.4,y-r*1.05],[x,y-r*1.55],[x+r*0.4,y-r*1.05],[x+r*0.8,y-r*1.4],[x+r*0.8,y-r*0.8]], lg('#e0b040',x-r,0,x+r,0,1.3,0.5), '#e0b040'); X.restore(); }
      if(o.horns){ curve([[x-r*0.6,y-r*0.6],[x-r*1.3,y-r*1.3],[x-r*1.0,y-r*2.2]],3,'#2a1a14'); curve([[x+r*0.6,y-r*0.6],[x+r*1.3,y-r*1.3],[x+r*1.0,y-r*2.2]],3,'#2a1a14'); }
      if(kind!=='helm') eyes([[x-r*0.35,y-r*0.05],[x+r*0.35,y-r*0.05]], r*0.11, ec);
      else eyes([[x-r*0.35,y-r*0.09],[x+r*0.35,y-r*0.09]], r*0.12, ec);
    }
  }

  /* ---------- 骸骨・死者 ---------- */
  function skull(x,y,r,bone,ec){
    blob(x,y,r,r*1.05,bone);
    ell(x,y+r*0.75,r*0.6,r*0.35,rg(bone,x,y+r*0.7,r*0.6));
    ell(x-r*0.38,y,r*0.27,r*0.3,'#0a0806'); ell(x+r*0.38,y,r*0.27,r*0.3,'#0a0806');
    shape([[x-r*0.1,y+r*0.32],[x+r*0.1,y+r*0.32],[x,y+r*0.5]],'#0a0806');
    X.strokeStyle='#0a0806'; X.lineWidth=0.8; X.beginPath(); for(let i=-2;i<=2;i++){ X.moveTo(x+i*r*0.17,y+r*0.6); X.lineTo(x+i*r*0.17,y+r*0.92); } X.stroke();
    eyes([[x-r*0.38,y+r*0.02],[x+r*0.38,y+r*0.02]], r*0.11, ec||'#ff5030');
  }
  function skeleton(o){
    const bone=o.bone||'#d8d0b8', b=o.bulk||1;
    X.save(); X.scale(1,breathe(o.ph));
    limb(-7*b,-40,-9*b,-3,3.5,bone); limb(7*b,-40,9*b,-3,3.5,bone);
    blob(-9*b,-21,3.6,3.6,bone); blob(9*b,-21,3.6,3.6,bone);
    shape([[-11*b,-44],[11*b,-44],[8*b,-36],[-8*b,-36]], rg(bone,0,-40,12), bone);       // 骨盤
    limb(0,-44,0,-78,3.2,bone);                                                         // 背骨
    X.strokeStyle=col(bone,0.95); X.lineWidth=2.3; X.lineCap='round';
    for(let i=0;i<5;i++){ const yy=-74+i*5.5, w=(15-i*1.4)*b; X.beginPath(); X.moveTo(-1,yy); X.quadraticCurveTo(-w,yy+1,-w*0.85,yy+5); X.moveTo(1,yy); X.quadraticCurveTo(w,yy+1,w*0.85,yy+5); X.stroke(); }
    limb(-16*b,-78,16*b,-78,3,bone);
    const hy=o.armsUp?-62:-42;
    limb(-16*b,-78,-22*b,-60,3,bone); limb(-22*b,-60,-26*b,hy,2.6,bone);
    limb(16*b,-78,22*b,-60,3,bone); limb(22*b,-60,26*b,hy,2.6,bone);
    skull(0,-89,9.5,bone,o.eye);
    if(o.weapon) weapon(o.weapon,-26*b,hy,b);
    X.restore();
  }
  /* 衣をまとった死者（ワイト・リッチ・ナイトウォーカー） */
  function robed(o){
    const cl=o.cloth, b=o.bulk||1;
    X.save(); X.scale(1,breathe(o.ph));
    if(o.aura){ X.save(); X.globalAlpha=0.35+0.1*Math.sin(T/300); X.shadowColor=o.aura; X.shadowBlur=40; ell(0,-50,34*b,52,col(o.aura,0.6,0.25)); X.restore(); }
    const pts=[[-14*b,-82],[14*b,-82],[22*b,-40],[30*b,0]];
    for(let i=0;i<=8;i++) pts.push([30*b-i*7.5*b, (i%2?-6:0)-3*Math.sin(T/400+i)]);
    pts.push([-22*b,-40]);
    shape(pts, rg(cl,0,-45,48*b,1.15,0.25), cl);
    const hy=o.armsUp?-74:-50;
    limb(-14*b,-78,-26*b,hy,7*b,cl); limb(14*b,-78,26*b,hy,7*b,cl);
    const hand=o.hand||'#c8c0a8';
    X.strokeStyle=hand; X.lineWidth=1.4; X.lineCap='round';
    [[-26*b,hy],[26*b,hy]].forEach(([x,y])=>{ for(let k=-1;k<=1;k++){ X.beginPath(); X.moveTo(x,y); X.lineTo(x+k*3,y+8); X.stroke(); } });
    // 頭巾の中の顔
    shape([[-13*b,-78],[-12*b,-96],[0,-106],[12*b,-96],[13*b,-78],[0,-72]], rg(cl,0,-92,16,1.05,0.3), cl);
    if(o.face==='skull') skull(0,-88,7.5,'#d0c8b0',o.eye);
    else { ell(0,-88,8,9,'#060406'); eyes([[-3.2,-89],[3.2,-89]],1.6,o.eye||'#80c0ff'); }
    if(o.crown){ X.save(); X.shadowColor='#ffd060'; X.shadowBlur=8; shape([[-9,-99],[-9,-106],[-5,-102],[0,-109],[5,-102],[9,-106],[9,-99]], lg('#e0b040',-9,0,9,0,1.3,0.5), '#e0b040'); X.restore(); }
    if(o.weapon) weapon(o.weapon,-26*b,hy,b);
    X.restore();
  }
  function vampire(o){
    X.save(); X.scale(1,breathe(o.ph));
    // 外套（内側が赤）
    shape([[-14,-80],[-40,-4],[-24,0],[0,-46],[24,0],[40,-4],[14,-80]], rg('#1a1018',0,-40,50,1.6,0.3), '#1a1018');
    shape([[-12,-78],[-30,-6],[-20,-4],[0,-44],[20,-4],[30,-6],[12,-78]], rg('#7a1018',0,-40,40,1.2,0.35));
    limb(-6,-42,-7,-3,8,'#1a1418'); limb(6,-42,7,-3,8,'#1a1418');
    shape([[-13,-80],[13,-80],[10,-42],[-10,-42]], rg('#2a2028',0,-60,22), '#2a2028');
    shape([[-4,-80],[4,-80],[0,-64]], '#e8e0d8');
    limb(-14,-76,-24,-50,6.5,'#2a2028'); limb(14,-76,24,-50,6.5,'#2a2028');
    blob(-24,-49,3.5,3.5,'#e0d8d0'); blob(24,-49,3.5,3.5,'#e0d8d0');
    shape([[-18,-80],[-22,-100],[-10,-86]], col('#1a1018',1)); shape([[18,-80],[22,-100],[10,-86]], col('#1a1018',1));   // 立襟
    blob(0,-89,8.5,10,'#e8e0d8');
    shape([[-9,-92],[-8,-101],[0,-104],[8,-101],[9,-92],[0,-97]], '#14100e');
    shape([[-2.4,-82],[-1.4,-82],[-1.9,-78.5]],'#ffffff'); shape([[1.4,-82],[2.4,-82],[1.9,-78.5]],'#ffffff');
    eyes([[-3.2,-89],[3.2,-89]],1.4,'#ff2020');
    X.restore();
  }

  /* ---------- 獣・虫 ---------- */
  function rat(o){
    const c=o.c||'#5a4a3e';
    X.save(); X.scale(1,breathe(o.ph));
    curve([[30,-10],[52,-6],[62,-20],[70,-12]],2.5,col('#c8a0a0',0.8));
    blob(8,-22,30,20,c);
    blob(-24,-26,15,13,c);
    shape([[-32,-26],[-48,-20],[-34,-18]], rg(c,-40,-22,10), c);
    ell(-47,-20,2.2,2,'#2a1010');
    blob(-20,-38,5,6,'#a07070'); blob(-30,-37,5,6,'#a07070');
    limb(-8,-6,-12,0,4,c); limb(22,-6,24,0,4,c);
    X.strokeStyle='#d8c8b8'; X.lineWidth=0.6; X.beginPath(); for(let k=-1;k<=1;k++){ X.moveTo(-44,-21); X.lineTo(-58,-24+k*4); } X.stroke();
    eyes([[-34,-29]],2,'#ff3020');
    X.restore();
  }
  function centipede(o){
    const c=o.c||'#7a3a20';
    X.save();
    const segs=[];
    for(let i=0;i<11;i++){ const t=i/10; segs.push([ -40+80*t + 6*Math.sin(T/300+i*0.7), -8 - 70*Math.pow(1-t,1.6)*0.9 ]); }
    for(let i=segs.length-1;i>=0;i--){
      const [x,y]=segs[i], r=9-i*0.35;
      X.strokeStyle=col(c,0.4); X.lineWidth=1.2;
      for(const s of [-1,1]){ X.beginPath(); X.moveTo(x,y); X.lineTo(x+s*(r+8),y+6+2*Math.sin(T/150+i)); X.lineTo(x+s*(r+11),y+12); X.stroke(); }
      blob(x,y,r*1.2,r,c);
    }
    const [hx2,hy2]=segs[0];
    blob(hx2,hy2-2,10,9,c);
    curve([[hx2-6,hy2+4],[hx2-12,hy2+12],[hx2-6,hy2+16]],2,'#e0d0a0');
    curve([[hx2+6,hy2+4],[hx2+12,hy2+12],[hx2+6,hy2+16]],2,'#e0d0a0');
    curve([[hx2-4,hy2-8],[hx2-14,hy2-24],[hx2-24,hy2-28]],1.2,col(c,0.7));
    curve([[hx2+4,hy2-8],[hx2+14,hy2-24],[hx2+24,hy2-28]],1.2,col(c,0.7));
    eyes([[hx2-4,hy2-3],[hx2+4,hy2-3]],1.6,'#ffe060');
    X.restore();
  }
  function ant(o){
    const c=o.c||'#1e1a1c';
    X.save(); X.scale(1,breathe(o.ph));
    for(const s of [-1,1]) for(let i=0;i<3;i++){
      X.strokeStyle=col(c,1.18); X.lineWidth=2.2; X.lineCap='round';
      X.beginPath(); X.moveTo(s*8,-28+i*4); X.lineTo(s*(28+i*6),-40+i*6); X.lineTo(s*(36+i*8),-2); X.stroke();
    }
    blob(0,-22,22,18,c);                 // 腹
    blob(0,-38,11,10,c);                 // 胸
    blob(0,-54,14,12,c);                 // 頭
    curve([[-5,-63],[-16,-80],[-26,-84]],1.6,col(c,1.25));
    curve([[5,-63],[16,-80],[26,-84]],1.6,col(c,1.25));
    shape([[-8,-46],[-14,-38],[-4,-42]],'#8a7a5a'); shape([[8,-46],[14,-38],[4,-42]],'#8a7a5a');
    eyes([[-7,-56],[7,-56]],2.4,'#ff6020');
    X.restore();
  }
  function spider(o){
    const c=o.c||'#18141a';
    X.save(); X.scale(1,breathe(o.ph));
    X.strokeStyle=col(c,0.6); X.lineWidth=0.6; X.beginPath(); X.moveTo(0,-200); X.lineTo(0,-58); X.stroke();
    for(const s of [-1,1]) for(let i=0;i<4;i++){
      const a=-0.9+i*0.55, k=Math.sin(T/220+i*1.3)*2;
      X.strokeStyle=col(c,1.3); X.lineWidth=3; X.lineCap='round'; X.lineJoin='round';
      X.beginPath(); X.moveTo(s*10,-30); X.lineTo(s*(34+i*4),-62+i*12+k); X.lineTo(s*(50+i*6),-2+i*1); X.stroke();
    }
    blob(0,-48,26,22,c);
    X.save(); X.globalAlpha=0.5; shape([[-8,-60],[8,-60],[0,-40]],'#a01818'); X.restore();   // 砂時計の紋
    blob(0,-24,14,12,c);
    eyes([[-6,-26],[6,-26],[-3,-30],[3,-30],[-9,-21],[9,-21]],1.6,'#ff2010');
    shape([[-5,-14],[-3,-6],[-1,-14]],'#c0b090'); shape([[5,-14],[3,-6],[1,-14]],'#c0b090');
    X.restore();
  }
  function owlbear(o){
    const c=o.c||'#5a4028';
    X.save(); X.scale(1,breathe(o.ph));
    limb(-14,-34,-16,-4,16,c); limb(14,-34,16,-4,16,c);
    blob(0,-48,30,30,c);
    limb(-26,-62,-40,-30,13,c); limb(26,-62,40,-30,13,c);
    X.strokeStyle='#e8dcc0'; X.lineWidth=1.6; [[-40,-30],[40,-30]].forEach(([x,y])=>{ for(let k=-1;k<=1;k++){ X.beginPath(); X.moveTo(x+k*4,y+4); X.lineTo(x+k*5,y+12); X.stroke(); } });
    blob(0,-84,19,17,'#8a6a40');
    for(let i=-2;i<=2;i++) shape([[i*8-4,-96],[i*8,-108-Math.abs(i)*-2],[i*8+4,-96]], '#6a4a2a');
    ell(-8,-86,8,8,'#e8dcc0'); ell(8,-86,8,8,'#e8dcc0');
    eyes([[-8,-86],[8,-86]],3.4,'#ffb020');
    shape([[-4,-80],[4,-80],[0,-70]],'#2a2420');
    X.restore();
  }
  function cockatrice(o){
    X.save(); X.scale(1,breathe(o.ph));
    curve([[16,-20],[40,-10],[46,-34],[30,-46],[44,-60]],7,'#4a6a3a');
    limb(-6,-22,-8,-2,3,'#d0a030'); limb(6,-22,8,-2,3,'#d0a030');
    blob(0,-34,20,16,'#b08850');
    shape([[-14,-40],[-44,-60],[-36,-30],[-16,-28]], rg('#8a6a40',-28,-44,20), '#8a6a40');
    shape([[14,-40],[44,-60],[36,-30],[16,-28]], rg('#8a6a40',28,-44,20), '#8a6a40');
    limb(0,-46,-2,-62,9,'#b08850');
    blob(-2,-68,9,8,'#b08850');
    shape([[-6,-76],[-4,-86],[-1,-78],[2,-88],[4,-77],[8,-82],[6,-74]],'#d02818');
    shape([[-10,-68],[-20,-65],[-10,-63]],'#e0b030');
    ell(-4,-60,3,4,'#c02010');
    eyes([[-5,-70]],1.8,'#ff2010');
    X.restore();
  }
  function basilisk(o){
    const c=o.c||'#4a5a2a';
    X.save(); X.scale(1,breathe(o.ph));
    curve([[30,-12],[55,-10],[66,-4],[78,-6]],8,col(c,0.8));
    for(let i=0;i<4;i++){ const x=-28+i*18; limb(x,-12,x-6,-1,5,c); }
    blob(10,-16,36,13,c);
    for(let i=0;i<7;i++) shape([[ -20+i*8,-26],[-16+i*8,-34],[-12+i*8,-26]], col(c,0.6));
    blob(-34,-20,14,11,c);
    shape([[-44,-16],[-58,-14],[-44,-10]], col(c,0.7));
    eyes([[-38,-24],[-30,-24]],2.6,'#60ff60');
    X.restore();
  }
  function stirge(o){
    X.save();
    const f=Math.sin(T/60)*0.35;
    for(const s of [-1,1]){
      X.save(); X.translate(s*6,-48); X.rotate(s*(0.2+f));
      shape([[0,0],[s*34,-22],[s*42,-4],[s*30,2],[s*36,12],[s*14,6]], rg('#5a3a3a',s*20,-4,26,1.2,0.35), '#5a3a3a');
      X.restore();
    }
    blob(0,-46,9,11,'#6a4a3a');
    limb(-2,-38,-3,-26,2,'#5a3a2a'); limb(2,-38,3,-26,2,'#5a3a2a');
    shape([[-2,-54],[2,-54],[0,-82]],'#c08080');
    eyes([[-3.5,-52],[3.5,-52]],1.8,'#ffd030');
    X.restore();
  }
  function gargoyle(o){
    const c=o.c||'#6a6a6e';
    X.save(); X.scale(1,breathe(o.ph));
    for(const s of [-1,1]) shape([[s*10,-70],[s*52,-96],[s*60,-60],[s*46,-64],[s*48,-40],[s*34,-48],[s*18,-46]], rg(c,s*36,-66,30,1.1,0.3), c);
    limb(-10,-30,-16,-2,10,c); limb(10,-30,16,-2,10,c);
    blob(0,-46,18,20,c);
    limb(-14,-58,-24,-34,7,c); limb(14,-58,24,-34,7,c);
    blob(0,-72,11,10,c);
    curve([[-6,-79],[-12,-90],[-8,-96]],2.4,col(c,0.6)); curve([[6,-79],[12,-90],[8,-96]],2.4,col(c,0.6));
    teeth(-5,5,-67,4,2.5,true);
    eyes([[-4,-74],[4,-74]],1.8,'#ff5020');
    X.restore();
  }
  /* 竜（ワイバーンも）。正面から：翼を広げ、首をもたげる */
  function dragon(o){
    const c=o.c, b=o.belly||'#d8a060';
    X.save(); X.scale(1,breathe(o.ph));
    const fl=Math.sin(T/700)*3;
    for(const s of [-1,1]){
      const pts=[[s*16,-58],[s*48,-96+fl],[s*92,-108+fl],[s*86,-80],[s*96,-62],[s*76,-58],[s*80,-38],[s*58,-40],[s*48,-26],[s*24,-36]];
      shape(pts, rg(c,s*60,-70,50,1.0,0.25), c);
      X.strokeStyle=col(c,0.3); X.lineWidth=1.4; X.beginPath();
      [[86,-80],[76,-58],[58,-40]].forEach(([x,y])=>{ X.moveTo(s*48,-96+fl); X.lineTo(s*x,y); });
      X.stroke();
    }
    if(o.stinger) curve([[18,-10],[44,-4],[56,-22],[48,-40]],6,col(c,0.8));
    limb(-14,-24,-20,-2,11,c); limb(14,-24,20,-2,11,c);
    blob(0,-38,24,26,c);
    ell(0,-36,13,20,rg(b,0,-36,18,1.1,0.5));
    X.strokeStyle=col(b,0.5); X.lineWidth=0.8; X.beginPath(); for(let yy=-52;yy<-20;yy+=5){ X.moveTo(-11,yy); X.lineTo(11,yy); } X.stroke();
    if(!o.wyvern){ limb(-18,-50,-26,-30,7,c); limb(18,-50,26,-30,7,c); }
    // 首と頭
    limb(0,-58,0,-80,13,c);
    blob(0,-90,14,12,c);
    shape([[-9,-84],[9,-84],[6,-70],[-6,-70]], rg(c,0,-78,10), c);   // 口吻
    curve([[-8,-98],[-16,-108],[-14,-118]],3,'#d8ccb0'); curve([[8,-98],[16,-108],[14,-118]],3,'#d8ccb0');
    if(o.fire){
      const g=X.createRadialGradient(0,-72,1,0,-72,12);
      g.addColorStop(0,'rgba(255,240,160,.95)'); g.addColorStop(1,'rgba(255,90,20,0)');
      X.fillStyle=g; X.fillRect(-14,-86,28,28);
    }
    teeth(-6,6,-72,4,2.4,true);
    eyes([[-6,-92],[6,-92]],2.2,o.eye||'#ffd030');
    X.restore();
  }
  function demon(o){
    const c=o.c;
    X.save(); X.scale(1,breathe(o.ph));
    if(o.flames){ X.save(); X.globalAlpha=0.5+0.15*Math.sin(T/90); const g=X.createRadialGradient(0,-60,10,0,-60,80); g.addColorStop(0,'rgba(255,140,40,.6)'); g.addColorStop(1,'rgba(255,60,0,0)'); X.fillStyle=g; X.fillRect(-90,-150,180,160); X.restore(); }
    for(const s of [-1,1]) shape([[s*12,-74],[s*60,-118],[s*88,-100],[s*74,-84],[s*82,-60],[s*58,-66],[s*54,-44],[s*20,-56]], rg('#2a1414',s*50,-80,40,1.4,0.3), '#2a1414');
    humanoid({skin:c, cloth:'#2a1818', armor:null, head:'giant', horns:true, bulk:1.25, weapon:o.weapon, eye:'#ffe040', claws:true, bareArms:true, ph:o.ph});
    X.restore();
  }
  function golem(o){
    const c=o.c;
    X.save(); X.scale(1,breathe(o.ph)*0.998);
    const R_=(x,y,w,h)=>shape([[x,y],[x+w,y],[x+w,y+h],[x,y+h]], lg(c,x,y,x+w,y+h,1.3,0.4), c, 1.6);
    R_(-24,-44,18,42); R_(6,-44,18,42);
    R_(-30,-86,60,44);
    R_(-46,-84,15,40); R_(31,-84,15,40);
    R_(-48,-46,19,14); R_(29,-46,19,14);
    R_(-13,-106,26,22);
    X.strokeStyle=col(c,0.3); X.lineWidth=1; X.beginPath(); X.moveTo(-30,-64); X.lineTo(30,-64); X.moveTo(0,-86); X.lineTo(0,-42); X.stroke();
    shape([[-9,-98],[9,-98],[9,-94],[-9,-94]], o.eye||'#ffb030');
    X.save(); X.shadowColor=o.eye||'#ffb030'; X.shadowBlur=12; shape([[-9,-98],[9,-98],[9,-94],[-9,-94]], o.eye||'#ffb030'); X.restore();
    X.restore();
  }
  function hydra(o){
    const c=o.c||'#3a6a4a', n=o.heads||5;
    X.save(); X.scale(1,breathe(o.ph));
    blob(0,-26,40,26,c);
    limb(-24,-14,-30,-2,10,c); limb(24,-14,30,-2,10,c);
    for(let i=0;i<n;i++){
      const a=-0.95+i*(1.9/(n-1)), sw=Math.sin(T/400+i*1.7)*4;
      const ex=Math.sin(a)*58+sw, ey=-60-Math.cos(a)*36;
      curve([[Math.sin(a)*14,-40],[Math.sin(a)*30,-60],[ex,ey]],9,c);
      blob(ex,ey-4,9,7,c);
      shape([[ex-6,ey],[ex+6,ey],[ex,ey+8]], col(c,0.6));
      eyes([[ex-3.5,ey-6],[ex+3.5,ey-6]],1.4,'#ffd030');
    }
    X.restore();
  }
  function beholder(o){
    X.save();
    const fy=-56+Math.sin(T/500)*4, c='#7a4a6a';
    for(let i=0;i<8;i++){
      const a=-2.6+i*0.74, ex=Math.cos(a)*48, ey=fy+Math.sin(a)*48-6;
      curve([[Math.cos(a)*20,fy+Math.sin(a)*20],[Math.cos(a)*36+Math.sin(T/300+i)*3,fy+Math.sin(a)*34],[ex,ey]],2.6,col(c,0.8));
      blob(ex,ey,4.5,4.5,'#d8c8b8'); eyes([[ex,ey]],1.8,'#40c0ff');
    }
    blob(0,fy,34,32,c);
    ell(0,fy-6,14,11,'#f0ead8'); ell(0,fy-6,7,8,'#30a0d0'); ell(0,fy-6,3,6,'#080608');
    X.strokeStyle=col(c,0.3); X.lineWidth=1.6; X.beginPath(); X.moveTo(-18,fy+12); X.quadraticCurveTo(0,fy+24,18,fy+12); X.stroke();
    teeth(-14,14,fy+15,7,4,false);
    X.restore();
  }
  function worm(o){
    const c=o.c||'#5a3a7a';
    X.save();
    const sw=Math.sin(T/600)*5;
    shape([[-36,0],[-34,-60],[-26+sw,-96],[26+sw,-96],[34,-60],[36,0]], lg(c,-36,0,36,0,1.2,0.35), c);
    X.strokeStyle=col(c,0.35); X.lineWidth=1.4; X.beginPath(); for(let yy=-86;yy<0;yy+=10){ X.moveTo(-34,yy); X.quadraticCurveTo(sw,yy+5,34,yy); } X.stroke();
    ell(sw,-96,27,18,rg(c,sw,-96,27));
    ell(sw,-96,19,13,'#2a0a14');
    for(let i=0;i<14;i++){ const a=i/14*Math.PI*2; shape([[sw+Math.cos(a)*19,-96+Math.sin(a)*13],[sw+Math.cos(a+0.2)*19,-96+Math.sin(a+0.2)*13],[sw+Math.cos(a+0.1)*12,-96+Math.sin(a+0.1)*8]],'#e8e0c8'); }
    X.restore();
  }
  function marilith(o){
    X.save(); X.scale(1,breathe(o.ph));
    curve([[40,-6],[10,-2],[-30,-8],[-40,-24],[-14,-34],[8,-40]],20,'#3a6a3a');
    X.strokeStyle='rgba(200,220,150,.25)'; X.lineWidth=1; X.beginPath(); for(let i=0;i<8;i++){ X.moveTo(-36+i*10,-4); X.lineTo(-30+i*10,-14); } X.stroke();
    blob(4,-56,13,16,'#3a6a3a');
    shape([[-10,-62],[16,-62],[13,-82],[-7,-82]], rg('#a07060',3,-72,14), '#a07060');
    for(let i=0;i<3;i++){ for(const s of [-1,1]){
      const ay=-78+i*8, ex=s*(30+i*4), ey=ay-14+i*10+Math.sin(T/250+i+s)*3;
      limb(3+s*8,ay,3+ex,ey,4.5,'#a07060'); weapon('sword',3+ex,ey,0.7);
    } }
    blob(3,-90,8,9,'#a07060');
    shape([[-6,-96],[3,-102],[12,-96],[14,-80],[10,-88],[-4,-88],[-8,-80]],'#1a1410');
    eyes([[0,-90],[6,-90]],1.3,'#ffe040');
    X.restore();
  }

  /* ---------- モンスターごとの描き方 ----------
     p：描き方  h：背丈（100＝人の大きさ）  o：色や形 */
  const ART={
    rat:{p:rat,h:34}, kobold:{p:humanoid,h:62,o:{skin:'#8a5a3a',cloth:'#4a3a2a',head:'dog',weapon:'spear',bulk:0.8,eye:'#ff5020'}},
    goblin:{p:humanoid,h:64,o:{skin:'#6f8a3a',cloth:'#5a4430',armor:'#4a3a2a',head:'goblin',weapon:'sword',bulk:0.82,headSize:1.15}},
    skel:{p:skeleton,h:96,o:{weapon:'sword'}},
    centi:{p:centipede,h:56,o:{c:'#8a3a1c'}},
    orc:{p:humanoid,h:92,o:{skin:'#7c8a5a',cloth:'#4a3a2a',armor:'#5a4630',head:'orc',weapon:'axe',bulk:1.05}},
    stirge:{p:stirge,h:60},
    hobgob:{p:humanoid,h:96,o:{skin:'#b0603a',cloth:'#3a2a20',armor:'#7a2a20',head:'goblin',weapon:'sword',bulk:1.1,shieldCol:'#6a2a1a'}},
    zombie:{p:humanoid,h:94,o:{skin:'#7a8a6a',cloth:'#4a4438',head:'human',armsForward:true,bulk:1.0,eye:'#e0e0a0',hunch:4}},
    gnoll:{p:humanoid,h:104,o:{skin:'#a08050',cloth:'#4a3a28',armor:'#6a5030',head:'hyena',weapon:'halberd',bulk:1.1}},
    ghoul:{p:humanoid,h:88,o:{skin:'#8a9080',cloth:'#3a3430',head:'troll',claws:true,bulk:0.9,hunch:8,eye:'#ffe0a0',armsUp:true}},
    ant:{p:ant,h:60}, spider:{p:spider,h:70},
    ogre:{p:humanoid,h:128,o:{skin:'#a08a5a',cloth:'#5a4430',head:'ogre',weapon:'club',bulk:1.45,headSize:1.2}},
    gargo:{p:gargoyle,h:96},
    wight:{p:robed,h:104,o:{cloth:'#2a2a30',face:'skull',eye:'#80d0ff',armsUp:true}},
    owlbear:{p:owlbear,h:112},
    cocka:{p:cockatrice,h:70},
    troll:{p:humanoid,h:132,o:{skin:'#4f7a4a',cloth:'#3a3020',head:'troll',claws:true,bulk:1.15,hunch:6,eye:'#ffe060'}},
    mino:{p:humanoid,h:132,o:{skin:'#5a3a26',cloth:'#3a2418',armor:'#4a3a2a',head:'bull',weapon:'greataxe',bulk:1.35,bareArms:true}},
    basil:{p:basilisk,h:62},
    hillg:{p:humanoid,h:150,o:{skin:'#b08a60',cloth:'#5a4a30',head:'giant',hair:'#4a3020',beard:'#4a3020',weapon:'club',bulk:1.55,headSize:1.25}},
    vamp:{p:vampire,h:104},
    wyvern:{p:dragon,h:120,o:{c:'#4a5a3a',belly:'#a0a060',wyvern:true,stinger:true}},
    ydrag:{p:dragon,h:130,o:{c:'#a03020',fire:true}},
    lich:{p:robed,h:108,o:{cloth:'#3a2048',face:'skull',crown:true,weapon:'staff',aura:'#9050ff',eye:'#b080ff'}},
    stoneg:{p:humanoid,h:156,o:{skin:'#8a8a86',cloth:'#5a5a58',head:'giant',weapon:'rock',bulk:1.6,eye:'#a0e0ff',headSize:1.25}},
    hydra:{p:hydra,h:120,o:{heads:5}},
    behold:{p:beholder,h:110},
    fireg:{p:humanoid,h:158,o:{skin:'#3a3030',cloth:'#2a2020',armor:'#3a2a24',head:'giant',hair:'flame',weapon:'greatsword',bulk:1.6,eye:'#ffb030',headSize:1.2}},
    pitf:{p:demon,h:150,o:{c:'#8a2018',weapon:'greatsword'}},
    balor:{p:demon,h:156,o:{c:'#5a1a10',weapon:'whip',flames:true}},
    adrag:{p:dragon,h:150,o:{c:'#b02818',fire:true}},
    sgolem:{p:golem,h:140,o:{c:'#8a8478'}},
    dknight:{p:skeleton,h:110,o:{bone:'#3a3a40',weapon:'greatsword',eye:'#60ff80',bulk:1.2}},
    pworm:{p:worm,h:150},
    stormg:{p:humanoid,h:162,o:{skin:'#8aa0b8',cloth:'#3a4a6a',armor:'#5a6a8a',head:'giant',hair:'#d0d8e0',beard:'#d0d8e0',weapon:'greatsword',bulk:1.6,eye:'#c0f0ff',headSize:1.2}},
    marilith:{p:marilith,h:130},
    nightw:{p:robed,h:160,o:{cloth:'#0e0c14',face:'void',eye:'#f0f0ff',bulk:1.4,aura:'#5030a0'}},
    igolem:{p:golem,h:150,o:{c:'#6a6a74',eye:'#ff6030',vapor:true}},
    titan:{p:humanoid,h:170,o:{skin:'#d8b890',cloth:'#e0d0b0',armor:'#c8a040',head:'giant',hair:'#e8d8a0',beard:'#e8d8a0',crown:true,weapon:'hammer',bulk:1.65,eye:'#80d0ff',headSize:1.2}},
    anddrag:{p:dragon,h:170,o:{c:'#c03018',fire:true,eye:'#fff080'}},
    archlich:{p:robed,h:112,o:{cloth:'#241030',face:'skull',crown:true,weapon:'staff',aura:'#c040ff',eye:'#ff60ff'}}
  };

  /* 1体を描く。x,y＝足もとの画面座標、unit＝背丈100あたりの画素数 */
  function draw(ctx, id, x, y, unit, opts){
    opts=opts||{};
    const a=ART[id] || {p:humanoid,h:90,o:{skin:'#808080',head:'human'}};
    X=ctx; T=(opts.t||0);
    const k=unit*a.h/100/100;
    ctx.save();
    ctx.translate(x,y);
    /* 足もとの影 */
    ctx.fillStyle='rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(0,0,unit*0.38*Math.max(0.6,a.h/100),unit*0.06,0,0,Math.PI*2); ctx.fill();
    ctx.scale(k,k);
    if(opts.dim!=null && opts.dim<1) ctx.filter=`brightness(${Math.round(opts.dim*100)}%)`;
    a.p(Object.assign({ph:opts.ph||0}, a.o||{}));
    ctx.restore();
    ctx.filter='none';
  }
  return {draw, ART, height:id=>(ART[id]||{h:90}).h};
})();
