// npm ci && npm run build:guide && npx playwright install chromium && node tools/capture-docs.cjs
const {chromium}=require('playwright');
const path=require('node:path');
const fs=require('node:fs');
const http=require('node:http');
const web=path.resolve(__dirname,'../web');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const file=path.resolve(web,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(web+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.js')?'text/javascript':'text/html');res.end(body);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 try {
  const directory=path.resolve(__dirname,'../docs/images');fs.mkdirSync(directory,{recursive:true});
  const page=await browser.newPage({viewport:{width:1280,height:960},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:'+server.address().port+'/?demo');
  await page.addStyleTag({content:'header.top { position:static!important; }'});
  await page.waitForFunction(()=>window.ChordataSpectrum&&window.ChordataGuide);
  for(const [width,name]of[[1280,'desktop-demo'],[390,'mobile-demo']]){
   await page.setViewportSize({width,height:960});
   await page.screenshot({path:path.join(directory,name+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1100,height:1000});
  await page.locator('#spectrumPanel').screenshot({path:path.join(directory,'sensor-spectrum.png')});
  await page.evaluate(()=>{
   document.getElementById('aiPanel').open=true;document.getElementById('aiForm').hidden=false;
   document.getElementById('aiEnabled').checked=true;document.getElementById('aiEndpoint').value='http://laya-host:8000/v1/systemone';
   document.getElementById('aiStatus').textContent='Illustration only · example endpoint · no review requested';
  });
  await page.locator('#aiPanel').screenshot({path:path.join(directory,'ai-settings.png')});
  await page.locator('#measurePanel details').evaluate(e=>e.open=true);
  await page.locator('#measurePanel').screenshot({path:path.join(directory,'measurement-data.png')});
  await page.locator('#guidePanel').evaluate(e=>e.open=true);
  await page.locator('#guidePanel').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.getElementById('guideApp').dataset.cadLoaded==='true',null,{timeout:90000});
  await page.locator('#guidePanel').screenshot({path:path.join(directory,'trident-cad-viewer.png')});
  await page.locator('#guideApp [data-step="3"]').click();
  await page.locator('#guidePanel').screenshot({path:path.join(directory,'trident-pluck-guide.png')});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#guidePanel').screenshot({path:path.join(directory,'trident-guide-mobile.png')});
  console.log('Captured offline demo, measured-spectrum illustration and actual CAD tutorial screenshots.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exit(1);});
