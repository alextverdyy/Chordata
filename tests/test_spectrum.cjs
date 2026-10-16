// Browser behavior of measured spectrum/quality diagnostics, no printer needed.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('file://'+path.resolve(__dirname,'../web/index.html')+'?demo');
  await page.waitForFunction(()=>window.ChordataSpectrum);
  assert.match(await page.locator('#spectrumStatus').textContent(),/Illustrative demo/);
  assert.equal(await page.locator('[data-series=response]').count(),1);
  await page.locator('#spectrumFreeze').click();
  const snapshot=await page.locator('[data-series=response]').getAttribute('d');
  await page.evaluate(()=>{S.chordata.belt_spectrum.power_db=S.chordata.belt_spectrum.power_db.map(()=>-50);render();});
  assert.equal(await page.locator('[data-series=response]').getAttribute('d'),snapshot);
  await page.locator('#spectrumFreeze').click();
  assert.notEqual(await page.locator('[data-series=response]').getAttribute('d'),snapshot);
  await page.evaluate(()=>{
   S.chordata.state='listening';S.chordata.belt_spectrum.active=false;
   S.chordata.belt_spectrum.noise_db=S.chordata.belt_spectrum.power_db.map(()=>20);
   S.chordata.belts.A={freq:110, freq_estimate:110.01,used:5, quality:{usable:true,repeatability:{ci95_hz:[109.91,110.11],ci95_half_width_hz:.1,stddev_hz:.08}}};
   render();
  });
  assert.doesNotMatch(await page.locator('#spectrumStatus').textContent(),/Recording/);
  assert.equal(await page.locator('[data-series=background]').count(),1);
  assert.match(await page.locator('#spectrumPlot').textContent(),/20/);
  assert.match(await page.locator('#qualityRows').textContent(),/109.91–110.11/);
  assert.equal(await page.evaluate(()=>resultOnTarget(S.chordata.belts.A,S.chordata.belts)),true);
  assert.equal(await page.evaluate(()=>resultOnTarget({...S.chordata.belts.A,freq_estimate:110.24},S.chordata.belts)),false);
  await page.evaluate(()=>{S.chordata.belt_spectrum=null;render();});
  assert.match(await page.locator('#spectrumStatus').textContent(),/Waiting|unavailable/);
  assert.equal(await page.locator('#spectrumPeak').textContent(),'');
  assert.equal(await page.locator('#spectrumDownload').isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Spectrum checks passed: measured-data rendering, freeze/resume, final frame, background scale, repeatability gate, clear state, mobile layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
