import { normalizeContent, escapeHtml as esc } from '../shared/schema.js';
import { GLY } from './glyphs.js';

try{const f=document.createElement('link');f.rel='stylesheet';f.href='https://fonts.googleapis.com/css2?family=Unbounded:wght@800&family=Manrope:wght@400;600;700&display=swap';document.head.appendChild(f)}catch(e){}
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

let DATA; try{DATA=normalizeContent(JSON.parse($('#site-data').textContent))}catch(e){DATA=normalizeContent({})}
let view=null, intro=false; setTimeout(()=>intro=true,10500);

function toast(m,keep){const t=$('#toast');clearTimeout(toast.t);if(!m){t.hidden=true;return}t.textContent=m;t.hidden=false;if(!keep)toast.t=setTimeout(()=>t.hidden=true,4500)}

/* ---------- Единое появление: одна система для всего текста ---------- */
const io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;e.target.classList.add('in');io.unobserve(e.target)}),{threshold:.15,rootMargin:'0px 0px -6% 0px'});
$$('.rv').forEach(el=>io.observe(el));

/* ---------- Меню ---------- */
const menu=$('#menu'), title=$('#title');
function pill(label,i,fn,extra){
  const b=document.createElement('button'); b.type='button'; b.className='pill rv'+(extra?' '+extra:''); b.dataset.hover=''; b.textContent=label;
  b.style.setProperty('--rd',intro?'0s':(PAINT_END+.5+i*.08).toFixed(2)+'s'); b.onclick=fn; menu.appendChild(b);
  if(intro)b.classList.add('in'); else io.observe(b);
}
function renderMenu(){
  menu.innerHTML='';
  DATA.sections.forEach((s,i)=>pill(s.name,i,()=>openPage(i),s.name.length>14?'wide':''));
  pill(DATA.price.title,DATA.sections.length,e=>openPrice(e.currentTarget),'price');
  let c=0; [...menu.children].forEach(b=>{if(b.classList.contains('wide'))c=0;else{c++;if(c===2)c=0}}); if(c===1)menu.lastElementChild.classList.add('solo');
  $('#tg').href=DATA.telegram||'#'; $('#lede').textContent=DATA.hero; $('#cta').textContent=DATA.cta;
}
menu.addEventListener('pointermove',e=>{const b=e.target.closest('.pill');if(!b)return;const r=b.getBoundingClientRect();b.style.setProperty('--mx',(e.clientX-r.left)+'px');b.style.setProperty('--my',(e.clientY-r.top)+'px')});

/* ---------- Желе-буквы ---------- */
const NS='http://www.w3.org/2000/svg', SPEED=2800, OVER=.55, RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
const mk=(tag,at,par)=>{const e=document.createElementNS(NS,tag);for(const k in at)e.setAttribute(k,at[k]);if(par)par.appendChild(e);return e};
let tcur=.5, PAINT_END=.5; const STROKES=[], P0=performance.now(); let paintOn=true;
const letters=[...'portfolio'].map((ch,i)=>{
  const g=GLY[ch], el=document.createElement('span'); el.className='jl'; el.setAttribute('aria-hidden','true');
  const sv=mk('svg',{viewBox:'0 -850 '+g.a+' 1025',focusable:'false'},el); sv.style.width=(g.a/1000)+'em'; sv.style.height='1.025em';
  const df=mk('defs',{},sv);
  const gr=mk('linearGradient',{id:'lg'+i,gradientUnits:'userSpaceOnUse',x1:0,y1:-850,x2:0,y2:175},df);
  mk('stop',{offset:0,'stop-color':'#e0cdff'},gr); mk('stop',{offset:1,'stop-color':'#a47bf5'},gr);
  const fl=mk('filter',{id:'rf'+i,filterUnits:'userSpaceOnUse',x:-200,y:-900,width:g.a+400,height:1300},df);
  mk('feTurbulence',{type:'fractalNoise',baseFrequency:'.013',numOctaves:'2',seed:String(3+i*7),result:'n'},fl);
  mk('feDisplacementMap',{in:'SourceGraphic',in2:'n',scale:'46',xChannelSelector:'R',yChannelSelector:'G'},fl);
  const mask=mk('mask',{id:'mk'+i,maskUnits:'userSpaceOnUse',x:-200,y:-900,width:g.a+400,height:1300},df);
  const grp=mk('g',{filter:'url(#rf'+i+')',fill:'none',stroke:'#fff','stroke-linecap':'round','stroke-linejoin':'round'},mask);
  const shape=mk('path',{d:g.d,fill:'url(#lg'+i+')'},sv);
  title.appendChild(el);
  shape.setAttribute('mask','url(#mk'+i+')');
  let t=tcur; const ps=g.s.map(s=>{const p=mk('path',{d:s.d,'stroke-width':s.w},grp);let len=1000;try{len=p.getTotalLength()}catch(e){}const dur=Math.max(.18,len/SPEED);
    p.style.strokeDasharray=len.toFixed(1)+' '+(len+20).toFixed(1);p.style.strokeDashoffset=len.toFixed(1);p.style.opacity='0';
    const q={p,len,dl:t,dur,shape,grp,last:false,fin:false};STROKES.push(q);t+=dur*.92;return q});
  ps[ps.length-1].last=true;
  PAINT_END=Math.max(PAINT_END,t); tcur+=(t-tcur)*OVER;
  return {el,i,x:0,y:0,vx:0,vy:0,r:0,vr:0,s:1,vs:0,k:26+Math.random()*8,d:2.6+Math.random()*.9,t0:null};
});
$('#lede').style.setProperty('--rd',(PAINT_END+.1).toFixed(2)+'s');
const small=matchMedia('(max-width:700px)').matches, calm=matchMedia('(prefers-reduced-motion:reduce)').matches;
const hint=$('#hint'), cubes=$$('.cube'), cur=$('#cur'), dot=$('#dot');
let mx=-999,my=-999,mvx=0,mvy=0,lastX=0,lastY=0,sy0=scrollY,sv=0,start=null,cx=-99,cy=-99,rx=-99,ry=-99;
addEventListener('pointerdown',e=>{if(calm)return;const R=small?170:300;letters.forEach(L=>{const rc=L.el.getBoundingClientRect(),dx=rc.left+rc.width/2-e.clientX,dy=rc.top+rc.height/2-e.clientY,d=Math.hypot(dx,dy)||1;if(d<R){const f=1-d/R;L.vx+=dx/d*f*260;L.vy+=dy/d*f*260;L.vr+=(dx>0?1:-1)*f*90;L.vs-=f*5}})},{passive:true});
addEventListener('pointermove',e=>{mvx=e.clientX-lastX;mvy=e.clientY-lastY;lastX=mx=e.clientX;lastY=my=e.clientY;cx=e.clientX;cy=e.clientY});
function unmask(){STROKES.forEach(s=>{s.fin=true;if(s.last){s.shape.removeAttribute('mask');s.grp.removeAttribute('filter')}});paintOn=false}
function paintStep(now){
  const el=(now-P0)/1000; let open=false;
  for(const s of STROKES){
    if(s.fin)continue; const q=(el-s.dl)/s.dur;
    if(q<=0){open=true;continue}
    if(q>=1){s.p.style.strokeDashoffset='0';s.p.style.opacity='1';s.fin=true;if(s.last){s.shape.removeAttribute('mask');s.grp.removeAttribute('filter')}continue}
    open=true; const e=q<.5?2*q*q:1-Math.pow(-2*q+2,2)/2;
    s.p.style.opacity='1'; s.p.style.strokeDashoffset=(s.len*(1-e)).toFixed(1);
  }
  if(!open)paintOn=false;
}
setTimeout(unmask,(PAINT_END+2)*1000);
let tPrev=0;
function frame(now){
  if(paintOn)paintStep(now);
  const dt=Math.min(.034,tPrev?(now-tPrev)/1000:1/60); tPrev=now;
  const v=scrollY-sy0; sy0=scrollY; sv+=(v-sv)*.2;
  const reach=small?190:360, push=calm?0:small?.7:1, t=now/1000, amp=calm?0:small?1.25:1;
  letters.forEach(L=>{
    if(start!==null&&L.t0===null)L.t0=start;
    if(L.t0!==null&&now>=L.t0&&!L.el.classList.contains('on')){L.el.classList.add('on');L.y=0;L.s=1;L.vx=L.vy=L.vs=L.vr=0}
    if(!L.el.classList.contains('on'))return;
    const rc=L.el.getBoundingClientRect(), dx=rc.left+rc.width/2-mx, dy=rc.top+rc.height/2-my, dist=Math.hypot(dx,dy)||1;
    let fx=0,fy=0,fr=0,fs=0;
    if(dist<reach){const f=Math.pow(1-dist/reach,1.4);fx=mvx*f*push*46;fy=mvy*f*push*46;fr=(dy*mvx-dx*mvy)/(dist+30)*f*push*7;fs=-mvy*f*push*.5}
    const tx=0, ty=Math.sin(t*1.25+L.i*.62)*5*amp, tr=Math.sin(t*1.05+L.i*.55)*2.4*amp, ts=1+Math.sin(t*1.7+L.i*.8)*.025*amp+Math.max(-.07,Math.min(.08,sv*.0025));
    L.vx+=(-L.k*(L.x-tx)-L.d*L.vx+fx)*dt; L.vy+=(-L.k*(L.y-ty)-L.d*L.vy+fy)*dt; L.vr+=(-L.k*1.3*(L.r-tr)-L.d*L.vr+fr)*dt; L.vs+=(-L.k*1.5*(L.s-ts)-L.d*L.vs+fs)*dt;
    L.x+=L.vx*dt; L.y+=L.vy*dt; L.r+=L.vr*dt; L.s+=L.vs*dt;
    const sc=Math.max(.35,Math.min(1.8,L.s));
    L.el.style.transform=`translate(${L.x.toFixed(2)}px,${L.y.toFixed(2)}px) rotate(${L.r.toFixed(2)}deg) scale(${(1/Math.sqrt(sc)).toFixed(3)},${sc.toFixed(3)})`;
  });
  cubes.forEach((c,k)=>{const r=c.parentNode.getBoundingClientRect();c.style.setProperty('--py',calm?0:((r.top+r.height/2-innerHeight/2)/innerHeight*(k%2?-46:46)).toFixed(1))});
  const ar=$('#about-s').getBoundingClientRect(); $('#about').style.translate=calm?'none':'0 '+((ar.top+ar.height/2-innerHeight/2)/innerHeight*-16).toFixed(1)+'px';
  hint.classList.toggle('gone',document.body.classList.contains('lock')||scrollY+innerHeight>=document.documentElement.scrollHeight-80);
  $('#prog').style.transform='scaleX('+(scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)).toFixed(3)+')';
  mvx*=.8; mvy*=.8; rx+=(cx-rx)*.12; ry+=(cy-ry)*.12;
  cur.style.transform=`translate(${rx}px,${ry}px)`; dot.style.transform=`translate(${cx}px,${cy}px)`;
  requestAnimationFrame(frame);
}
document.addEventListener('pointerover',e=>cur.classList.toggle('big',!!e.target.closest('[data-hover],a,button,.card.has,#lb img')));
requestAnimationFrame(frame);
hint.style.setProperty('--hd',(PAINT_END+1.6).toFixed(2)+'s');requestAnimationFrame(()=>hint.classList.add('show'));
start=performance.now()+150;
const dots=$$('.dots a');
const io2=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)dots.forEach(d=>d.classList.toggle('on',d.getAttribute('href')==='#'+e.target.id))}),{threshold:.5});
['#hero','#about-s','#contact'].forEach(s=>io2.observe($(s)));


/* ---------- Страницы разделов и прайс ---------- */
const page=$('#page'), pg=$('#pg'); let openRows=new Set();
function toggleRow(row){const j=+row.dataset.j,o=row.classList.toggle('open');o?openRows.add(j):openRows.delete(j);const h=row.querySelector('.phead');if(h)h.setAttribute('aria-expanded',o)}
function shell(html){
  pg.innerHTML=html; void pg.offsetWidth;
  page.scrollTop=0;
  page.setAttribute('aria-hidden','false'); document.body.classList.add('lock');
  requestAnimationFrame(()=>{page.classList.add('open');$$('#pg .rv').forEach(e=>e.classList.add('in'))});
  $('#back').focus({preventScroll:true});
}
const dly=(base,j,st)=>(base+Math.min(j,10)*st).toFixed(2)+'s';
const card=(w,j)=>`<div class="card rv${w.image?' has':''}" data-j="${j}" style="--i:${j};--rd:${dly(.1,j,.07)}"${w.image?` tabindex="0" role="button" aria-label="Открыть: ${esc(w.title)}"`:''}>${w.image?`<img src="${esc(w.image)}" alt="${esc(w.title)}" loading="lazy" decoding="async">`:''}<b>${esc(w.title)}</b><span>${esc(w.description)}</span></div>`;
function openPage(i){
  const s=DATA.sections[i]; if(!s)return; view={k:'s',i};
  page.classList.remove('circ');
  shell(`<h2 class="rv">${esc(s.name)}</h2><p class="sub rv" style="--rd:.08s">${esc(s.description)}</p>`+
  (s.works.length?`<div class="grid">${s.works.map((w,j)=>card(w,j)).join('')}</div>`:`<p class="sub rv" style="--rd:.2s">Скоро здесь появятся работы.</p>`));
}
function openPrice(from){
  const P=DATA.price; view={k:'p'}; openRows=new Set();
  const r=from&&from.getBoundingClientRect?from.getBoundingClientRect():null;
  page.style.setProperty('--ox',r?(r.left+r.width/2)+'px':'50%'); page.style.setProperty('--oy',r?(r.top+r.height/2)+'px':'50%');
  page.classList.add('circ');
  if(from&&from.classList){from.classList.remove('pop');void from.offsetWidth;from.classList.add('pop')}
  const rows=P.items.map((x,j)=>{const has=!!x.details;return `<div class="prow rv${has?' has':''}" data-j="${j}" style="--rd:${dly(.15,j,.06)}"><div class="phead"${has?' tabindex="0" role="button" aria-expanded="false"':''}><div class="pt"><b>${esc(x.title)}</b>${x.summary?`<span>${esc(x.summary)}</span>`:''}</div><div class="pp">${esc(x.price)}</div>${has?'<i class="chev" aria-hidden="true"></i>':''}</div>${has?`<div class="pfull"><div><p>${esc(x.details)}</p></div></div>`:''}</div>`}).join('');
  shell(`<h2 class="rv">${esc(P.title)}</h2><p class="sub rv" style="--rd:.08s">${esc(P.subtitle)}</p>`+
  (rows?`<div class="plist">${rows}</div>`:`<p class="sub rv" style="--rd:.2s">Прайс пока пуст.</p>`)+
  (P.note?`<p class="pnote rv" style="--rd:.4s">${esc(P.note)}</p>`:'')+
  (DATA.telegram?`<a class="btn rv" style="--rd:.5s" href="${esc(DATA.telegram)}" target="_blank" rel="noopener noreferrer">Обсудить проект в Telegram</a>`:''));
}
function closePage(){page.classList.remove('open');page.setAttribute('aria-hidden','true');document.body.classList.remove('lock');view=null}
$('#back').onclick=closePage;


pg.addEventListener('click',e=>{
  const h=e.target.closest('.prow.has .phead'); if(h){toggleRow(h.parentNode);return}
  const c=e.target.closest('.card.has'); if(c&&view&&view.k==='s')openLB(+c.dataset.j);
});
pg.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const t=e.target.classList;if(!t)return;
  if(t.contains('phead')){e.preventDefault();toggleRow(e.target.parentNode)}
  else if(t.contains('card')&&t.contains('has')){e.preventDefault();openLB(+e.target.dataset.j)}});

const lb=$('#lb'); let lbList=[],lbK=0,lbFrom=null;
function showLB(){const w=lbList[lbK];const fg=$('#lb figure');fg.style.animation='none';void fg.offsetWidth;fg.style.animation='';$('#lb-i').src=w.image;$('#lb-i').alt=w.title;$('#lb-c').textContent=w.title+(w.description?' — '+w.description:'');$('#lb-p').hidden=$('#lb-n').hidden=lbList.length<2}
function openLB(j){
  const s=view&&view.k==='s'?DATA.sections[view.i]:null; if(!s)return;
  lbList=s.works.map((w,k)=>({...w,k})).filter(w=>w.image); lbK=Math.max(0,lbList.findIndex(w=>w.k===j)); if(!lbList.length)return;
  lbFrom=document.activeElement; showLB(); lb.hidden=false; $('#lb-x').focus();
}
const lbGo=d=>{lbK=(lbK+d+lbList.length)%lbList.length;showLB()};
function closeLB(){lb.hidden=true;$('#lb-i').removeAttribute('src');if(lbFrom&&lbFrom.focus)lbFrom.focus({preventScroll:true})}
$('#lb-x').onclick=closeLB; $('#lb-p').onclick=()=>lbGo(-1); $('#lb-n').onclick=()=>lbGo(1);
lb.addEventListener('click',e=>{if(e.target===lb||e.target.tagName==='FIGURE')closeLB()});
let tx=null; lb.addEventListener('touchstart',e=>{tx=e.touches[0].clientX},{passive:true});
lb.addEventListener('touchend',e=>{if(tx===null)return;const dx=e.changedTouches[0].clientX-tx;tx=null;if(Math.abs(dx)>50&&lbList.length>1)lbGo(dx<0?1:-1)});
addEventListener('keydown',e=>{
  if(!lb.hidden){if(e.key==='Escape')closeLB();else if(e.key==='ArrowLeft'&&lbList.length>1)lbGo(-1);else if(e.key==='ArrowRight'&&lbList.length>1)lbGo(1);return}
  if(e.key==='Escape'){if(!vid.hidden)closeVid();else closePage()}
});

const VIDEO_SRC='media/intro.mp4', vid=$('#vid'), vv=$('#vid-v'); let vidFrom=null, fsWanted=false;
function openVid(){
  if(!vid.hidden)return;
  vidFrom=document.activeElement; vv.src=VIDEO_SRC; vid.hidden=false; document.body.classList.add('lock'); $('#vid-x').focus({preventScroll:true});
  const p=vv.play(); if(p&&p.catch)p.catch(()=>{});
  try{if(vid.requestFullscreen){fsWanted=true;vid.requestFullscreen().catch(()=>{fsWanted=false})}}catch(e){fsWanted=false}
}
function closeVid(){
  if(vid.hidden)return; fsWanted=false; vv.pause(); vv.removeAttribute('src'); vv.load(); vid.hidden=true;
  if(!page.classList.contains('open'))document.body.classList.remove('lock');
  try{if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{})}catch(e){}
  if(vidFrom&&vidFrom.focus)vidFrom.focus({preventScroll:true});
}
$('#cube-r').addEventListener('click',openVid);
$('#cube-r').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openVid()}});
$('#vid-x').onclick=closeVid; vv.addEventListener('ended',closeVid);
vv.addEventListener('error',()=>{if(vv.getAttribute('src')){const c=vv.error?vv.error.code:0;closeVid();toast('Не удалось воспроизвести видео'+(c?' (код '+c+')':''))}});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&fsWanted&&!vid.hidden)closeVid()});

renderMenu();
