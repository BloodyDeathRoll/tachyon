// app.py's calendar scripts (CAL_JS, ADD_JS), copied. Changed: a refusal's text comes from the
// Worker's error page (`msg`: shell.ts errorPage's message), not a text/plain body. `__C__` is the client.

export const CAL_JS = `(()=>{const msg=t=>new DOMParser().parseFromString(t,'text/html').querySelector('.card p')?.textContent||t;
// remember this view (week/month + date) for the next visit to the calendar
document.cookie='cal___C__='+encodeURIComponent(location.search.replace(/[?&]hl=[^&]*/,''))+';path=/;max-age=31536000;samesite=lax';
const toast=document.getElementById('toast');
const say=(t,ms)=>{toast.textContent=t;toast.style.display='block';if(ms)setTimeout(()=>toast.style.display='none',ms);};
// press and hold (or grab the dots) to drag; a quick click still opens the video
const HOLD=350,SLOP=8;let st=null;
const targetAt=(x,y)=>{const e=document.elementFromPoint(x,y);if(!e)return null;
 const t=e.closest('.cell[data-slot],.cell[data-at],[data-day]');return t&&t!==st.el&&!st.el.contains(t)?t:null;};
document.querySelectorAll('.cell[data-slot]').forEach(c=>{
 c.addEventListener('dragstart',e=>e.preventDefault());
 c.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.pvb'))return;
  const grip=!!e.target.closest('.grip');
  st={el:c,x:e.clientX,y:e.clientY,id:e.pointerId,on:false,over:null,timer:null};
  const start=()=>{if(!st)return;st.on=true;c.setPointerCapture(st.id);const r=c.getBoundingClientRect();
   const g=c.cloneNode(true);g.classList.add('ghost');g.style.width=r.width+'px';g.style.height=r.height+'px';
   st.dx=st.x-r.left;st.dy=st.y-r.top;st.g=g;document.body.appendChild(g);move(st.x,st.y);
   c.classList.add('dragging');document.body.classList.add('dnd');if(navigator.vibrate)navigator.vibrate(15);};
  if(grip){e.preventDefault();start();}else st.timer=setTimeout(start,HOLD);});});
const move=(x,y)=>{st.g.style.transform=\`translate(\${x-st.dx}px,\${y-st.dy}px) rotate(-2deg) scale(1.04)\`;
 const t=targetAt(x,y);if(t!==st.over){if(st.over)st.over.classList.remove('over');st.over=t;if(t)t.classList.add('over');}};
document.addEventListener('pointermove',e=>{if(!st||e.pointerId!==st.id)return;
 if(!st.on){if(Math.hypot(e.clientX-st.x,e.clientY-st.y)>SLOP){clearTimeout(st.timer);st=null;}return;}
 e.preventDefault();move(e.clientX,e.clientY);});
const end=async e=>{if(!st||e.pointerId!==st.id)return;clearTimeout(st.timer);const s=st;st=null;if(!s.on)return;
 // swallow the click that follows a drag so it does not open the page
 const kill=ev=>{ev.preventDefault();ev.stopPropagation();};window.addEventListener('click',kill,{capture:true,once:true});setTimeout(()=>window.removeEventListener('click',kill,true),50);
 document.body.classList.remove('dnd');if(s.over)s.over.classList.remove('over');
 const t=e.type==='pointerup'?s.over:null;
 if(!t){s.g.remove();s.el.classList.remove('dragging');return;}
 const b=new URLSearchParams({slot:s.el.dataset.slot});
 if(t.dataset.slot)b.set('swap',t.dataset.slot);else if(t.dataset.at)b.set('at',t.dataset.at);else b.set('day',t.dataset.day);
 const r=await fetch('/__C__/move',{method:'POST',body:b}).catch(()=>null);
 s.g.remove();s.el.classList.remove('dragging');
 if(!r){say('Could not move it: no connection',3000);return;}
 if(!r.ok){say(msg(await r.text()),3000);return;}
 const tgt=t.dataset.day?t.querySelector('.cell.open[data-at]')||t:t;
 const A=s.el.getBoundingClientRect(),B=tgt.getBoundingClientRect(),ease='transform .5s cubic-bezier(.2,.8,.2,1)';
 [s.el,tgt].forEach(x=>{x.style.position='relative';x.style.zIndex=3;x.style.transition=ease;});
 requestAnimationFrame(()=>{s.el.style.transform=\`translate(\${B.left-A.left}px,\${B.top-A.top}px) scale(\${B.width/A.width})\`;
  if(tgt!==t||t.dataset.slot||t.dataset.at)tgt.style.transform=\`translate(\${A.left-B.left}px,\${A.top-B.top}px) scale(\${A.width/B.width})\`;});
 setTimeout(()=>location.reload(),560);};
document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&st&&st.on){st.g.remove();st.el.classList.remove('dragging');document.body.classList.remove('dnd');if(st.over)st.over.classList.remove('over');st=null;}});
const hl=document.querySelector('.cell.hl');if(hl)hl.scrollIntoView({block:'center',behavior:'smooth'});
// status filter: non-matching videos fade out, the grid keeps its shape (remembered)
const FK='tachyon.calfilter',setF=f=>{document.querySelectorAll('.cell[data-cls]').forEach(c=>c.classList.toggle('dim',f!=='all'&&c.dataset.cls!==f));
 document.querySelectorAll('.calfilt button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));try{localStorage.setItem(FK,f)}catch(_){}};
document.querySelectorAll('.calfilt button').forEach(b=>b.addEventListener('click',()=>setF(b.dataset.f)));
let f0='all';try{f0=localStorage.getItem(FK)||'all'}catch(_){}setF(f0);
})();
`;

export const ADD_JS = `(()=>{const msg=t=>new DOMParser().parseFromString(t,'text/html').querySelector('.card p')?.textContent||t;const m=document.getElementById('addnew');if(!m)return;const up=document.getElementById('addup'),gen=document.getElementById('addgen'),
prog=document.getElementById('addprog');let at='';
const open=a=>{at=a;gen.at.value=a;const d=new Date(a);document.getElementById('addat').textContent=d.toLocaleString(undefined,
{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});prog.textContent='';busy(false);m.hidden=false;};
const ub=up.querySelector('.pri'),busy=on=>{ub.disabled=on;ub.classList.toggle('busy',on);ub.textContent=on?'Uploading…':'Upload';};
document.addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(b&&!document.body.classList.contains('dnd')){e.preventDefault();open(b.dataset.add);}});
m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-close]'))m.hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')m.hidden=true;});
document.querySelectorAll('#addtabs a').forEach(t=>t.addEventListener('click',e=>{e.preventDefault();
document.querySelectorAll('#addtabs a').forEach(x=>x.classList.toggle('on',x===t));up.hidden=t.dataset.tab!=='up';gen.hidden=t.dataset.tab!=='gen';}));
up.addEventListener('submit',async e=>{e.preventDefault();const f=up.file.files[0];if(!f)return;prog.textContent='';busy(true);
const r=await fetch(\`/\${up.dataset.c}/new/upload?at=\${encodeURIComponent(at)}&name=\${encodeURIComponent(f.name)}\`,{method:'POST',body:f});
if(r.ok){location.href=r.url}else{busy(false);prog.textContent=msg(await r.text())}});})();`;
