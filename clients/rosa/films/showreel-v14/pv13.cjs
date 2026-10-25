const { chromium } = require('/home/shahar/Projects/oneshot/node_modules/playwright');
const Q=process.env.Q||'',V=Q.includes('916');
(async()=>{
 const b=await chromium.launch({args:['--allow-file-access-from-files']});
 const p=await b.newPage({viewport:V?{width:1080,height:1920}:{width:1920,height:1080}});
 p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto('file://'+__dirname+'/reel13.html?'+Q);await p.waitForFunction('window.READY');await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);
 for(const t of process.argv.slice(2).map(Number)){await p.evaluate(async t=>{await Promise.all(render(t))},t);await p.screenshot({path:`prev/q_${t.toFixed(2)}.jpg`,quality:75})}
 await b.close();})();
