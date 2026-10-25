// generic reduced-rate preview renderer: HTML=<file> OUT=<dir> FPS=30 N=<frames> WK=8 VW=1080 VH=1920 Q=<query>
const { chromium } = require('/home/shahar/Projects/oneshot/node_modules/playwright');
const path=require('path'),fs=require('fs');
const HTML=path.resolve(process.env.HTML),OUT=process.env.OUT||'pv',FPS=+(process.env.FPS||30),N=+(process.env.N||30*FPS),WK=+(process.env.WK||8);
const VW=+(process.env.VW||1080),VH=+(process.env.VH||1920),Q=process.env.Q?'?'+process.env.Q:'';
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const b=await chromium.launch({args:['--allow-file-access-from-files']});
 await Promise.all([...Array(WK).keys()].map(async w=>{
  const p=await b.newPage({viewport:{width:VW,height:VH}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+HTML+Q); await p.waitForFunction('window.READY');
  for(let i=w;i<N;i+=WK){await p.evaluate(t=>render(t),i/FPS);await p.screenshot({path:`${OUT}/f${String(i).padStart(5,'0')}.jpg`,quality:90});}
 }));
 await b.close(); console.log('done',OUT);})();
