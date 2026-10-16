// Independent integration checks: actual WebGL/GLB, lazy local loading and fallback.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');

(async()=>{
 const root=path.resolve(__dirname,'../web');
 const server=http.createServer(async(req,res)=>{
  try {
   const pathname=new URL(req.url,'http://localhost').pathname;
   const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
   if(!file.startsWith(root+path.sep))throw new Error('outside web');
   const body=await fs.readFile(file);
   const type=file.endsWith('.js')?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':'text/html';
   res.writeHead(200,{'Content-Type':type,'Content-Length':body.length});res.end(body);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,
   args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1024,height:900}}),requests=[],errors=[];
  page.on('request',request=>requests.push(request.url()));
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.__printerConnections=0;window.WebSocket=class{constructor(){window.__printerConnections++;throw Error('Unexpected printer connection');}};});
  await page.goto(base+'/?demo');
  await page.waitForFunction(()=>window.ChordataGuide);
  assert.equal(await page.locator('#guidePanel').evaluate(element=>element.open),false);
  await page.waitForTimeout(250);
  assert.equal(requests.filter(url=>url.includes('trident.glb')).length,0,'Closed guide must not download CAD');
  await page.locator('#guidePanel summary').click();
  await page.waitForFunction(()=>window.ChordataGuide.inspect(document.querySelector('#guideApp')).loaded,{},{timeout:120000});
  const state=await page.evaluate(()=>window.ChordataGuide.inspect(document.querySelector('#guideApp')));
  assert.equal(state.webgl,true);assert.ok(state.meshCount>=4);assert.ok(state.triangles>10000);assert.ok(state.renderCalls>0);
  for(const role of ['belt_a','belt_b','toolhead','tensioner'])assert.ok(state.roles[role]>0,'Missing actual CAD role: '+role);
  const version=await page.locator('#guideApp canvas').evaluate(canvas=>canvas.getContext('webgl2').getParameter(canvas.getContext('webgl2').VERSION));
  assert.match(version,/WebGL 2/);
  assert.equal(requests.filter(url=>url.includes('trident.glb')).length,1);
  assert.equal(await page.evaluate(()=>window.__printerConnections),0);
  assert.ok(requests.every(url=>new URL(url).origin===base),'Viewer must use local assets only');
  await page.locator('#guideApp [data-step="3"]').click();
  await page.locator('#guideApp [data-action="isolate"]').click();
  assert.equal(await page.locator('#guideApp [data-action="isolate"]').getAttribute('aria-pressed'),'true');
  await page.locator('#guideApp [data-action="play"]').click();
  await page.waitForTimeout(150);
  await page.locator('#guidePanel summary').click();
  const progress=await page.locator('#guideApp input').inputValue();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#guideApp input').inputValue(),progress,'Hidden guide must stop animation');
  await page.locator('#guidePanel summary').click();
  await page.locator('#guideApp canvas').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(()=>document.querySelector('#guideApp .cg-fallback').hidden===false);
  assert.match(await page.locator('#guideApp .cg-status').textContent(),/context.*lost/i);
  await page.locator('#guideApp [data-step="4"]').click();
  assert.match(await page.locator('#guideApp h3').textContent(),/Repeat on belt B/);
  assert.deepEqual(errors,[]);
  await page.close();

  const fallback=await browser.newPage();
  const fallbackRequests=[];fallback.on('request',request=>fallbackRequests.push(request.url()));
  await fallback.addInitScript(()=>{
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};
  });
  await fallback.goto(base+'/?demo&guide');
  await fallback.waitForFunction(()=>document.querySelector('#guideApp .cg-fallback')?.hidden===false);
  assert.equal(fallbackRequests.filter(url=>url.includes('trident.glb')).length,0,'No CAD download when WebGL unavailable');
  await fallback.locator('#guideApp [data-action="next"]').click();
  assert.match(await fallback.locator('#guideApp h3').textContent(),/Secure the sensor/);
  assert.equal(await fallback.evaluate(()=>window.ChordataGuide.inspect(document.querySelector('#guideApp')).loaded),false);
  console.log('Independent CAD checks passed: real WebGL2 and official GLB geometry, lazy local loading, component roles, no printer connection, hidden animation stop, graphics-loss and written fallback.');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exit(1);});
