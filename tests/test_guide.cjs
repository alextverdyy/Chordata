// Real GLB + WebGL browser checks. Run through a local server: file:// cannot fetch GLB.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const web=path.resolve(__dirname,'../web');
const shell=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--bg:#121212;--card:#1e1e1e;--line:#3a3a3a;--text:#eeeeee;--muted:#a8a8a8;--primary:#2196f3;--primary-soft:#16314b;color-scheme:dark}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 system-ui}main{max-width:730px;margin:auto;padding:12px}button{font:inherit;background:none;color:var(--text);border:1px solid var(--line);border-radius:7px}button:disabled{opacity:.45}details{padding:16px;background:var(--card);border-radius:12px}summary{min-height:44px;cursor:pointer}
</style><main><details id="guidePanel"><summary>Interactive measurement guide</summary><div id="guideApp"></div></details></main><script src="/guide.js" defer></script>`;
(async()=>{
  assert.ok(fs.statSync(path.join(web,'trident.glb')).size>100000,'Actual CAD GLB is required');
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://local').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(shell);return;}
    if(!['/guide.js','/trident.glb'].includes(pathname)){res.statusCode=404;res.end();return;}
    const file=path.join(web,pathname.slice(1));res.setHeader('Content-Type',pathname.endsWith('.glb')?'model/gltf-binary':'application/javascript');res.setHeader('Content-Length',fs.statSync(file).size);fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];
  try{
    async function pageFor(options={},noWebGL=false){
      const page=await browser.newPage(options);page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>assert.ok(r.url().startsWith(origin+'/'),'Viewer must use same-origin assets'));
      await page.addInitScript(noWebGL=>{
        window.__guideFrames=0;const native=requestAnimationFrame;window.requestAnimationFrame=fn=>native.call(window,t=>{window.__guideFrames++;fn(t);});
        if(noWebGL){const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args);};}
      },noWebGL);
      await page.goto(origin);await page.waitForFunction(()=>window.ChordataGuide);return page;
    }
    const page=await pageFor({viewport:{width:1100,height:1100}});
    let assetRequests=0;page.on('request',r=>{if(r.url().endsWith('/trident.glb'))assetRequests++;});
    assert.equal(await page.evaluate(()=>ChordataGuide.inspect(document.querySelector('#guideApp')).loaded),false);
    assert.equal(assetRequests,0,'Collapsed guide does not fetch CAD');
    await page.locator('#guidePanel summary').click();
    await page.waitForFunction(()=>document.querySelector('#guideApp').dataset.cadLoaded==='true',null,{timeout:120000});
    const actual=await page.evaluate(()=>ChordataGuide.inspect(document.querySelector('#guideApp')));
    assert.ok(actual.webgl&&actual.renderCalls>0,'Real Three.js renderer draws the decoded model');
    assert.ok(actual.meshCount>5&&actual.triangles>10000,'The model contains substantial actual CAD geometry');
    for(const role of ['belt_a','belt_b','toolhead','tensioner'])assert.ok(actual.roles[role]>0,'Actual CAD role exists: '+role);
    assert.match(await page.locator('.cg-status').textContent(),/CAD mesh groups/);
    assert.equal(assetRequests,1);
    assert.equal(await page.locator('[data-step]').count(),6);
    assert.match(await page.locator('.cg-text').textContent(),/official Voron Trident CAD/);
    for(const width of [390,1100]){await page.setViewportSize({width,height:1100});await page.screenshot({path:'/tmp/chordata-guide-cad-whole-'+width+'.png',fullPage:true});}
    await page.locator('[data-step="1"]').click();
    assert.match(await page.locator('.cg-text').textContent(),/instructional overlay/);
    const before=await page.locator('canvas').screenshot();
    await page.locator('canvas').focus();await page.keyboard.press('ArrowRight');
    assert.notDeepEqual(await page.locator('canvas').screenshot(),before,'Keyboard orbit changes rendered CAD');
    await page.keyboard.press('Home');
    await page.locator('[data-action=whole]').click();
    assert.notDeepEqual(await page.locator('canvas').screenshot(),before,'Whole printer gives context from step focus');
    await page.locator('[data-action=focus]').click();
    await page.locator('input').fill('500');
    assert.notDeepEqual(await page.locator('canvas').screenshot(),before,'Scrub explodes sensor illustration');
    const progressBeforePlay=await page.locator('input').inputValue();await page.locator('[data-action=play]').click();await page.waitForFunction(before=>document.querySelector('input').value!==before,progressBeforePlay);
    await page.locator('#guidePanel summary').click();await page.waitForTimeout(100);const stopped=await page.evaluate(()=>window.__guideFrames);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__guideFrames),stopped,'Collapsed CAD guide stops animation');
    await page.locator('#guidePanel summary').click();await page.waitForFunction(n=>window.__guideFrames>n,stopped);await page.locator('[data-action=play]').click();
    await page.locator('[data-step="3"]').click();
    await page.locator('[data-action=isolate]').click();assert.equal(await page.locator('[data-action=isolate]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-action=isolate]').click();await page.locator('[data-action=xray]').click();assert.equal(await page.locator('[data-action=xray]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-action=xray]').click();
    assert.match(await page.locator('.cg-check').textContent(),/signal decay automatically/);
    for(const width of [390,1100]){await page.setViewportSize({width,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/chordata-guide-cad-pluck-'+width+'.png',fullPage:true});}
    const reduced=await pageFor({reducedMotion:'reduce',viewport:{width:390,height:1000}});await reduced.locator('#guidePanel summary').click();await reduced.waitForFunction(()=>document.querySelector('#guideApp').dataset.cadLoaded==='true',null,{timeout:120000});await reduced.locator('[data-step="1"]').click();assert.equal(await reduced.locator('[data-action=play]').isDisabled(),true);assert.equal(await reduced.locator('.cg-motion').isVisible(),true);await reduced.locator('input').fill('750');await reduced.waitForTimeout(100);const reducedFrames=await reduced.evaluate(()=>window.__guideFrames);await reduced.waitForTimeout(150);assert.equal(await reduced.evaluate(()=>window.__guideFrames),reducedFrames,'Reduced motion schedules no continuous animation');
    const fallback=await pageFor({},true);await fallback.locator('#guidePanel summary').click();await fallback.waitForFunction(()=>document.querySelector('.cg-fallback').hidden===false);assert.equal(await fallback.evaluate(()=>ChordataGuide.inspect(document.querySelector('#guideApp')).loaded),false);await fallback.locator('[data-step="4"]').click();assert.match(await fallback.locator('h3').textContent(),/Repeat on belt B/);
    assert.deepEqual(errors,[]);
    console.log('CAD guide checks passed: actual GLB meshes and semantic parts, WebGL render, lazy same-origin assets, orbit/zoom/focus, isolate/x-ray, sensor scrub, paused lifecycle, reduced motion, fallback, mobile layout.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exit(1);});
