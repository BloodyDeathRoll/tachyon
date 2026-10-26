const { chromium } = require('/home/shahar/Projects/oneshot/node_modules/playwright');
const FPS=240,N=30*FPS,WK=+(process.env.WK||20),Q=process.env.Q,OUT=process.env.OUT,V=Q.includes('916');
(async()=>{
 const b=await chromium.launch({args:['--allow-file-access-from-files']});
 await Promise.all([...Array(WK).keys()].map(async w=>{
  const p=await b.newPage({viewport:V?{width:1080,height:1920}:{width:1920,height:1080}});
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+__dirname+'/reel13.html?'+Q);await p.waitForFunction('window.READY');await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);
  for(let i=w;i<N;i+=WK){await p.evaluate(async t=>{await Promise.all(render(t))},i/FPS);await p.screenshot({path:`${OUT}/f${String(i).padStart(5,'0')}.jpg`,quality:93});}
 }));
 await b.close();console.log('done',OUT);})();
