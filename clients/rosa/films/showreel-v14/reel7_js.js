// ---------- globe (growth mode: a spot lights on the day it entered the repo)
const D2R=Math.PI/180;
const hv=(la,lo)=>{const a=la*D2R,o=lo*D2R;return[Math.cos(a)*Math.sin(o),Math.sin(a),Math.cos(a)*Math.cos(o)]};
const GS=SPOTS.map(([la,lo,b,d])=>({v:hv(la,lo),b,d})).sort((a,b)=>b.b-a.b);
const GL=LAND.map(([la,lo])=>({v:hv(la,lo)}));
const BRGB=[[93,252,159],[36,177,97],[17,183,242],[110,143,184],[69,77,104]];
function globe(cx,cy,R,lon0,lat0,day,al){
 if(al<=.003)return;
 const L0=lon0*D2R,cL=Math.cos(L0),sL=Math.sin(L0),c0=Math.cos(lat0*D2R),s0=Math.sin(lat0*D2R);
 const pr=v=>{const x=v[0]*cL-v[2]*sL,z1=v[2]*cL+v[0]*sL;return[x,v[1]*c0-z1*s0,v[1]*s0+z1*c0]};
 f.save();f.globalAlpha=al;
 const rim=f.createRadialGradient(cx,cy,R*.985,cx,cy,R*1.09);rim.addColorStop(0,'rgba(60,170,255,.34)');rim.addColorStop(1,'rgba(60,170,255,0)');
 f.fillStyle=rim;f.beginPath();f.arc(cx,cy,R*1.09,0,7);f.fill();
 const bd=f.createRadialGradient(cx-R*.38,cy-R*.42,R*.05,cx,cy,R);bd.addColorStop(0,'rgb(18,30,54)');bd.addColorStop(.6,'rgb(7,11,21)');bd.addColorStop(1,'rgb(3,5,10)');
 f.fillStyle=bd;f.beginPath();f.arc(cx,cy,R,0,7);f.fill();
 f.strokeStyle='rgba(140,170,230,.07)';f.lineWidth=1;
 for(let lo=-180;lo<180;lo+=30){f.beginPath();let pen=false;for(let la=-90;la<=90;la+=4){const p=pr(hv(la,lo));if(p[2]>0){pen?f.lineTo(cx+R*p[0],cy-R*p[1]):f.moveTo(cx+R*p[0],cy-R*p[1]);pen=true}else pen=false}f.stroke()}
 for(let la=-60;la<=60;la+=30){f.beginPath();let pen=false;for(let lo=-180;lo<=180;lo+=4){const p=pr(hv(la,lo));if(p[2]>0){pen?f.lineTo(cx+R*p[0],cy-R*p[1]):f.moveTo(cx+R*p[0],cy-R*p[1]);pen=true}else pen=false}f.stroke()}
 const ls=Math.min(3.4,Math.max(1.3,R*.0062));
 for(const q of GL){const p=pr(q.v);if(p[2]<=0)continue;f.fillStyle=`rgba(160,180,230,${.16+.5*p[2]})`;f.fillRect(cx+R*p[0]-ls/2,cy-R*p[1]-ls/2,ls,ls)}
 f.globalCompositeOperation='lighter';
 const ss=Math.min(4.2,Math.max(1.4,R*.0058));
 for(const q of GS){if(q.d>day)continue;const p=pr(q.v);if(p[2]<=0)continue;
  const fr=1-clamp((day-q.d)/3.5),c=mix(BRGB[q.b],[255,255,255],fr*.9),s=ss*(q.b==0?1.15:1)*(1+2.4*fr)*(.6+.4*p[2]);
  f.fillStyle=rgb(c,(q.b>2?.45:.72)*(.35+.65*p[2]));f.beginPath();f.arc(cx+R*p[0],cy-R*p[1],s,0,7);f.fill();
  if(fr>.2){f.fillStyle=rgb([17,183,242],.08*fr*p[2]);f.beginPath();f.arc(cx+R*p[0],cy-R*p[1],s*4,0,7);f.fill()}}
 f.globalCompositeOperation='source-over';
 f.restore();
}

// ================= footage (Pixabay, pre-extracted at 30 fps)
window.PEND=[];
const FT={a2:{n:159},a:{n:111},b:{n:117},c:{n:162}};
function ftFrame(img,dir,t,t0){const n=clamp(Math.floor((t-t0)*30)+1,1,FT[dir].n);const src=`ft/${dir}/${String(n).padStart(4,'0')}.jpg`;
 if(img.dataset.src!==src){img.dataset.src=src;img.src=src;PEND.push(img.decode().catch(()=>{}))}}
function cover(box,img,x,y,w,h,r,zoom=1){box.style.left=x+'px';box.style.top=y+'px';box.style.width=w+'px';box.style.height=h+'px';box.style.borderRadius=r+'px';
 const s=Math.max(w/1920,h/1080)*zoom;tf(img,`translate(${(w-1920*s)/2}px,${(h-1080*s)/2}px) scale(${s})`)}

// ================= timeline (seconds)
const T={morph0:2.55,morph1:3.35,ld0:3.45,ld1:4.49,pill:5.4,fr0:7.35,lk0:7.55,unl:8.05,zero:7.8,frOut:10.3,tap:10.75,toSpot:10.88,ex0:11.2,ex1:11.95,scrub0:12.55,scrub1:13.35,col0:14.1,col1:14.65,n0:15.0,swipe:16.9,nBig:17.7,pOut:19.75,g0:20.0,gr0:20.55,gr1:24.0,gOut:25.35,iris0:25.55,iris1:26.35,logo:26.9,end:29.55};
const SCN=[[0,'First light'],[3.35,'Fast'],[7.35,'Free'],[10.7,'Clear'],[14.8,'No ads'],[19.9,'Gets better'],[24.55,'rosa.surf']];
const CH=['Fast','Free','Clear','No ads','Gets better'],CHT=[3.35,7.35,10.7,14.8,19.9,24.55];
$('prog').innerHTML=CH.map((c,i)=>`<span id="pg${i}">${c}</span>`).join('<span style="margin:0;color:#f5f0e822">/</span>');

// ================= skeleton (loading state)
$('skel').innerHTML=`<div class="a" style="left:16px;top:66px;width:150px;height:22px;border-radius:8px;background:#16171d"></div>
<div class="a" style="left:23px;top:116px;width:302px;height:307px;border-radius:22px;background:#111218"></div>
<div class="a" style="left:337px;top:116px;width:80px;height:307px;border-radius:22px;background:#111218"></div>
${[0,1,2].map(k=>`<div class="a" style="left:23px;top:${503+135*k}px;width:343px;height:125px;border-radius:22px;background:#111218"></div>`).join('')}
<div id="shim" class="a" style="left:0;top:0;width:390px;height:844px;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.07) 50%,transparent 70%);background-size:300% 100%"></div>`;

// ================= clutter: what most apps pile on (generic, no real brands)
const CL=[
 {w:'Banner ads',h:`<div class="ad" style="width:358px;height:62px;border-radius:12px;background:linear-gradient(90deg,#ffd23f,#ffb02e);color:#1b1300;display:flex;align-items:center;gap:10px;padding:0 14px;box-shadow:0 10px 30px rgba(0,0,0,.5)"><span style="font-size:10px;font-weight:800;background:#1b1300;color:#ffd23f;padding:2px 5px;border-radius:3px">AD</span><b style="font-size:15px">Win a free cruise! Tap now</b><span style="margin-left:auto;font-size:20px">&rsaquo;</span></div>`,x:16,y:58},
 {w:'Cookie walls',h:`<div class="ad" style="width:390px;height:250px;border-radius:24px 24px 0 0;background:#f4f4f6;color:#16171c;padding:22px 22px;box-shadow:0 -12px 40px rgba(0,0,0,.5)"><b style="font-size:19px">We value your privacy</b>${[300,330,260,310].map(w=>`<div style="height:9px;width:${w}px;border-radius:5px;background:#d6d7de;margin-top:12px"></div>`).join('')}<div style="display:flex;gap:10px;margin-top:22px"><div style="flex:1;height:46px;border-radius:12px;background:#2f6bff;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center">Accept all</div><div style="flex:1;height:46px;border-radius:12px;background:#e3e4ea;font-weight:700;display:flex;align-items:center;justify-content:center">Manage</div></div></div>`,x:0,y:594},
 {w:'Paywalls',h:`<div class="ad" style="width:330px;height:330px;border-radius:26px;background:linear-gradient(160deg,#6d3cff,#c23cf0);color:#fff;padding:28px;text-align:center;box-shadow:0 30px 70px rgba(0,0,0,.55)"><div style="font-size:46px">&#128274;</div><b style="display:block;font-size:30px;margin-top:6px;letter-spacing:-.02em">Unlock PRO</b><div style="font-size:15px;opacity:.85;margin-top:8px">Hourly forecasts are a premium feature</div><div style="height:52px;border-radius:26px;background:#fff;color:#6d3cff;font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center;margin-top:26px">Start free trial</div><div style="font-size:12px;opacity:.75;margin-top:12px">then $9.99 / month</div></div>`,x:30,y:190},
 {w:'Video ads',h:`<div class="ad" style="width:358px;height:250px;border-radius:18px;background:#0b0b0e;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.6);position:relative"><div style="position:absolute;inset:0;background:linear-gradient(135deg,#ff4d6d,#ff9f1c 60%,#ffd23f)"></div><div style="position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center"><div style="width:0;height:0;border-left:20px solid #fff;border-top:12px solid transparent;border-bottom:12px solid transparent;margin-left:5px"></div></div><div style="position:absolute;left:12px;top:12px;font-size:11px;font-weight:800;background:rgba(0,0,0,.6);color:#fff;padding:3px 7px;border-radius:4px">AD &middot; 1 of 2</div><div style="position:absolute;right:12px;bottom:12px;font-size:13px;font-weight:700;background:rgba(0,0,0,.65);color:#fff;padding:7px 12px;border-radius:6px">Skip in 5</div></div>`,x:16,y:420},
 {w:'Pop-ups',h:`<div class="ad" style="width:290px;height:200px;border-radius:22px;background:#fff;color:#16171c;text-align:center;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.6)"><b style="font-size:20px">Enjoying the app?</b><div style="font-size:30px;color:#ffb400;margin-top:10px;letter-spacing:4px">&#9733;&#9733;&#9733;&#9733;&#9733;</div><div style="height:44px;border-radius:22px;background:#16171c;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:18px">Rate us</div></div>`,x:50,y:300},
];
$('clutter').innerHTML=CL.map((c,i)=>`<div class="clut" id="cl${i}" style="left:${c.x}px;top:${c.y}px">${c.h}</div>`).join('');
$('nList').innerHTML=CL.map((c,i)=>`<div class="nl" id="nl${i}" style="top:${i*84}px"><span>${c.w}</span><s id="ns${i}" style="width:${0}px"></s></div>`).join('');

const CLT=CL.map((_,i)=>T.n0+.15+i*.33);

// ================= stage copy
$('bNum').innerHTML=chars('0.9-1.4')+`<span class="mask"><span style="font-size:.5em;font-weight:650;letter-spacing:-.02em;color:#acb4d2b0;margin-left:.22em">m</span></span>`;
$('eMark').innerHTML=MARK;

$('con').innerHTML=[0,1,2,3].map(k=>`<path id="cp${k}" stroke="#11b7f2" stroke-width="1.5"/><circle id="cd${k}" r="5" fill="#11b7f2"/><circle id="ce${k}" r="3" fill="#11b7f2"/>`).join('');
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYT=DAYS.slice(0,7).map(([d,b,h])=>{const dt=new Date(d+'T12:00:00Z');return `${DOW[dt.getUTCDay()]} ${dt.getUTCDate()} &nbsp;&middot;&nbsp; <b style="color:#f5f0e8;font-weight:650">${h[0].toFixed(1)}-${h[1].toFixed(1)} m</b>`});
$('frCol').innerHTML=['9','7','4','8','2','6','1','5','3','0'].map(d=>`<span style="display:block;height:1em">${d}</span>`).join('');
$('frChips').innerHTML=['All 2,741 spots','15 days ahead','Hour by hour','Swell alerts'].map(c=>`<span class="chip fc"><i></i>${c}</span>`).join('');
const fcs=[...document.querySelectorAll('.fc')];
$('gChips').innerHTML=['Updated 4&times; a day','Checked against ocean buoys','620 updates shipped'].map(c=>`<span class="chip gc" style="height:46px;font-size:19px"><i></i>${c}</span>`).join('');
const gcs=[...document.querySelectorAll('.gc')];
const CHW=640,CHH=240,GMAX=2741,DMAX=76;
const cx2=d=>d/DMAX*CHW,cy2=n=>CHH-n/GMAX*CHH;
const KX=Math.log(2741/40)/DMAX;const gAt=d=>Math.round(40*Math.exp(KX*clamp(d,0,DMAX)));
$('chart').innerHTML=`<defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#11b7f2" stop-opacity=".35"/><stop offset="1" stop-color="#11b7f2" stop-opacity="0"/></linearGradient><clipPath id="cc"><rect id="ccR" x="-10" y="-40" width="0" height="320"/></clipPath></defs>
 ${[0,1000,2000].map(n=>`<line x1="0" x2="${CHW}" y1="${cy2(n)}" y2="${cy2(n)}" stroke="#ffffff10"/><text x="${CHW+12}" y="${cy2(n)+5}" fill="#f5f0e855" font-size="13" font-weight="650" letter-spacing="2">${n.toLocaleString('en-US')}</text>`).join('')}
 ${[[0,'JUL 19'],[13,'AUG 1'],[44,'SEP 1'],[74,'OCT']].map(([d,l])=>`<text x="${cx2(d)}" y="${CHH+30}" fill="#f5f0e855" font-size="13" font-weight="650" letter-spacing="2.5">${l}</text>`).join('')}
 <g clip-path="url(#cc)"><path id="cA" fill="url(#cg)"/><path id="cL" stroke="#11b7f2" stroke-width="3" stroke-linejoin="round"/></g>
 <circle id="cH" r="7" fill="#fff" style="filter:drop-shadow(0 0 8px #11b7f2)"/>`;
{let d='';for(let i=0;i<=152;i++){const dd=i/2;d+=`${i?'L':'M'}${cx2(dd).toFixed(2)},${cy2(40*Math.exp(KX*dd)).toFixed(2)}`};$('cL').setAttribute('d',d);$('cA').setAttribute('d',d+`L${CHW},${CHH}L0,${CHH}Z`)}
const D0=new Date('2026-07-19T12:00:00Z'),MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const dLbl=d=>{const x=new Date(D0.getTime()+d*864e5);return `${MON[x.getUTCMonth()]} ${x.getUTCDate()}`};

// ================= phone pose
const phone=$('phone');let PH={x:600,y:548,s:1.08};
function pose(t){let x=600,y=548,s=1.08,rx=0,ry=0,rz=0;
 if(t<T.morph1+.4){const k=E.o4(P(t,2.9,T.morph1+.3));s=lerp(1.1,1.08,k)}
 else if(t<T.fr0){const k=E.io3(P(t,4.6,6.4));ry=-7*k;rx=2*k}
 else if(t<T.tap-.1){const k=E.io3(P(t,T.fr0,T.fr0+.8));ry=lerp(-7,8,k);rx=2;x=lerp(600,560,k)}
 else if(t<T.col0){const a=E.io3(P(t,T.tap-.1,T.tap+.3));x=lerp(560,600,a);ry=lerp(8,0,a);rx=lerp(2,0,a);
  const k=E.io4(P(t,T.ex0,T.ex0+.9));x=lerp(x,700,k);y=lerp(548,612,k);ry=lerp(ry,33,k);rx=lerp(rx,7,k);rz=lerp(0,-6,k);s=lerp(1.08,.96,k);ry-=6*P(t,T.ex0+.9,T.col0)}
 else if(t<T.pOut){const k=E.io4(P(t,T.col0,T.col1));x=lerp(700,600,k);y=lerp(612,548,k);ry=lerp(27,0,k);rx=lerp(7,0,k);rz=lerp(-6,0,k);s=lerp(.96,1.08,k);
  // clutter impacts jolt the phone
  for(const a of CLT){if(t>=a&&t<a+.35){const q=t-a;rz+=1.6*Math.exp(-q*14)*Math.sin(q*60);x+=5*Math.exp(-q*14)*Math.sin(q*48)}}
  ry+=-6*E.io3(P(t,T.nBig-.2,T.pOut))}
 else{const k=E.i3(P(t,T.pOut,T.pOut+.55));x=lerp(600,-420,k);ry=lerp(-6,40,k);y=548+50*k}
 return{x,y,s,rx,ry,rz}}
const S2=(x,y)=>[PH.x+(x-195)*PH.s,PH.y+(y-422)*PH.s];
function tabOn(i){for(let k=0;k<5;k++)$('tab'+k).style.color=k==i?'#f5f0e8':'#6f7590'}
const soft=(el,v,blur=10,dy=18)=>{op(el,v);el.style.filter=v<1?`blur(${(1-v)*blur}px)`:'none';return dy*(1-v)};

// measured text layout: done on the first render, after the web font has loaded
let LAID=false;
function layout(){if(LAID)return;LAID=true;
 {const en=$('end'),d=en.style.display;en.style.display='block';CTAW=$('ctaB').offsetWidth;['ctaR','ctaR2'].forEach(id=>$(id).style.width=CTAW+'px');en.style.display=d}
 const hd=$('spHead');const st=document.createElement('div');st.id='favStar';st.className='a';st.style.cssText='left:220px;top:59px;width:32px;height:32px';
 st.innerHTML=`<div id="favRing" class="a" style="left:0;top:0;width:32px;height:32px;border-radius:50%;border:2px solid #11b7f2"></div>`+[...Array(8)].map(()=>'<i class="fb a" style="left:13px;top:13px;width:6px;height:6px;border-radius:50%;background:#11b7f2"></i>').join('')+
  `<svg id="favFill" class="a" style="left:4px;top:4px" width="24" height="24" viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="#11b7f2" stroke="#11b7f2" stroke-width="1.6" stroke-linejoin="round"/></svg><div id="an3" class="a" style="left:40px;top:16px;width:1px;height:1px"></div>`;
 hd.insertBefore(st,$('ring2'));
 CL.forEach((_,i)=>$('ns'+i).style.width=($('nl'+i).querySelector('span').offsetWidth+12)+'px');
 const en=$('end'),d=en.style.display;en.style.display='block';
 const WW=$('eWord').offsetWidth,LK=190+36+WW,LX=960-LK/2;$('eMark').style.left=LX+'px';$('eWord').style.left=(LX+190+36)+'px';
 en.style.display=d}
window.READY=true;
let TN=0,FQ=-1,PHZ={x:0,y:0,s:1};
function renderC(t,u){
 PEND=[];layout();const tq=TQ;
 const fr=Math.round(t*240);
 $('hTc').textContent=`00:${String(Math.floor(t)).padStart(2,'0')}`;
 $('hScene').textContent=SCN.filter(s=>t>=s[0]).pop()[1];
 tf($('hBar'),`scaleX(${t/30})`);
 $('hLoc').innerHTML=t<19.9?'15.84&deg;N 97.05&deg;W &nbsp;&middot;&nbsp; Puerto Escondido':'2,741 spots &nbsp;&middot;&nbsp; worldwide';
 CH.forEach((c,i)=>{const on=t>=CHT[i]&&t<CHT[i+1];$('pg'+i).style.color=on?'#11b7f2':t>=CHT[i+1]?'#f5f0e870':'#f5f0e830'});
 op($('prog'),P(t,3.2,3.6)*(1-P(t,25.4,25.8)));op($('hud'),1-P(t,29.7,30.2));

 // camera
 const hit=(at,k)=>t>=at?Math.exp(-(t-at)*k):0;
 const cz=1+.006*t/30+.022*hit(T.zero,6)+.012*hit(T.swipe+.1,7);
 const cx=8*hit(T.zero,8)*Math.sin((t-T.zero)*55),cy=6*hit(T.zero,8)*Math.sin((t-T.zero)*47);
 const camT=`translate(${cx}px,${cy}px) scale(${cz})`;tf($('cam'),camT);tf(fx,camT);tf($('chartLbl'),camT);
 const inv=(X,Y)=>[(X-960-cx)/cz+960,(Y-540-cy)/cz+540];PHZ={x:cx,y:cy,s:cz};
 op($('flash'),.1*hit(T.zero,14)+.06*hit(T.swipe+.1,16));
 grain(fr);

 // world behind the phone: night sky + ocean lines
 PH=pose(t);
 sky(TN,905,0,960,905,PH.x,PH.y,E.o3(P(t,3.0,3.8))*(1-P(t,19.8,20.3)));
 ocean(TN,905,E.o3(P(t,3.0,3.8))*(1-P(t,19.8,20.3)),0,.62,960);

 // ---- opening: live footage, one question, then the footage becomes the screen
 const fa=$('ftA');const showA=t<T.morph1+.5;fa.style.display=showA?'block':'none';
 if(showA){ftFrame($('ftAi'),'a2',u,0);
  const k=E.io4(P(t,T.morph0,T.morph1));
  const tx=600-195*1.08,ty=548-422*1.08,tw=390*1.08,th=844*1.08,tr=54*1.08;
  cover(fa,$('ftAi'),lerp(0,tx,k),lerp(0,ty,k),lerp(1920,tw,k),lerp(1080,th,k),lerp(0,tr,k),1.04+.05*u/4.5);
  op($('ftAo'),1-.6*k);op(fa,1-P(t,T.morph1+.05,T.morph1+.4));
  fa.style.boxShadow=k>0?`0 0 0 ${3*k}px #0b0c10,0 40px 120px rgba(0,0,0,${.6*k})`:'none'}
 {const v=E.o3(P(t,.25,.75))*(1-P(t,2.25,2.5));const dy=soft($('oEy'),v,8,10);tf($('oEy'),`translateY(${dy}px)`);
  const q=E.o4(P(t,.55,1.35)),qo=E.i3(P(t,2.2,2.55));op($('oQ'),q*(1-qo));$('oQ').style.filter=`blur(${(1-q)*16+qo*14}px)`;
  tf($('oQ'),`translateY(${30*(1-q)-30*qo}px) scale(${1.04-.04*q})`);$('oQ').style.letterSpacing=lerp(.01,-.045,E.o5(P(t,.55,2.2)))+'em'}

 // ---- phone
 const ex=clamp(E.o4(P(t,T.ex0,T.ex1))-E.io3(P(t,T.col0-.05,T.col0+.4)));
 tf(phone,`translate(${PH.x}px,${PH.y}px) rotateX(${PH.rx}deg) rotateY(${PH.ry}deg) rotateZ(${PH.rz}deg) scale(${PH.s})`);
 phone.style.display=t>2.9&&t<T.pOut+.6?'block':'none';op(phone,E.o3(P(t,2.9,3.25)));
 $('glare').style.backgroundPosition=`${130-((t*16)%160)}% 0`;$('glare').style.display=ex>0?'none':'block';
 const zH=330*ex,zC=215*ex,zB=95*ex,zT=420*ex;
 const onHome=t<T.toSpot+.4,onSpot=t>=T.toSpot;
 $('home').style.display=onHome?'block':'none';$('spot').style.display=onSpot?'block':'none';
 tabOn(t<T.toSpot+.2?0:-1);
 tf($('status'),`translateZ(${zH+.5}px)`);tf($('tabs'),`translateZ(${zT}px)`);
 const sk=$('skel');sk.style.display=t>=T.morph1-.1&&t<T.ld1+.35?'block':'none';op(sk,1-E.o3(P(t,T.ld1,T.ld1+.3)));
 $('shim').style.backgroundPosition=`${150-((t-T.ld0)*190%300)}% 0`;
 if(onHome){
  op($('hmIn'),P(t,T.ld1-.02,T.ld1+.1));
  hcs.forEach((c,k)=>{const e=E.o5(P(t,T.ld1+k*.07,T.ld1+.6+k*.07));tf(c,`translate(${60*(1-e)*(k+1)}px,${40*(1-e)}px)`);op(c,e)});
  hmSl.forEach((s,k)=>{const e=E.o5(P(t,T.ld1+.1+k*.07,T.ld1+.75+k*.07));tf(s,`translateY(${70*(1-e)}px)`);op(s,e)});
  const pr=1-.035*Math.sin(Math.PI*P(t,T.tap-.04,T.tap+.16));tf(hcs[0],hcs[0].style.transform+` scale(${pr})`);
  const z=E.io3(P(t,T.toSpot,T.toSpot+.37));tf($('home'),`scale(${1+.16*z})`);$('home').style.transformOrigin='174px 270px';op($('home'),1-z);
 }
 if(onSpot){
  const cr=E.io4(P(t,T.toSpot,T.toSpot+.38));const sp=$('spot');
  sp.style.clipPath=cr<1?`inset(${lerp(116,0,cr)}px ${lerp(64.6,0,cr)}px ${lerp(421,0,cr)}px ${lerp(23.4,0,cr)}px round ${lerp(22,54,cr)}px)`:'none';
  tf($('spPage'),`translateY(${-209+26*(1-E.o5(P(t,T.toSpot,T.toSpot+.55)))}px)`);
  tf($('spBody'),`translateZ(${zB}px)`);tf($('spHead'),`translateZ(${zH}px)`);tf($('spCard'),`translateZ(${zC}px)`);
  const exOn=ex>.001;$('spCard').style.display=exOn?'block':'none';$('spCover').style.display=exOn?'block':'none';
  document.querySelectorAll('.slab').forEach(s=>op(s,Math.min(1,ex*3)));
  const dk=track([[T.scrub0,0],[T.scrub1,6,E.io3]],t),di=Math.round(dk);
  const dh=$('dayHi');op(dh,P(t,T.scrub0-.12,T.scrub0)*(1-P(t,T.col0-.05,T.col0+.1)));tf(dh,`translateX(${56*(di+(dk-di)*.25)}px)`);
  const t2=$('touch2'),r2=$('ring2');const ta=E.o3(P(t,T.scrub0-.3,T.scrub0-.1))*(1-P(t,T.scrub1+.05,T.scrub1+.2));
  op(t2,ta);tf(t2,`translate(${40+56*dk}px,${track([[T.scrub0-.3,300],[T.scrub0-.05,215,E.o3]],t)}px) scale(${1-.16*P(t,T.scrub0-.1,T.scrub0)})`);
  const rq=P(t,T.scrub0-.05,T.scrub0+.3);op(r2,rq>0&&rq<1?1-rq:0);tf(r2,`translate(40px,215px) scale(${1+rq*1.6})`);
  $('lab0s').innerHTML=t<T.scrub0?'Epic all week':DAYT[di];
  $('rowDim').style.display='none';
 }
 // clutter piles onto the screen, then one swipe clears it
 const clw=$('clutter');clw.style.display=t>T.n0&&t<T.swipe+.8?'block':'none';
 CL.forEach((c,i)=>{const e=$('cl'+i),a=CLT[i];const k=E.oB(P(t,a,a+.32),1.9);const sw=E.i3(P(t,T.swipe+.02*i,T.swipe+.42+.03*i));
  op(e,P(t,a,a+.05)*(1-sw*.2));tf(e,`translate(${sw*(520+i*30)}px,${-sw*(40+i*25)}px) rotate(${(i%2?-2.5:2)*(1-k)+sw*(16+i*6)}deg) scale(${lerp(1.35,1,k)})`);
  e.style.filter=sw>0?`blur(${sw*6}px)`:'none'});
 // touch on glass
 const tc=$('touch'),rg=$('ring');let ta=0,txp=0,typ=0,tsc=1,rq=-1,rx0=0,ry0=0;
 if(t>T.tap-.25&&t<T.tap+.3){ta=E.o3(P(t,T.tap-.25,T.tap-.12))*(1-P(t,T.tap+.12,T.tap+.26));txp=track([[T.tap-.25,250],[T.tap,180,E.o4]],t);typ=track([[T.tap-.25,420],[T.tap,300,E.o4]],t);tsc=1-.2*Math.sin(Math.PI*P(t,T.tap-.03,T.tap+.14));rq=P(t,T.tap+.03,T.tap+.4);rx0=180;ry0=300}
 else if(t>T.swipe-.3&&t<T.swipe+.55){ta=E.o3(P(t,T.swipe-.3,T.swipe-.15))*(1-P(t,T.swipe+.35,T.swipe+.5));txp=track([[T.swipe-.3,140],[T.swipe-.05,70,E.o3],[T.swipe+.35,380,E.i3]],t);typ=track([[T.swipe-.3,520],[T.swipe-.05,440,E.o3],[T.swipe+.35,400]],t);tsc=.86}
 op(tc,ta);tf(tc,`translate(${txp}px,${typ}px) translateZ(${zT+1}px) scale(${tsc})`);
 op(rg,rq>0&&rq<1?1-rq:0);tf(rg,`translate(${rx0}px,${ry0}px) scale(${1+rq*1.8})`);

 // ---- 01 fast
 const fb=$('fBox');const fIn=E.o5(P(t,3.25,3.85)),fOut=E.i4(P(t,5.15,5.45));
 op(fb,P(t,3.25,3.4)*(1-fOut));tf(fb,`translate(${-30*(1-fIn)}px,${-60*fOut}px)`);
 const el=clamp(t-T.ld0,0,1.04);$('fNum').textContent=clamp(tq-T.ld0,0,1.04).toFixed(2);
 $('fNum').style.color=t>=T.ld1?'#f5f0e8':'#11b7f2';
 tf($('fFill'),`scaleX(${el/2})`);tf($('fHead'),`translateX(${760*el/2}px) scale(${1+.8*hit(T.ld1,6)})`);
 op($('fSub'),E.o3(P(t,3.4,3.8)));op($('fNote'),E.o3(P(t,4.6,4.9)));op($('fBar'),E.o3(P(t,3.4,3.65)));
 const bp=$('bPill');
 if(t>T.pill&&t<T.fr0+.4){bp.style.display='block';const k=E.o5(P(t,T.pill,T.pill+.6));const[px0,py0]=S2(243.4,270);
  const s0=24*PH.s/176,ov=1+.08*Math.sin(Math.PI*P(t,T.pill+.32,T.pill+.8));const out=E.i4(P(t,T.fr0-.3,T.fr0));
  tf(bp,`translate(${lerp(px0,930,k)}px,${lerp(py0,290,k)-90*out}px) scale(${lerp(s0,1,k)*ov})`);op(bp,P(t,T.pill,T.pill+.06)*(1-out))}else bp.style.display='none';
 op($('bEy'),E.o3(P(t,5.7,6.05))*(1-P(t,T.fr0-.3,T.fr0-.1)));tf($('bEy'),`translateX(${-24*(1-E.o5(P(t,5.7,6.3)))}px)`);
 maskIn($('bNum'),t,5.75,.05,.65,T.fr0-.3,.02);op($('bNum'),t>5.7&&t<T.fr0+.2?1:0);
 maskIn($('bSub'),t,6.05,0,.65,T.fr0-.25);op($('bSub'),t>6.0&&t<T.fr0+.2?1:0);

 // ---- 02 free (live water behind)
 const fbg=$('ftB');const bv=E.o3(P(t,T.fr0-.15,T.fr0+.35))*(1-E.i3(P(t,T.frOut,T.frOut+.4)));fbg.style.display=bv>0?'block':'none';
 if(bv>0){ftFrame($('ftBi'),'b',TN,T.fr0-.15);op(fbg,bv);tf($('ftBi'),`scale(${1.06+.03*P(t,T.fr0,T.frOut)})`)}
 op($('frCh'),E.o3(P(t,7.55,7.85))*(1-P(t,T.frOut,T.frOut+.2)));
 const lk=$('lock');const showL=false;lk.style.display=showL?'block':'none';
 if(showL){const dr=E.io3(P(t,T.lk0,T.lk0+.45));[$('shkP'),$('lkB'),$('lkH')].forEach(p=>{const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L*(1-dr)});
  const un=E.spring(P(t,T.unl,T.unl+.5),1.6,6);tf($('shk'),`translate(0px,${-16*un}px) rotate(${-24*clamp(un,0,1.2)}deg)`);$('shk').style.transformOrigin='-28px -2px';
  const gone=E.i4(P(t,T.zero-.12,T.zero+.12));tf(lk,`scale(${1+.15*Math.sin(Math.PI*P(t,T.unl-.05,T.unl+.25))-.6*gone})`);op(lk,1-gone)}
 const fn=$('frNum');const showF=t>T.zero-.05&&t<T.frOut+.5;fn.style.display=showF?'block':'none';
 if(showF){const s=E.oB(P(t,T.zero,T.zero+.45),2.2);const out=E.i4(P(t,T.frOut,T.frOut+.35));
  tf(fn,`scale(${lerp(1.6,1,clamp(s,0,2))*(1-.3*out)}) translateY(${-80*out}px)`);fn.style.transformOrigin='590px 200px';op(fn,P(t,T.zero,T.zero+.06)*(1-out));
  const rl=E.o5(P(t,T.zero,T.zero+.8));tf($('frCol'),`translateY(${-9*rl}em)`);$('frCol').style.filter=`blur(${(1-rl)*(1-rl)*14}px)`}
 maskIn($('frSub'),t,8.25,0,.65,T.frOut);op($('frSub'),t>8.2&&t<T.frOut+.5?1:0);
 fcs.forEach((c,i)=>{const a=8.55+i*.1,e=E.o5(P(t,a,a+.45)),o=E.i3(P(t,T.frOut+i*.03,T.frOut+.3+i*.03));op(c,e*(1-o));tf(c,`translateY(${30*(1-e)+40*o}px) scale(${.9+.1*e})`)});

 // ---- 03 clear
 op($('oCh'),E.o3(P(t,T.ex0+.15,T.ex0+.5))*(1-P(t,T.col0,T.col0+.2)));tf($('oCh'),`translateX(${-20*(1-E.o5(P(t,T.ex0+.15,T.ex0+.7)))}px)`);
 const showC=t>T.ex0+.2&&t<T.col1;$('con').style.display=showC?'block':'none';
 for(let k=0;k<3;k++){const lb=$('lab'+k),a=T.ex0+.42+k*.2,o=T.col0-.08+k*.04;
  op(lb,t>a-.05&&t<o+.5?1:0);maskIn(lb,t,a,0,.6,o);
  const ii=lb.querySelector('.i'),ss=lb.querySelector('.s');op(ii,E.o3(P(t,a,a+.3))*(1-P(t,o,o+.2)));op(ss,E.o3(P(t,a+.15,a+.5))*(1-P(t,o,o+.2)));tf(ss,`translateY(${14*(1-E.o5(P(t,a+.15,a+.6)))}px)`);
  if(showC){const r=$('an'+k).getBoundingClientRect();const[ax,ay]=inv(r.left,r.top);const lx=1226,ly=[190,390,590][k]+52;
   const d=E.io3(P(t,a-.12,a+.35)),e=E.i3(P(t,o-.05,o+.25));const mx=lerp(ax,lx,.55);
   const p=$('cp'+k);p.setAttribute('d',`M${ax},${ay} L${mx},${ay} L${mx},${ly} L${lx},${ly}`);const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L*(1-d)-L*e;op(p,.8);
   const c1=$('cd'+k),c2=$('ce'+k);c1.setAttribute('cx',ax);c1.setAttribute('cy',ay);c2.setAttribute('cx',lx);c2.setAttribute('cy',ly);op(c1,P(t,a-.12,a-.02)*(1-e));op(c2,P(t,a+.22,a+.3)*(1-P(t,o,o+.2)))}}

 // ---- 04 no ads, no bloat
 op($('nCh'),E.o3(P(t,T.n0,T.n0+.3))*(1-P(t,T.pOut-.1,T.pOut+.1)));tf($('nCh'),`translateX(${-20*(1-E.o5(P(t,T.n0,T.n0+.5)))}px)`);
 CL.forEach((c,i)=>{const n=$('nl'+i),a=CLT[i]+.05;const e=E.o5(P(t,a,a+.4));const st=E.io3(P(t,T.swipe+.05+i*.06,T.swipe+.35+i*.06));
  const go=E.i3(P(t,T.nBig-.35+i*.03,T.nBig-.05+i*.03));
  op(n,P(t,a,a+.1)*(1-go)*(1-.45*st));tf(n,`translate(${-40*(1-e)-60*go}px,0)`);n.style.color=st>.5?'#acb4d270':'#acb4d2';tf($('ns'+i),`scaleX(${st})`)});
 maskIn($('nBig'),t,T.nBig,.12,.65,T.pOut-.1,.05);op($('nBig'),t>T.nBig-.05&&t<T.pOut+.4?1:0);
 {const v=E.o3(P(t,T.nBig+.4,T.nBig+.8))*(1-P(t,T.pOut-.1,T.pOut+.1));op($('nSub'),v);tf($('nSub'),`translateY(${16*(1-E.o5(P(t,T.nBig+.4,T.nBig+.9)))}px)`)}

 // ---- 05 gets better: the globe fills in the order spots were added
 f.clearRect(0,0,W,H);
 const day=DMAX*E.io3(P(t,T.gr0,T.gr1))+(t<T.gr0?-1:0);
 if(t>=T.g0&&t<T.iris1+.46){
  const k=E.o5(P(t,T.g0,T.g0+.85));
  const R=lerp(6,370,k),gx=lerp(960,640,E.o4(P(t,T.g0,T.g0+.85))),gy=lerp(540,560,k);
  const lon=-150+12*E.i3(P(TN,20.6,21.6))+40*Math.max(0,TN-20.6),lat=track([[T.g0,8],[T.gr1,18]],t);
  const cl2=E.io3(P(t,T.iris1,T.iris1+.45));globe(gx,gy,R*(1-cl2),lon+220*cl2,lat,day,P(t,T.g0,T.g0+.12)*(1-P(t,T.iris1+.3,T.iris1+.45)));
 }
 const gOut=P(t,T.gOut,T.gOut+.3);
 op($('gCh'),E.o3(P(t,T.g0+.3,T.g0+.6))*(1-gOut));
 const dayQ=DMAX*E.io3(P(tq,T.gr0,T.gr1));$('gCnt').textContent=Math.max(40,gAt(dayQ)).toLocaleString('en-US');
 maskIn($('gNum'),t,T.g0+.4,0,.6,T.gOut);op($('gNum'),t>T.g0+.35&&t<T.gOut+.4?1:0);
 maskIn($('gSub'),t,T.g0+.55,0,.6,T.gOut+.02);op($('gSub'),t>T.g0+.5&&t<T.gOut+.4?1:0);
 op($('chart'),E.o3(P(t,T.g0+.45,T.g0+.85))*(1-gOut));
 $('ccR').setAttribute('width',cx2(Math.max(0,day))+10);
 const hx=cx2(clamp(day,0,DMAX)),hy2=cy2(40*Math.exp(KX*clamp(day,0,DMAX)));$('cH').setAttribute('cx',hx);$('cH').setAttribute('cy',hy2);op($('cH'),t>T.gr0-.1?1:0);
 const cl=$('chartLbl');cl.innerHTML=t>T.gr0-.1&&t<T.gOut+.3?`<div class="hud" style="position:absolute;left:${1180+hx-60}px;top:${470+hy2-40}px;width:120px;text-align:center;color:#f5f0e8">${dLbl(Math.max(0,dayQ))}</div>`:'';op(cl,1-gOut);
 gcs.forEach((c,i)=>{const a=T.gr1-.4+i*.15,e=E.o5(P(t,a,a+.45));op(c,e*(1-gOut));tf(c,`translateY(${24*(1-e)}px)`)});

 // ---- closing: an iris opens from the globe onto live footage
 const fc=$('ftC');const showCl=t>=T.iris0;fc.style.display=showCl?'block':'none';
 if(showCl){ftFrame($('ftCi'),'c',t,T.iris0);const k=E.io4(P(t,T.iris0,T.iris1));
  const cl2=E.io3(P(t,T.iris1,T.iris1+.45));const hole=lerp(lerp(2300,385,k),0,cl2);fc.style.clipPath='none';const mk=hole>.5?`radial-gradient(circle at 640px 560px, transparent ${hole}px, #000 ${hole+1.5}px)`:'none';fc.style.webkitMaskImage=mk;fc.style.maskImage=mk;
  tf($('ftCi'),`scale(${lerp(1.2,1.04,E.o3(P(t,T.iris0,T.iris1+.6)))+.03*P(t,T.iris1,30)})`);$('ftCi').style.transformOrigin='960px 540px';
  op($('ftCo'),.55+.45*E.o3(P(t,T.logo-.3,T.logo+.5)))}
 const en=$('end');en.style.display=t>=T.logo?'block':'none';
 if(t>=T.logo){
  const m=E.o4(P(t,T.logo,T.logo+.8)),w=E.o4(P(t,T.logo+.12,T.logo+.95));
  op($('eMark'),m);$('eMark').style.filter=`blur(${(1-m)*12}px)`;tf($('eMark'),`translateX(${-30*(1-m)}px) scale(${lerp(.86,1,m)})`);
  op($('eWord'),w);$('eWord').style.filter=`blur(${(1-w)*12}px)`;tf($('eWord'),`translateX(${30*(1-w)}px)`);
  const u=E.o3(P(t,27.75,28.2));op($('eUrl'),u);$('eUrl').style.filter=`blur(${(1-u)*6}px)`;
  {const c=E.oB(P(t,27.1,27.65),1.6);const cb=$('cta');op(cb,clamp(c*2.5));cb.style.filter=c<1?`blur(${(1-clamp(c))*8}px)`:'none';tf(cb,`translateY(${24*(1-clamp(c))}px) scale(${lerp(.8,1,c)})`);cb.style.transformOrigin='960px 48px';
   const sw=((t-27.7)%1.5+1.5)%1.5;tf($('ctaS'),`translateX(${t<27.7?-200:lerp(-200,CTAW+80,E.io3(clamp(sw/.7)))}px) skewX(-18deg)`);
   [['ctaR',0],['ctaR2',.75]].forEach(([id,ph])=>{const rp=t<27.65?-1:((t-27.65+ph)%1.5)/1.5;const e=$(id);op(e,rp>=0?(1-rp)*.75:0);tf(e,`translateX(-50%) scale(${1+rp*.18},${1+rp*.5})`)});
   $('ctaB').style.boxShadow=`0 18px ${60+30*Math.sin(t*4.2)}px rgba(17,183,242,${.5+.15*Math.sin(t*4.2)}),0 0 0 1.5px rgba(255,255,255,.4) inset`}
  const g2=0;op($('eTag'),g2);$('eTag').style.filter=`blur(${(1-g2)*6}px)`;tf($('eTag'),`translateY(${10*(1-g2)}px)`);
 }
 op($('fade'),E.io3(P(t,30.1,30.5)));
 return PEND;
}

// ================= v3: logo intro + a title card before each stage
const INTRO=.95,CARD=.7,CARDS=[[3.22,'01','Fast','#fBox .chap'],[7.54,'02','Free','#frCh'],[9.9,'03','Clear','#oCh'],[15.45,'04','No ads','#nCh'],[20.58,'05','Gets better','#gCh']];
const TEND=30.6,TOTAL=INTRO+TEND+CARDS.length*CARD;
function mapT(u){let t=u-INTRO;if(t<0)return{t:0,card:-1,cu:0};
 for(let k=0;k<CARDS.length;k++){const c=CARDS[k][0];if(t<c)return{t,card:-1,cu:0};if(t<c+CARD)return{t:c,card:k,cu:t-c};t-=CARD}
 return{t,card:-1,cu:0}}
let TAG=[];
function layout3(){
 $('iWord').innerHTML='rosa<span style="color:#11b7f2">.</span>';$('iMark').innerHTML=MARK;
 const WW=$('iWord').offsetWidth,LK=150+28+WW,LX=960-LK/2;$('iMark').style.left=LX+'px';$('iWord').style.left=(LX+150+28)+'px';
 TAG=CARDS.map(([,,,sel])=>{const el=document.querySelector(sel);const tn=[...el.childNodes].find(n=>n.nodeType==3&&n.textContent.trim());const rg=document.createRange();rg.selectNodeContents(tn);const b=rg.getBoundingClientRect();return{x:b.left,y:b.top,h:b.height,fs:parseFloat(getComputedStyle(el).fontSize)}});
 $('card').style.display='block';CARDS.forEach((c,k)=>{$('cw').textContent=c[2].toUpperCase();c.w=$('cw').offsetWidth});$('card').style.display='none'}
let L3=false;
// favorites beat: tap the star on the lifted header, it fills, label D draws in
function favBeat(t){
 const q=FQ,fs=$('favStar');if(!fs)return;
 const onS=t>=10.88;fs.style.display=onS?'block':'none';
 const fill=q<0?0:E.oB(P(q,.32,.62),2.4);
 tf($('favFill'),`scale(${fill})`);op($('favFill'),q<.32?0:1);
 [...document.querySelectorAll('.fb')].forEach((d,i)=>{const p=P(q,.32,.85);const a=i/8*6.283;tf(d,`translate(${Math.cos(a)*30*E.o3(p)}px,${Math.sin(a)*30*E.o3(p)}px) scale(${1-p})`);op(d,p>0&&p<1?1:0)});
 const rq=P(q,.32,.8);op($('favRing'),rq>0&&rq<1?1-rq:0);tf($('favRing'),`scale(${.6+rq*1.8})`);
 if(q>=0&&q<.75){const t2=$('touch2');op(t2,E.o3(P(q,0,.12))*(1-P(q,.5,.65)));tf(t2,`translate(${track([[0,180],[.3,236,E.o4]],q)}px,${track([[0,190],[.3,75,E.o4]],q)}px) scale(${1-.2*Math.sin(Math.PI*P(q,.26,.42))})`)}
 // label D + connector, exiting with the others
 const lb=$('lab3'),a=.45,o=1.4+(T.col0-.08+.12-FAVT);const tq=q;
 op(lb,q>a-.05&&q<o+.5?1:0);maskIn(lb,tq,a,0,.6,o);
 const ii=lb.querySelector('.i'),ss=lb.querySelector('.s');op(ii,E.o3(P(tq,a,a+.3))*(1-P(tq,o,o+.2)));op(ss,E.o3(P(tq,a+.15,a+.5))*(1-P(tq,o,o+.2)));tf(ss,`translateY(${14*(1-E.o5(P(tq,a+.15,a+.6)))}px)`);
 const p=$('cp3'),c1=$('cd3'),c2=$('ce3');
 if(q>=0&&t<T.col1){const r=$('an3').getBoundingClientRect();const cz=PHZ;const ax=(r.left-960-cz.x)/cz.s+960,ay=(r.top-540-cz.y)/cz.s+540;const lx=1226,ly=790+52;
  const d=E.io3(P(tq,a-.12,a+.35)),e=E.i3(P(tq,o-.05,o+.25));const mx=lerp(ax,lx,.55);
  p.setAttribute('d',`M${ax},${ay} L${mx},${ay} L${mx},${ly} L${lx},${ly}`);const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L*(1-d)-L*e;op(p,.8);
  c1.setAttribute('cx',ax);c1.setAttribute('cy',ay);c2.setAttribute('cx',lx);c2.setAttribute('cy',ly);op(c1,P(tq,a-.12,a-.02)*(1-e));op(c2,P(tq,a+.22,a+.3)*(1-P(tq,o,o+.2)))}
 else{op(p,0);op(c1,0);op(c2,0)}
}
const OPS=[{at:9.45,type:'skip',d:.8},{at:13.6,type:'hold',d:1.4},{at:24.5,type:'skip',d:.5}];
function WARP(tn){let off=0;for(const op of OPS){const c=tn+off;if(c<op.at)return{t:c,h:-1};if(op.type=='skip')off+=op.d;else{if(c<op.at+op.d)return{t:op.at,h:c-op.at};off-=op.d}}return{t:tn+off,h:-1}}
const FAVT=13.6;
let TQ=0,CTAW=400;
const SPEED=(INTRO+TEND+5*CARD)/30;
function render(x){
 const u=x*SPEED;
 {const xq=Math.floor((Math.round(x*240)+2)/4)/60;const mq=mapT(xq*SPEED);TQ=WARP(mq.t).t}
 if(!L3){layout();layout3();L3=true}
 const m=mapT(u);const w=WARP(m.t);TN=m.t;FQ=w.t<FAVT?-1:(w.h>=0?w.h:1.4+(w.t-FAVT));const pend=renderC(w.t,u);favBeat(w.t);
 // HUD on the output clock
 $('hTc').textContent=`00:${String(Math.floor(x)).padStart(2,'0')}`;tf($('hBar'),`scaleX(${x/30})`);
 // intro: the logo, then it hands over to the question
 const ii=$('intro');ii.style.display=u<INTRO+.1?'block':'none';
 if(u<INTRO+.1){const a=E.o4(P(u,.08,.5)),o=E.i3(P(u,.7,.95));
  op($('iBg'),1-E.io3(P(u,.64,.95)));
  op($('iMark'),a*(1-o));$('iMark').style.filter=`blur(${(1-a)*12+o*10}px)`;tf($('iMark'),`translateX(${-24*(1-a)}px) scale(${lerp(.86,1,a)*(1+.06*o)})`);
  const w=E.o4(P(u,.16,.58));op($('iWord'),w*(1-o));$('iWord').style.filter=`blur(${(1-w)*12+o*10}px)`;tf($('iWord'),`translateX(${24*(1-w)}px) scale(${1+.06*o})`);
  $('iMark').style.transformOrigin=$('iWord').style.transformOrigin='960px 430px'}
 if(u<INTRO){op($('hud'),E.o3(P(u,.5,.95)))}
 // title card: content freezes under a blur, the stage name lands, then flies into its tag
 const cd=$('card'),bk=$('blurBk');
 if(m.card>=0){const c=CARDS[m.card],q=m.cu;cd.style.display=bk.style.display='block';
  const inn=E.o4(P(q,0,.32)),out=E.io4(P(q,.47,CARD));
  const bl=(E.o3(P(q,0,.25)))*(1-E.i3(P(q,.43,CARD)));bk.style.backdropFilter=`blur(${18*bl}px) brightness(${1-.45*bl})`;op(bk,1);
  $('cn').textContent=c[1];$('cw').textContent=c[2].toUpperCase();
  const tg=TAG[m.card];const fs=280,base=Math.min(1,1180/c.w),X0=960-c.w*base/2,Y0=410+(1-base)*120;
  const sc=lerp(lerp(1.08,1,inn)*base,tg.fs/fs,out);
  const x=lerp(X0,tg.x,out),y=lerp(Y0,tg.y-2,out);
  const cwEl=$('cw');tf(cwEl,`translate(${x}px,${y}px) scale(${sc})`);op(cwEl,P(q,0,.06)*(1-E.i3(P(q,.6,CARD))));
  cwEl.style.filter=`blur(${(1-inn)*14}px)`;cwEl.style.letterSpacing=lerp(.04,-.045,inn)+'em';
  const ln=$('cl');tf(ln,`translate(${960-c.w*base/2}px,${Y0+300*base}px) scaleX(${E.o4(P(q,.08,.45))*(1-out)})`);ln.style.width=c.w*base+'px';op(ln,1-out);
  const nm=$('cn');op(nm,E.o3(P(q,.05,.3))*(1-out));tf(nm,`translate(${960-c.w*base/2+6}px,${Y0-44+18*(1-E.o4(P(q,.05,.4)))}px)`);
  const sb=$('cs');sb.textContent=`${c[1]} / 05`;op(sb,E.o3(P(q,.12,.36))*(1-out));tf(sb,`translate(${960+c.w*base/2-120}px,${Y0-44}px)`);
  // the content's own tag stays hidden until the flying title reaches it
  const own=document.querySelector(c[3]);if(own)own.style.visibility='hidden';
 }else{cd.style.display=bk.style.display='none';CARDS.forEach(c=>{const own=document.querySelector(c[3]);if(own)own.style.visibility='visible'})}
 return pend}
document.fonts.ready.then(()=>render(0));
