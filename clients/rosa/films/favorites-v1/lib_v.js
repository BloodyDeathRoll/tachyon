const W=1080,H=1920, $=id=>document.getElementById(id);
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const P=(t,a,b)=>clamp((t-a)/(b-a));
const lerp=(a,b,x)=>a+(b-a)*x;
const E={
 o3:x=>1-Math.pow(1-x,3), o5:x=>1-Math.pow(1-x,5), i3:x=>x*x*x,
 io3:x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2,
 oX:x=>x>=1?1:1-Math.pow(2,-10*x), iX:x=>x<=0?0:Math.pow(2,10*x-10),
 ioX:x=>x<=0?0:x>=1?1:x<.5?Math.pow(2,20*x-10)/2:(2-Math.pow(2,-20*x+10))/2,
 oB:x=>{const c=1.9,c3=c+1;return 1+c3*Math.pow(x-1,3)+c*Math.pow(x-1,2)},
 spring:(x,f=2.2,d=7)=>x<=0?0:1-Math.exp(-d*x)*Math.cos(f*2*Math.PI*x),
};
function track(keys,t,ease=E.io3){
 if(t<=keys[0][0])return keys[0][1];
 for(let i=1;i<keys.length;i++){const[a,va]=keys[i-1],[b,vb]=keys[i];if(t<=b)return lerp(va,vb,ease((t-a)/(b-a)))}
 return keys[keys.length-1][1];
}
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const tf=(el,s)=>{el.style.transform=s};
const op=(el,v)=>{el.style.opacity=v};

const MARK=`<svg viewBox="0 0 64 64" width="100%" height="100%"><path fill="currentColor" transform="translate(32 32) scale(0.8) translate(-32 -32)" d="M11.2,36.2c0,8,7,17.2,16.2,18.1,2.5.2,6.5-.3,8.7-.4,2.5.6,5.2,1.1,7.6.4l1-.3c.9-.2,1.7-.2,2.6,0,.8.2,1.6.2,2.4.2.4,0,1.2,0,1.3-.3,0,0,0-.2,0-.2l-.4-.6h1.1c.4,0,.8,0,1.1-.3l-1.9-6.3-1.4-4.9c-.2-.8-.4-1.6-.5-2.5-.2-1.3,0-2.5.4-3.7.2-.5.2-1,.3-1.6,0-1,0-1.9-.5-2.900,0-.1,0-.4,0-.5.2-.7-.2-1.4-.9-1.6-.9-.3-1.700-.2-2.4-.9-.3-.3-.6-.7-.8-1-.6-1.7-1.6-3.2-2.7-4.6-.2-.2-.4-.4-.7-.5-.5-.2-1-.3-1.5-.4l-3.3-.6c-.3,0-.6-.1-.9,0l-.9.5c-.3.2-.6.3-.9.5-.4.2-.8.3-1.2.4.3.2.5.2.9.1-.2.2-.4.4-.6.6.5.2.7-.4,1.2-.7.2-.1.8-.2.8,0,0,.2-.4.4-.5.8,0,.1,0,.3.1.4.3-1,1.2-1.1,1.6-1.8.3,0,.5,0,.7.1,1,.3,2,.8,3,1.2.3.1.6.3.9.5.5.7,1,1.5,1.4,2.2.2.3.3.6.4.8l.2.9c-.8-.2-1.5-.6-1.5-1.5,0-.2,0-.4-.2-.4-.2,0-.5.2-.6.2h0c0-.1-.1-.2-.2-.2h-.2c0,.1-.2,0-.2,0l-.2.3-.2-.2s-.2,0-.2,0l-.3.5c-.1.2-.3.3-.5.3-.6,0-1.1.4-1.3,1-.4.9-.2,1.8.3,2.6-.2.4-.2.9,0,1.3.4.7,1.4.9,2,.3.3-.3.5-.7.4-1.2.7-.2,1.2-.9,1.7-.9.5,0,.8.4,1,.8.7,1.5,1.6,1.7,2.7,2.6.3.3.6.7.8,1.1.4,1.1-.7,1.6-1.6,2.1-1,.5-1.7,1.4-2,2.4-.3.8-2,1-2.7,1.6-2.3,2-6.5,3.7-10.9.7-9.9-6.7,5.1-31.4,14.4-22-3.2-6.1-9.6-4.4-16.3,1.4,9-11,20.9-5.4,21.9-4.6.8.7,1.2,1.9.4,2.7.6-.1,1-.6,1.2-1.1.3-.7.1-1.5-.2-2.2.1.2.2.3.3.5.3.7.4,1.4.2,2.1-.2.7-.8,1.3-1.5,1.5-.6.1-1.100,0-1.7-.3.7.6,1.6.7,2.4.4,1.5-.5,2.3-2.1,1.5-3.4C45,3.700,11.2,7.900,11.2,36.2Z"/></svg>`;

// ---------- icons
const ic={
 home:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20h-5v-6h-6v6H4z"/></svg>',
 star:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
 map:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/></svg>',
 swim:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 9c3-2 6 2 9 0s6-2 9 0M3 15c3-2 6 2 9 0s6-2 9 0"/></svg>',
 user:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
 search:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
 share:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>',
 therm:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z"/></svg>',
 wave:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 10c3-2 6 2 9 0s6-2 9 0M3 15c3-2 6 2 9 0s6-2 9 0"/></svg>',
 shirt:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3c0 2-2 3-4 3S8 5 8 3z"/></svg>',
};
