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
