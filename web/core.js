/* ================= SOLVEUR ================= */
const MAXL=10, BLOCK=99;           // BLOCK : case occupée par un objet non reconnu
const CELLS=[],IDX={};const K=(q,r)=>q+','+r;
for(let c=0;c<5;c++){const n=c%2?4:5;for(let row=0;row<n;row++){const q=c,r=row-((c-(c&1))>>1);IDX[K(q,r)]=CELLS.length;CELLS.push({c,row,q,r});}}
const N=CELLS.length;
const DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const NB=CELLS.map(o=>DIRS.map(d=>IDX[K(o.q+d[0],o.r+d[1])]).filter(x=>x!==undefined));
const rot1=p=>[-p[1],p[0]+p[1],p[2]];   // 60° horaire à l'écran
function rotations(piece,anchor){
  const out=[],seen=new Set();let s=piece;
  for(let k=0;k<6;k++){if(k)s=s.map(rot1);
    const mq=Math.min(...s.map(p=>p[0])),mr=Math.min(...s.map(p=>p[1]));
    const sig=s.map((p,n)=>(p[0]-mq)+':'+(p[1]-mr)+':'+p[2]+(n===anchor?'*':'')).sort().join('|');
    if(!seen.has(sig)){seen.add(sig);out.push({k,shape:s});}}
  return out;
}
function placements(b,rots){
  const out=[];
  for(const R of rots){const s=R.shape,o=s[0];
    for(let i=0;i<N;i++){const t=[];let ok=true;
      for(const p of s){const j=IDX[K(CELLS[i].q+p[0]-o[0],CELLS[i].r+p[1]-o[1])];if(j===undefined||b[j]){ok=false;break;}t.push(j);}
      if(ok)out.push({k:R.k,shape:s,idx:t});}}
  return out;
}
// Où apparaît l'objet fusionné quand 2 ou 3 tuiles de la pièce posée sont dans le même groupe ?
// Le jeu ne suit aucune règle simple repérée dans les parties enregistrées (la meilleure : 62 %).
// On suppose donc le cas le moins favorable (la case qui enchaîne le moins de fusions) :
// le solveur ne parie plus sur une cascade incertaine. Rejeu de 5 parties, case tirée au hasard :
// 392 tours tenus en moyenne contre 379, et des résultats bien plus réguliers.
function groupOf(b,a){const l=b[a],g=[a],s=new Set([a]);for(let h=0;h<g.length;h++)for(const n of NB[g[h]])if(!s.has(n)&&b[n]===l){s.add(n);g.push(n);}return g;}
function cascadeFrom(b,g,dst,l){const nb=b.slice();g.forEach(x=>nb[x]=0);nb[dst]=Math.min(MAXL,l+(g.length>=5?2:1));let n=0;
  while(nb[dst]<MAXL){const gg=groupOf(nb,dst);if(gg.length<3)break;const t=Math.min(MAXL,nb[dst]+(gg.length>=5?2:1));gg.forEach(x=>nb[x]=0);nb[dst]=t;n++;}return n;}
// Mise à jour du jeu : un point blanc marque la tuile de la pièce où la fusion aura lieu (anchor = son indice).
function resolve(b0,pl,anchor){
  const b=b0.slice();pl.idx.forEach((j,n)=>b[j]=pl.shape[n][2]);
  const merges=[],queue=pl.idx.slice();let created=-1;
  while(queue.length){const a=queue.shift(),l=b[a];if(!l||l>=MAXL)continue;
    const g=groupOf(b,a);
    if(g.length>=3){let dst=a;
      const A=anchor!==undefined?pl.idx[anchor]:undefined;
      if(!g.includes(created)&&A!==undefined&&g.includes(A))dst=A;
      else if(!g.includes(created)){const C=g.filter(x=>pl.idx.includes(x));if(C.length>1)dst=C.reduce((p,c)=>cascadeFrom(b,g,c,l)<cascadeFrom(b,g,p,l)?c:p);}
      const to=Math.min(MAXL,l+(g.length>=5?2:1));g.forEach(x=>b[x]=0);b[dst]=to;created=dst;merges.push({l,to,size:g.length,at:dst});queue.unshift(dst);}}
  return {b,merges};
}
// Toutes les issues possibles quand l'emplacement d'une fusion est incertain
// (2 ou 3 tuiles de la pièce dans le même groupe : le jeu ne suit aucune règle simple repérée).
function resolveAll(b0,pl,cap=6,anchor){
  const A=anchor!==undefined?pl.idx[anchor]:undefined;
  const out=[],seen=new Set();
  const rec=(b,queue,created,merges)=>{
    if(out.length>=cap)return;
    while(queue.length){const a=queue[0],l=b[a];if(!l||l>=MAXL){queue=queue.slice(1);continue;}
      const g=groupOf(b,a);if(g.length<3){queue=queue.slice(1);continue;}
      const to=Math.min(MAXL,l+(g.length>=5?2:1));
      const C=g.includes(created)?[created]:(A!==undefined&&g.includes(A))?[A]:g.filter(x=>pl.idx.includes(x));const D=C.length?C:[a];
      for(const dst of D){const nb=b.slice();g.forEach(x=>nb[x]=0);nb[dst]=to;
        rec(nb,[dst,...queue.slice(1).filter(x=>!g.includes(x))],dst,[...merges,{l,to,size:g.length,at:dst}]);}
      return;}
    const k=b.join(',');if(!seen.has(k)){seen.add(k);out.push({b,merges});}
  };
  const b=b0.slice();pl.idx.forEach((j,n)=>b[j]=pl.shape[n][2]);rec(b,pl.idx.slice(),-1,[]);
  return out.length?out:[resolve(b0,pl,anchor)];
}
// MERGE_W = 0,5 : les fusions pèsent moitié moins face à l'état du plateau (place, paires, poubelles).
// Simulation (simulateur corrigé, mêmes pièces) : poids 0,4 sur 240 parties → N10 dans 6 parties contre 2,
// 132 tours contre 125, 1,10 N9 par partie contre 1,05 ; poids 0,5 sur 160 parties → N10 6 contre 2, 1,14 N9 contre 1,05.
const MERGE_W=0.5;
const mergePts=m=>MERGE_W*m.reduce((s,x,j)=>s+15*Math.pow(2,x.to-2)*(1+0.3*j)-(x.size===4?4:0),0);
function survival(b){
  let pair=false;
  for(let i=0;i<N;i++){if(b[i])continue;
    for(const n of NB[i]){if(b[n])continue;pair=true;for(const m of NB[n])if(m!==i&&!b[m])return 0;}}
  return pair?-150:-400;
}
// Règle du jeu : dès le premier N5, le N1 ne sort plus ; dès le premier N6, le N2 ; etc.
// Les objets de ces niveaux ne fusionneront plus jamais (poubelle).
const _dead={};
// Observé sur une partie enregistrée : N1 s'arrête au 1er N5, N2 au 1er N6, N3 au 1er N7,
// mais N4 sort encore après le 1er N8 (les pièces restent entre N4 et N6). D'où le plafond à 3.
const DEAD_CAP=3;
function deadFor(maxReached){if(_dead[maxReached])return _dead[maxReached];
  const d=new Set();for(let l=1;l<=Math.min(maxReached-4,DEAD_CAP);l++)d.add(l);return _dead[maxReached]=d;}
function evaluate(b,dead){
  let s=survival(b);
  for(let i=0;i<N;i++){
    // valeur d'une case vide : 16 (au lieu de 8) d'après le rejeu de 4 parties enregistrées (+14 tours de survie)
    // + marge de placement : chaque paire de voisins vides autour d'une case vide (= place pour une pièce coudée ou en ligne).
    // Rejeu de 6 parties (6 tirages) : 515 tours tenus sur 550 en moyenne contre 472 sans ce terme.
    if(!b[i]){s+=24;let e=0;for(const n of NB[i])if(!b[n])e++;if(e>=2)s+=1.5;s+=MARGE*e*(e-1)/2;continue;}
    if(b[i]>MAXL)continue;   // objet non reconnu : simple case perdue
    // poubelle : malus de 60 (stratégie « zéro poubelle » : finir les N1 avant le 1er N5, les N2 avant le 1er N6…)
    // 120 parties simulées : N9 atteint 92 fois contre 73, mieux sur les 6 séries ; 2,5 poubelles en fin de partie contre 3,1
    if(dead.has(b[i])){s-=60;continue;}
    let same=0,empty=0;for(const n of NB[i]){if(b[n]===b[i])same++;if(!b[n])empty++;}
    // hauts niveaux (N6+) qui se touchent : bonus exponentiel, pour préparer les fusions vers N9/N10
    // (HI_MULT = 2 : +2,5 % de tours tenus au rejeu de 14 parties ; 4 = mode « viser N10 » : 2x plus de N9 en simulation)
    const H=b[i]>5?HI_MULT*Math.pow(2,b[i]-5):1;
    if(same){s+=(2+b[i])*same/2*H;if(empty)s+=2;}else if(!empty)s-=3+b[i];
  }
  return s;
}
const topLevel=m=>m.reduce((x,y)=>Math.max(x,y.to),0);
function bestReply(b,rots,max,w,anchor){
  // meilleur placement d'une pièce connue : {v, merges, b, max} ou null si elle ne rentre pas
  let best=null;
  for(const q of placements(b,rots)){const c=resolve(b,q,anchor),m=Math.max(max,topLevel(c.merges));
    const v=w*mergePts(c.merges)+evaluate(c.b,deadFor(m));
    if(!best||v>best.v)best={v,merges:c.merges,b:c.b,max:m,mp:w*mergePts(c.merges)};}
  return best;
}
// élagage testé (8 poses / 8 coups) : 3x plus rapide mais 550 tours tenus contre 580 au rejeu, donc calcul complet conservé
// MARGE = 2 avec HI_MULT = 4 : mode « viser N10 » (simulation : parties plus longues, 2 N10 sur 80 parties)
let THIRD_TOP=999,CAND_TOP=10,HI_MULT=2,MARGE=1;
function solve(board,cur,nxt,maxReached,dist,anc){
  anc=anc||{};
  // maxReached : plus haut niveau déjà obtenu (décide des niveaux poubelle)
  // dist : pièces probables au 3e tour [{rots, p}] (issues des parties enregistrées), facultatif
  maxReached=Math.max(maxReached||0,...board.filter(l=>l<=MAXL));
  if(!cur.length)return {err:'Pièce actuelle non détectée'};
  const pls=placements(board,rotations(cur,anc.cur));
  if(!pls.length)return {err:'Partie terminée : la pièce ne rentre plus',over:true};
  const r2=nxt.length?rotations(nxt,anc.nxt):null;
  const res=pls.map(pl=>{
    const a=resolve(board,pl,anc.cur),max1=Math.max(maxReached,topLevel(a.merges));
    const o={...pl,after:a.b,max1,merges:a.merges,nextMerges:[],dead:false,
      newDead:[...deadFor(max1)].filter(l=>!deadFor(maxReached).has(l)),m1:mergePts(a.merges)};
    // issues possibles du coup (une seule le plus souvent) ; le score est leur moyenne
    o.outs=resolveAll(board,pl,6,anc.cur).map(x=>{const m=Math.max(maxReached,topLevel(x.merges));return {b:x.b,max1:m,m1:mergePts(x.merges),at:(x.merges.find(mm=>pl.idx.includes(mm.at))||{}).at};});
    let sum=0,deadAll=true;
    for(const x of o.outs){
      if(r2){const br=bestReply(x.b,r2,x.max1,0.9,anc.nxt);
        if(br){x.fut=br.v;if(x.b.join()===a.b.join())o.nextMerges=br.merges;deadAll=false;}else{x.fut=-2000+evaluate(x.b,deadFor(x.max1));o.dead=true;}}
      else{x.fut=evaluate(x.b,deadFor(x.max1));deadAll=false;}
      sum+=x.m1+x.fut;}
    o.uncertain=o.outs.length>1;
    o.score=sum/o.outs.length-0.01*pl.k;
    return o;
  });
  res.sort((x,y)=>y.score-x.score);
  let depth=r2?2:1,risk=null;
  if(r2&&dist&&dist.length){
    // 3e tour : pour les meilleurs coups, moyenne sur les pièces probables (meilleure réponse à chacune)
    depth=3;
    // poses de la pièce suivante classées sur 2 tours (THIRD_TOP permet d'élaguer si besoin)
    const third=(after,max1)=>{let best=-Infinity,bestRisk=1,nm=[];
      const cand=placements(after,r2).map(q=>{const c=resolve(after,q,anc.nxt),m2=Math.max(max1,topLevel(c.merges));
        return {c,m2,v:0.9*mergePts(c.merges)+evaluate(c.b,deadFor(m2))};}).sort((x,y)=>y.v-x.v).slice(0,THIRD_TOP);
      for(const {c,m2} of cand){
        let ev=0,blocked=0;
        // les pièces contenant un niveau devenu poubelle ne peuvent plus sortir : on les retire et on renormalise
        const dz=deadFor(m2),dd=dist.filter(d=>!d.rots[0].shape.some(p=>dz.has(p[2]))),mass=dd.reduce((s,d)=>s+d.p,0)||1;
        for(const d0 of dd){const d={rots:d0.rots,p:d0.p/mass};const br=bestReply(c.b,d.rots,m2,0.8);
          if(br)ev+=d.p*br.v;else{ev+=d.p*(-2000+evaluate(c.b,deadFor(m2)));blocked+=d.p;}}
        const v=0.9*mergePts(c.merges)+ev;
        if(v>best){best=v;bestRisk=blocked;nm=c.merges;}
      }
      return {best,risk:bestRisk,nm};};
    for(const o of res.slice(0,CAND_TOP)){
      if(o.dead&&o.outs.every(x=>x.fut<-1000))continue;
      let s3=0,rk=0;
      for(const x of o.outs){const t=x.fut<-1000?{best:x.fut,risk:1,nm:[]}:third(x.b,x.max1);x.v3=t.best;
        s3+=x.m1+t.best;rk+=t.risk;if(x.b.join()===o.after.join()&&t.nm.length)o.nextMerges=t.nm;}
      o.score3=s3/o.outs.length-0.01*o.k;o.risk=rk/o.outs.length;
    }
    const top=res.slice(0,CAND_TOP).filter(o=>o.score3!==undefined).sort((x,y)=>y.score3-x.score3);
    res.splice(0,CAND_TOP,...top,...res.slice(0,CAND_TOP).filter(o=>o.score3===undefined));
    risk=res[0].risk??null;
  }
  for(const o of res.slice(0,3))if(o.uncertain){
    const v=x=>x.m1+(x.v3!==undefined?x.v3:x.fut);const bo=o.outs.reduce((a,x)=>v(x)>v(a)?x:a);const wo=o.outs.reduce((a,x)=>v(x)<v(a)?x:a);
    o.bestAt=bo.at;o.gap=v(bo)-v(wo);}
  return {list:res.slice(0,3),depth,risk};
}
// Marteau (une fois par partie) : quelle relique détruire ? On teste chaque relique puis le meilleur coup qui suit.
function solveHammer(board,cur,nxt,maxReached,dist,anc){
  let best=null;
  for(let i=0;i<N;i++){if(!board[i]||board[i]>MAXL)continue;
    const b=board.slice();b[i]=0;const o=solve(b,cur,nxt,maxReached,null,anc);const x=o.list&&o.list[0];if(!x)continue;
    // une relique détruite coûte ce qu'il a fallu de fusions pour la créer : sans ce coût, le conseil sacrifiait
    // un N9 isolé (aucun bonus de paire) plutôt qu'un N6 ou un N7, alors que les deux sauvaient la partie
    const cost=board[i]>=5?15*Math.pow(2,board[i]-2):0;
    const v=x.dead?-1e6+x.score:x.score-cost;if(!best||v>best.v)best={v,cell:i,level:board[i],board:b,move:x};}
  return best;
}
// clé d'une pièce indépendante de sa rotation et de sa position
function pieceKey(piece){
  let best=null;
  let s=piece;for(let k=0;k<6;k++){if(k)s=s.map(rot1);const mq=Math.min(...s.map(p=>p[0])),mr=Math.min(...s.map(p=>p[1]));
    const key=s.map(p=>[p[0]-mq,p[1]-mr,p[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(p=>p.join(',')).join(';');if(best===null||key<best)best=key;}
  return best;
}
const keyToPiece=k=>k.split(';').map(t=>t.split(',').map(Number));
const mtxt=m=>m.map(x=>`${x.size}×N${x.l} → N${x.to}`).join(', ');

/* ================= VISION ================= */
// img = {data (RGBA), width, height}
const EMPTY_MAX=45;   // contour d'une case vide : très sombre
let MATCH_MAX=1.15;   // écart max (0 à 2) entre histogrammes pour reconnaître une tuile
function median(a){a.sort((x,y)=>x-y);return a[a.length>>1];}
function borderBright(img,cx,cy,size){
  // luminosité du contour de la tuile (pixels les plus clairs de la bande extérieure) : sombre = case vide
  const h=size/2,x0=Math.round(cx-h),y0=Math.round(cy-h),x1=x0+Math.floor(size),y1=y0+Math.floor(size);
  if(x0<0||y0<0||x1>img.width||y1>img.height)return 0;
  const v=[];const step=size>80?2:1;
  for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){
    const d=Math.max(Math.abs(x-cx),Math.abs(y-cy))/h;
    if(d>0.7&&d<=1.0){const o=(y*img.width+x)*4;v.push(Math.max(img.data[o],img.data[o+1],img.data[o+2]));}}
  if(!v.length)return 0;
  v.sort((a,b)=>b-a);return v[Math.floor(v.length*0.12)];
}
function colorHist(img,x0,y0,w,h){
  // empreinte d'une tuile : répartition des couleurs vives (64 cases), indépendante de la taille
  const out=new Array(64).fill(0);let n=0;const step=Math.max(1,Math.min(w,h)/40);
  for(let y=y0;y<y0+h;y+=step)for(let x=x0;x<x0+w;x+=step){
    const xi=Math.round(x),yi=Math.round(y);if(xi<0||yi<0||xi>=img.width||yi>=img.height)continue;
    const o=(yi*img.width+xi)*4,r=img.data[o],g=img.data[o+1],b=img.data[o+2];
    if(Math.max(r,g,b)<60)continue;out[(r>>6)*16+(g>>6)*4+(b>>6)]++;n++;}
  return out.map(v=>Math.round(1000*v/(n||1)));
}
const tileSig=(img,cx,cy,size)=>colorHist(img,cx-size/2,cy-size/2,size,size);
function sigDist(a,b){let s=0;for(let i=0;i<64;i++)s+=Math.abs(a[i]-b[i]);return s/1000;}
function classify(img,cx,cy,size,refs){
  // -> {l: niveau (0 vide, null inconnu), d: écart}
  if(borderBright(img,cx,cy,size)<EMPTY_MAX)return {l:0};
  const sg=tileSig(img,cx,cy,size);let best=1e9,bl=null;
  for(const lvl in refs)for(const r of refs[lvl]){const d=sigDist(sg,r.h);if(d<best){best=d;bl=+lvl;}}
  return {l:best<=MATCH_MAX?bl:null,d:best,sig:sg};
}
function boardGeom(cfg){
  const [x1,y1]=cfg.tl,[x2,y2]=cfg.br,dx=(x2-x1)/4,dy=(y2-y1)/4;
  return {centers:CELLS.map(o=>[x1+o.c*dx,y1+(o.row+(o.c%2)*.5)*dy]),size:0.89*Math.min(dx,dy)};
}
const BRIGHT=100;
function findTiles(img,rect,minW,expT,mode){
  // mode 'bright' (pièce suivante) : tuiles repérées par leurs contours vifs, quel que soit le fond
  // sinon (pièce actuelle, captures) : tout ce qui se détache de la couleur dominante de la zone
  const x0=Math.max(0,Math.floor(rect[0])),y0=Math.max(0,Math.floor(rect[1]));
  const x1=Math.min(img.width,Math.floor(rect[2])),y1=Math.min(img.height,Math.floor(rect[3]));
  const W=x1-x0,H=y1-y0;if(W<4||H<4)return [];
  const D=img.data,at=(x,y)=>((y0+y)*img.width+x0+x)*4;
  const m=new Uint8Array(W*H);
  if(mode==='bright'){
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const o=at(x,y);if(Math.max(D[o],D[o+1],D[o+2])>BRIGHT)m[y*W+x]=1;}
  }else{
    const hist=new Map();
    for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){const o=at(x,y);const k=(D[o]>>4)*256+(D[o+1]>>4)*16+(D[o+2]>>4);hist.set(k,(hist.get(k)||0)+1);}
    let mk=0,mc=-1;for(const [k,c] of hist)if(c>mc){mc=c;mk=k;}
    const R=[],G=[],B=[];
    for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){const o=at(x,y);if((D[o]>>4)*256+(D[o+1]>>4)*16+(D[o+2]>>4)===mk){R.push(D[o]);G.push(D[o+1]);B.push(D[o+2]);}}
    const bg=[median(R),median(G),median(B)];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const o=at(x,y),r=D[o],g=D[o+1],b=D[o+2];
      const star=r>170&&g>100&&b<110&&r-b>100;   // étoiles jaunes sous les tuiles
      if(!star&&Math.abs(r-bg[0])+Math.abs(g-bg[1])+Math.abs(b-bg[2])>60)m[y*W+x]=1;}
  }
  const md=new Uint8Array(W*H),R=mode==='bright'?2:1;   // petites tuiles : on referme davantage les contours
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!m[y*W+x])continue;
    for(let yy=Math.max(0,y-R);yy<=Math.min(H-1,y+R);yy++)for(let xx=Math.max(0,x-R);xx<=Math.min(W-1,x+R);xx++)md[yy*W+xx]=1;}
  // bouche les trous (intérieur sombre des tuiles) : tout ce qui n'est pas relié au bord de la zone
  const outside=new Uint8Array(W*H),st=[];
  for(let x=0;x<W;x++){st.push(x,(H-1)*W+x);}for(let y=0;y<H;y++){st.push(y*W,y*W+W-1);}
  while(st.length){const q=st.pop();if(outside[q]||md[q])continue;outside[q]=1;const x=q%W,y=(q/W)|0;
    if(x>0)st.push(q-1);if(x<W-1)st.push(q+1);if(y>0)st.push(q-W);if(y<H-1)st.push(q+W);}
  const fm=new Uint8Array(W*H);for(let p=0;p<W*H;p++)fm[p]=outside[p]?0:1;
  const lab=new Int32Array(W*H),boxes=[];let id=0;
  for(let p=0;p<W*H;p++){if(!fm[p]||lab[p])continue;id++;
    let bx0=W,by0=H,bx1=0,by1=0,n=0;st.push(p);lab[p]=id;
    while(st.length){const q=st.pop(),x=q%W,y=(q/W)|0;n++;
      if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y;if(y>by1)by1=y;
      if(x>0&&fm[q-1]&&!lab[q-1]){lab[q-1]=id;st.push(q-1);}
      if(x<W-1&&fm[q+1]&&!lab[q+1]){lab[q+1]=id;st.push(q+1);}
      if(y>0&&fm[q-W]&&!lab[q-W]){lab[q-W]=id;st.push(q-W);}
      if(y<H-1&&fm[q+W]&&!lab[q+W]){lab[q+W]=id;st.push(q+W);}}
    boxes.push({id,x:bx0,y:by0,w:bx1-bx0+1,h:by1-by0+1,n});}
  // une tuile seule est un carré plein ; sinon c'est un groupe de tuiles collées à redécouper
  const single=b=>b.w>Math.max(12,minW)&&b.h/b.w>0.85&&b.h/b.w<1.25&&b.n>0.8*b.w*b.h&&b.w<0.95*W;
  let out=[];
  for(const b of boxes){
    // la zone contient le cadre sombre lui-même : on cherche les tuiles à l'intérieur du cadre
    if(single(b))out.push(b);
    else if(b.w>Math.max(12,minW)&&b.n>0.3*b.w*b.h&&b.w<0.98*W)out.push(...splitBlob(lab,W,b));
  }
  if(out.length){const wm=Math.max(...out.map(b=>b.w));out=out.filter(b=>b.w>0.7*wm);}
  return out.map(b=>({x:x0+b.x,y:y0+b.y,w:b.w}));
}
function splitBlob(lab,W,b){
  // essaie plusieurs tailles de tuile ; garde le découpage qui recouvre le mieux le bloc
  const inBlob=(x,y)=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h&&lab[y*W+x]===b.id;
  const fill=(x0,y0,T)=>{let n=0,k=0;const s=Math.max(1,T/12);
    for(let y=y0+T*.1;y<y0+T*.9;y+=s)for(let x=x0+T*.1;x<x0+T*.9;x+=s){k++;if(inBlob(Math.round(x),Math.round(y)))n++;}return k?n/k:0;};
  const cands=[];
  // taille de tuile inconnue : on essaie une plage de tailles autour de celle suggérée par la largeur du bloc
  for(let c=1;c<=3;c++)for(const ratio of [1.0,1.035,1.07])for(const sc of [0.8,0.85,0.9,0.95,1]){
    const T=sc*b.w/(1+(c-1)*ratio);if(T<8)continue;
    const span=T*(1+(c-1)*ratio),ox=(b.w-span)/2;
    const half=ratio*T/2,h=Math.round((b.h-T)/half);if(h<0||h>4)continue;
    const oy=(b.h-(T+h*half))/2;if(Math.abs(oy)*2/T>0.3)continue;
    for(const base of [0,1]){
      const sel=[];let fs=0;
      for(let i=0;i<c;i++)for(let j=0;j<=h;j++){if((i+j+base)%2)continue;
        const x=b.x+ox+i*ratio*T,y=b.y+Math.max(0,oy)+j*half,f=fill(x,y,T);if(f>0.85){sel.push({x:Math.round(x),y:Math.round(y),w:Math.round(T)});fs+=f;}}
      if(!sel.length)continue;
      // part du bloc recouverte par les tuiles choisies
      let cov=0,tot=0;const s=Math.max(1,b.w/40);
      for(let y=b.y;y<b.y+b.h;y+=s)for(let x=b.x;x<b.x+b.w;x+=s){const xi=Math.round(x),yi=Math.round(y);if(!inBlob(xi,yi))continue;tot++;
        if(sel.some(t=>xi>=t.x&&xi<t.x+t.w&&yi>=t.y&&yi<t.y+t.w))cov++;}
      cands.push({score:(cov/tot)*(fs/sel.length),T,sel});
    }}
  // une pièce a 3 tuiles au plus ; parmi les découpages qui expliquent bien le bloc, on garde les plus grosses tuiles
  // (sinon une colonne de 3 tuiles se découpe aussi en 10 petites tuiles qui la recouvrent tout aussi bien)
  const okc=cands.filter(c=>c.sel.length<=3&&c.score>0.8);if(!okc.length)return [];
  const good=okc.filter(c=>c.score>=0.85);
  return (good.length?good.reduce((a,c)=>c.T>a.T?c:a):okc.reduce((a,c)=>c.score>a.score?c:a)).sel;
}
function dotScore(img,cx,cy,w){
  // pixels blancs dans le coin haut-droit de la tuile (le point qui marque la tuile de fusion)
  let n=0,k=0;const x0=Math.round(cx+w*0.2),x1=Math.round(cx+w*0.6),y0=Math.round(cy-w*0.6),y1=Math.round(cy-w*0.2);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(x<0||y<0||x>=img.width||y>=img.height)continue;k++;const o=(y*img.width+x)*4;
    if(img.data[o]>232&&img.data[o+1]>232&&img.data[o+2]>232)n++;}
  return k?n/k:0;
}
function readPiece(img,rect,refs,minW,expT,mode){
  const tiles=findTiles(img,rect,minW,expT,mode);if(!tiles.length)return {piece:[],unknown:[],tiles:[]};
  if(tiles.length>3)return {piece:[],unknown:[],tiles:[],bad:true};   // une pièce a 3 tuiles au plus : lecture ratée
  const ws=tiles.map(t=>t.w).sort((a,b)=>a-b),pitch=1.09*ws[ws.length>>1];
  const cs=tiles.map(t=>[t.x+t.w/2,t.y+t.w/2,t.w]);const [bx,by]=cs[0];
  const piece=[],unknown=[],info=[];
  for(const [cx,cy,tw] of cs){
    const dq=Math.round((cx-bx)/pitch),dr=Math.round((cy-by)/pitch-dq/2);
    const c=classify(img,cx,cy,tw,refs);
    const dot=dotScore(img,cx,cy,tw);
    info.push({cx,cy,size:tw,l:c.l,d:c.d,sig:c.sig,dq,dr,dot});
    if(c.l===null){unknown.push({cx,cy,size:tw});continue;}
    if(c.l>0)piece.push({p:[dq,dr,c.l],dot});
  }
  piece.sort((a,b)=>a.p[0]-b.p[0]||a.p[1]-b.p[1]);
  // tuile marquée : la plus « blanche » dans son coin, si le point est net (sinon : inconnue)
  let anchor;const ds=piece.map(x=>x.dot),mx=Math.max(0,...ds);
  if(piece.length>1&&mx>0.03&&ds.filter(d=>d>mx*0.5).length===1)anchor=ds.indexOf(mx);
  info.forEach(t=>t.anchor=false);if(anchor!==undefined){const a=piece[anchor];const t=info.find(t=>t.dq===a.p[0]&&t.dr===a.p[1]);if(t)t.anchor=true;}
  return {piece:piece.map(x=>x.p),anchor,unknown,tiles:info};
}
// le cadre de la pièce suivante est petit : on lit un peu au-delà pour ne pas couper une colonne de 3 tuiles
const grow=(r,f)=>{const dx=(r[2]-r[0])*f,dy=(r[3]-r[1])*f;return [r[0]-dx,r[1]-dy,r[2]+dx,r[3]+dy];};
// dead : niveaux qui ne sortent plus depuis au moins 2 tours, appliqué à la seule pièce suivante (petites tuiles :
// N4 lu N3 une fois sur six en fin de partie). Pas à la pièce actuelle : une pièce tirée juste avant le 1er N5
// peut encore contenir un N1, qui devenait alors « objet non reconnu »
function readAll(img,cfg,refs,smallRefs,dead){
  const g=boardGeom(cfg),board=[],unknown=[],cells=[];
  g.centers.forEach(([cx,cy])=>{const c=classify(img,cx,cy,g.size,refs);
    cells.push({cx,cy,size:g.size,l:c.l,d:c.d});
    if(c.l===null){unknown.push({cx,cy,size:g.size});board.push(BLOCK);}else board.push(c.l);});
  const minW=0.2*g.size;
  const c=readPiece(img,cfg.cur,refs,minW,0.86*g.size),n=readPiece(img,grow(cfg.next,0.15),withoutLevels(mergeRefs(refs,smallRefs),dead),minW,0.38*g.size,'bright');
  return {board,cur:c.piece,nxt:n.piece,curAnchor:c.anchor,nxtAnchor:n.anchor,unknown,curUnknown:c.unknown.length,nxtUnknown:n.unknown.length,curBad:!!c.bad,nxtBad:!!n.bad,
          cells,curTiles:c.tiles,nxtTiles:n.tiles};
}
// petites tuiles de la pièce suivante : on ajoute les références apprises à cette taille
function withoutLevels(r,dead){if(!dead||!dead.size)return r;const o={};for(const k in r)if(!dead.has(+k))o[k]=r[k];return o;}
function mergeRefs(a,b){if(!b)return a;const o={};for(const k in a)o[k]=a[k];for(const k in b)o[k]=(o[k]||[]).concat(b[k]);return o;}
// tuile la plus probable dans une image collée (capture d'un objet)
function tileFromImage(img){
  const t=findTiles(img,[0,0,img.width,img.height],8,0);
  if(t.length){const b=t.reduce((a,c)=>c.w>a.w?c:a);return {x:b.x,y:b.y,w:b.w};}
  const s=Math.min(img.width,img.height);return {x:(img.width-s)/2,y:(img.height-s)/2,w:s};
}
