"use strict";
/* ============================================================
   方眼の迷路（1マス＝10フィート四方）
   壁はマスの間の「辺」に持たせる（Wizardry 式の薄い壁）。

   作り方：
     1. 部屋を散らす（互いに1マス以上離す）
     2. 残りのマスを曲がりくねった通路で埋める
     3. 部屋と通路を最小限の扉でつなぎ、部屋によっては扉をもう1つ足す（隠し扉もここで作る）
     4. 行き止まりを何度か埋め戻して岩盤にする（迷宮ごとの回数で通路の密度が変わる）
     5. 上り階段のある部屋から最も遠い部屋に下り階段を置く
   隠し扉は「もう1つ足した扉」にしか使わないので、見つけなくても必ず下り階段まで行ける。
   ============================================================ */
const E_OPEN=0, E_WALL=1, E_DOOR=2, E_SECRET=3, E_FOUND=4;   // E_FOUND＝見つけた隠し扉（以後は扉として通れる）
const DX=[0,1,0,-1], DY=[-1,0,1,0];
const DIRN=['北','東','南','西'];

function isPass(e){ return e===E_OPEN || e===E_DOOR || e===E_FOUND; }
function isDoor(e){ return e===E_DOOR || e===E_FOUND; }
/* 見た目が壁（隠し扉は見つけるまで壁にしか見えない） */
function looksSolid(e){ return e!==E_OPEN; }

function edgeIdx(L,x,y,d){
  if(d===0) return ['h', y*L.w+x];
  if(d===2) return ['h', (y+1)*L.w+x];
  if(d===3) return ['v', y*(L.w+1)+x];
  return ['v', y*(L.w+1)+x+1];
}
function edgeAt(L,x,y,d){
  if(x<0||y<0||x>=L.w||y>=L.h) return E_WALL;
  const [k,i]=edgeIdx(L,x,y,d);
  return k==='h' ? L.hw[i] : L.vw[i];
}
function setEdge(L,x,y,d,v){
  const [k,i]=edgeIdx(L,x,y,d);
  if(k==='h') L.hw[i]=v; else L.vw[i]=v;
}
function inside(L,x,y){ return x>=0 && y>=0 && x<L.w && y<L.h; }

function genLevel(dg, floorNo, seed){
  srand(seed);
  const T=THEMES[dg.id], w=T.size, h=T.size;
  const isLast = floorNo>=dg.floors;
  const L={w, h, floorNo,
    hw:new Array((h+1)*w).fill(E_WALL), vw:new Array(h*(w+1)).fill(E_WALL),
    room:new Array(w*h).fill(-1), seen:new Array(w*h).fill(0),
    rooms:[], up:null, down:null, goal:-1};
  const I=(x,y)=>y*w+x;
  const reg=new Array(w*h).fill(-1);

  /* 1. 部屋 */
  const target=Math.round(w*h/34);
  for(let a=0; a<400 && L.rooms.length<target; a++){
    const rw=ri(2,5), rh=ri(2,5);
    if(rw*rh>12 && chance(.5)) continue;          // 大部屋は少なめに
    const rx=ri(0,w-rw), ry=ri(0,h-rh);
    if(L.rooms.some(r=> rx<=r.x+r.w && rx+rw>=r.x && ry<=r.y+r.h && ry+rh>=r.y)) continue;
    const id=L.rooms.length;
    L.rooms.push({x:rx, y:ry, w:rw, h:rh, k:null, seen:false});
    for(let y=ry; y<ry+rh; y++) for(let x=rx; x<rx+rw; x++){
      reg[I(x,y)]=id; L.room[I(x,y)]=id;
      if(x+1<rx+rw) setEdge(L,x,y,1,E_OPEN);
      if(y+1<ry+rh) setEdge(L,x,y,2,E_OPEN);
    }
  }
  const nRooms=L.rooms.length;

  /* 2. 通路（伸ばしかけの枝を優先して掘る＝長くうねる通路になる） */
  let nreg=nRooms;
  for(const s of shuffle([...Array(w*h).keys()])){
    if(reg[s]!==-1) continue;
    const rid=nreg++;
    reg[s]=rid;
    const open=[[s%w, (s/w)|0, -1]];
    while(open.length){
      const k = chance(.85) ? open.length-1 : ri(0,open.length-1);
      const [x,y,ld]=open[k];
      const dirs=[];
      for(let d=0; d<4; d++){
        const nx=x+DX[d], ny=y+DY[d];
        if(inside(L,nx,ny) && reg[I(nx,ny)]===-1) dirs.push(d);
      }
      if(!dirs.length){ open.splice(k,1); continue; }
      const d = (ld>=0 && dirs.includes(ld) && chance(T.straight)) ? ld : pick(dirs);
      setEdge(L,x,y,d,E_OPEN);
      reg[I(x+DX[d], y+DY[d])]=rid;
      open.push([x+DX[d], y+DY[d], d]);
    }
  }

  /* 3. つなぐ */
  const parent=[...Array(nreg).keys()];
  const find=a=>{ while(parent[a]!==a){ parent[a]=parent[parent[a]]; a=parent[a]; } return a; };
  const conns=[];
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    const a=reg[I(x,y)];
    if(x+1<w && reg[I(x+1,y)]!==a) conns.push({x, y, d:1, a, b:reg[I(x+1,y)]});
    if(y+1<h && reg[I(x,y+1)]!==a) conns.push({x, y, d:2, a, b:reg[I(x,y+1)]});
  }
  shuffle(conns);
  const isRoom=r=>r<nRooms;
  for(const c of conns){
    const ra=find(c.a), rb=find(c.b);
    if(ra===rb) continue;
    parent[ra]=rb; c.used=true;
    setEdge(L,c.x,c.y,c.d, (isRoom(c.a)||isRoom(c.b)) ? E_DOOR : E_OPEN);
  }
  /* 部屋に2つ目の扉。4つに1つは隠し扉 */
  for(let r=0; r<nRooms; r++){
    if(!chance(T.loops)) continue;
    const cand=conns.filter(c=>!c.used && (c.a===r||c.b===r));
    if(!cand.length) continue;
    const c=pick(cand); c.used=true;
    setEdge(L,c.x,c.y,c.d, chance(.25) ? E_SECRET : E_DOOR);
  }
  /* 通路どうしの抜け道を少し（ぐるりと回れる箇所ができる） */
  const mm=conns.filter(c=>!c.used && !isRoom(c.a) && !isRoom(c.b));
  for(let k=ri(1,3); k>0 && mm.length; k--){ const c=mm.splice(ri(0,mm.length-1),1)[0]; setEdge(L,c.x,c.y,c.d,E_OPEN); }

  /* 4. 行き止まりの埋め戻し（隠し扉も「通れる辺」と数え、その先の通路は残す） */
  const exits=(x,y)=>{ let n=0; for(let d=0; d<4; d++) if(edgeAt(L,x,y,d)!==E_WALL) n++; return n; };
  for(let pass=0; pass<T.sparse; pass++){
    const dead=[];
    for(let y=0; y<h; y++) for(let x=0; x<w; x++)
      if(L.room[I(x,y)]===-1 && reg[I(x,y)]!==-1 && exits(x,y)<=1) dead.push([x,y]);
    if(!dead.length) break;
    for(const [x,y] of dead){
      for(let d=0; d<4; d++) if(edgeAt(L,x,y,d)!==E_WALL) setEdge(L,x,y,d,E_WALL);
      reg[I(x,y)]=-1;
    }
  }

  /* 5. 部屋の種類と階段 */
  const kinds=ROOM_KINDS.filter(k=>k.k!=='vault');
  L.rooms.forEach(r=>{ r.k=pick(kinds).k; });
  const startR=ri(0,nRooms-1);
  const rs=L.rooms[startR];
  L.up={x:ri(rs.x, rs.x+rs.w-1), y:ri(rs.y, rs.y+rs.h-1)};
  const dist=bfs(L, L.up.x, L.up.y);
  let far=-1, fd=-1;
  L.rooms.forEach((r,i)=>{
    if(i===startR) return;
    const dd=dist[I(r.x,r.y)];
    if(dd>fd){ fd=dd; far=i; }
  });
  if(far<0) far=startR;
  const rf=L.rooms[far];
  if(isLast){ L.goal=far; rf.k='vault'; }
  else{
    let p;
    do{ p={x:ri(rf.x, rf.x+rf.w-1), y:ri(rf.y, rf.y+rf.h-1)}; } while(p.x===L.up.x && p.y===L.up.y);
    L.down=p;
  }
  return L;
}

/* 部屋に番人と宝箱を置く。迷路と同じ種から続けて振るので、同じ冒険なら同じ配置になる。
   頭数は遭遇したときのパーティの強さで決めるので、ここでは種類だけ決める */
function populateLevel(L, dg, floorNo){
  const diff=dg.diff, pool=monsterPool(diff, floorNo);
  const startRoom=L.room[L.up.y*L.w+L.up.x];
  const isStair=(x,y)=>(L.up.x===x&&L.up.y===y) || (L.down && L.down.x===x && L.down.y===y);
  L.rooms.forEach((r,i)=>{
    r.foes=null; r.chest=null; r.cleared=false;
    if(i===startRoom) return;                       // 上り階段の部屋は安全
    const goal = i===L.goal;
    const mChance = goal || r.k==='guard' ? 1 : 0.30 + diff*0.03 + floorNo*0.02;
    if(chance(mChance)){
      const m = goal ? pickBoss(diff,floorNo) : pick(pool);
      r.foes = {mid:m.id, boss:goal, escort: goal ? pick(pool).id : null};
    }
    const cChance = goal ? 1 : (r.foes ? 0.55 : 0.15) + diff*0.02;
    if(chance(cChance)){
      const cells=[];
      for(let y=r.y;y<r.y+r.h;y++) for(let x=r.x;x<r.x+r.w;x++) if(!isStair(x,y)) cells.push({x,y});
      if(!cells.length) return;
      const c=pick(cells);
      r.chest={x:c.x, y:c.y, locked:chance(0.55), trapped:!dg.noTrap && chance(0.30+diff*0.04),
               quality: goal?3:1, opened:false};
    }
  });
}
/* そのマスにある（まだ開けていない／開けた）宝箱 */
function chestAt(L,x,y){
  for(const r of L.rooms) if(r.chest && r.chest.x===x && r.chest.y===y) return r.chest;
  return null;
}

/* 隠し扉を通らずに行ける距離（到達できないマスは -1） */
function bfs(L, sx, sy, allowSecret){
  const dist=new Array(L.w*L.h).fill(-1);
  const q=[[sx,sy]]; dist[sy*L.w+sx]=0;
  while(q.length){
    const [x,y]=q.shift();
    for(let d=0; d<4; d++){
      const e=edgeAt(L,x,y,d);
      if(!(isPass(e) || (allowSecret && e===E_SECRET))) continue;
      const nx=x+DX[d], ny=y+DY[d];
      if(!inside(L,nx,ny) || dist[ny*L.w+nx]>=0) continue;
      dist[ny*L.w+nx]=dist[y*L.w+x]+1;
      q.push([nx,ny]);
    }
  }
  return dist;
}

/* その場で最初に向く方向（壁に向かって立たないように） */
function openFacing(L,x,y){
  for(const d of shuffle([0,1,2,3])) if(isPass(edgeAt(L,x,y,d))) return d;
  return 0;
}

/* ---------- セーブ用に文字列へ詰める ---------- */
function packLevel(L){
  return {w:L.w, h:L.h, floorNo:L.floorNo, hw:L.hw.join(''), vw:L.vw.join(''),
    room:L.room.map(r=>r<0?'.':r.toString(36)).join(''), seen:L.seen.join(''),
    rooms:L.rooms, up:L.up, down:L.down, goal:L.goal};
}
function unpackLevel(p){
  const num=s=>Array.from(s, c=>+c);
  return {w:p.w, h:p.h, floorNo:p.floorNo, hw:num(p.hw), vw:num(p.vw),
    room:Array.from(p.room, c=>c==='.'?-1:parseInt(c,36)), seen:num(p.seen),
    rooms:p.rooms, up:p.up, down:p.down, goal:p.goal};
}
