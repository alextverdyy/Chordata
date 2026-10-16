/* Live sensor spectrum and repeatability readouts. GPL-3.0-or-later. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let frozen = false, frozenData = null, latest = null, latestContext = {}, frozenTarget = null;
  function node(tag, text, cls) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  }
  const valid = x => typeof x === 'number' && Number.isFinite(x);
  function usable(s) {
    return s && Array.isArray(s.frequencies_hz) && Array.isArray(s.power_db)
      && s.frequencies_hz.length > 1 && s.frequencies_hz.length <= 256
      && s.frequencies_hz.length === s.power_db.length
      && s.frequencies_hz.every((f,i,a) => valid(f) && (i===0 || f>a[i-1]))
      && s.power_db.every(valid);
  }
  function renderSpectrum(state, context) {
    const incoming=state.belt_spectrum;
    const spectrum=frozen ? frozenData : incoming;
    const status=$('spectrumStatus'), holder=$('spectrumPlot');
    $('spectrumFreeze').disabled=!usable(spectrum);
    $('spectrumFreeze').textContent=frozen?'Resume plot':'Freeze plot';
    $('spectrumFreeze').setAttribute('aria-pressed', String(frozen));
    const active=context.connected && context.klippyState==='ready' && state.state==='listening' && spectrum && spectrum.active!==false;
    const origin=context.demo?'Illustrative demo spectrum':context.connected?'Last captured sensor window':'Disconnected — last captured window';
    status.textContent=(frozen?'Frozen view · ':active?'Recording · ':'')+origin;
    if(!usable(spectrum)) {
      status.textContent=context.demo?'Demo spectrum unavailable':'Waiting for a sensor window';
      holder.replaceChildren(node('p','Record a belt to see the measured spectrum. This requires the updated Klipper plugin.','help'));
      $('spectrumMeta').textContent=''; $('spectrumPeak').textContent=''; $('spectrumDownload').disabled=true;
      return;
    }
    $('spectrumDownload').disabled=false;
    if(active&&!frozen)status.textContent='Recording · recent sensor window';
    const f=spectrum.frequencies_hz, p=spectrum.power_db;
    if(spectrum.signal_present===false)status.textContent=(frozen?'Frozen · ':'')+'No dynamic signal detected in this window';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 680 270'); svg.classList.add('spectrum');
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label','Sensor response versus frequency. Power is relative to this window peak. Target and twice target are marked; the highest peak can be a harmonic.');
    const add=(tag,attrs,text)=>{const e=document.createElementNS(svg.namespaceURI,tag); for(const k in attrs)e.setAttribute(k,attrs[k]); if(text)e.textContent=text; svg.append(e);return e;};
    const lo=f[0],hi=f[f.length-1],x=v=>62+(v-lo)/(hi-lo)*590;
    const noise=Array.isArray(spectrum.noise_db)&&spectrum.noise_db.length===f.length&&spectrum.noise_db.every(valid)?spectrum.noise_db:[];
    const top=Math.max(0,Math.ceil(Math.max(...p,...noise)/20)*20);
    const y=v=>218-(Math.max(-80,Math.min(top,v))+80)/(top+80)*180;
    for(let tick=0;tick<=4;tick++) { const db=-80+(top+80)*tick/4;
      add('line',{x1:62,x2:652,y1:y(db),y2:y(db),stroke:'var(--line)'});
      add('text',{x:50,y:y(db)+5,'text-anchor':'end'},String(Math.round(db)));
    }
    for(let i=0;i<=4;i++) {
      const hz=lo+(hi-lo)*i/4;
      add('text',{x:x(hz),y:242,'text-anchor':'middle'},Math.round(hz)+' Hz');
    }
    const path=values=>values.map((v,i)=>(i?'L':'M')+x(f[i]).toFixed(2)+','+y(v).toFixed(2)).join(' ');
    if(Array.isArray(spectrum.noise_db)&&spectrum.noise_db.length===f.length&&spectrum.noise_db.every(valid))
      add('path',{d:path(spectrum.noise_db),fill:'none',stroke:'var(--muted)','stroke-width':1.5,'stroke-dasharray':'4 4','data-series':'background'});
    add('path',{d:path(p),fill:'none',stroke:'var(--primary)','stroke-width':2,'data-series':'response'});
    const target=frozen?frozenTarget:(state.belts||{}).target;
    if(valid(target))for(const [hz,label] of [[target,'Target F'],[2*target,'Target 2F']]) {
      if(hz>=lo&&hz<=hi) {add('line',{x1:x(hz),x2:x(hz),y1:36,y2:218,stroke:'var(--warn)','stroke-dasharray':'5 5'});add('text',{x:x(hz),y:22,'text-anchor':'middle',fill:'var(--warn)'},label);}
    }
    holder.replaceChildren(svg);
    const number=(n,d)=>valid(n)?n.toFixed(d):'—';
    const metadata=['Display floor −80 dB',number(spectrum.window_seconds,2)+' s window',number(spectrum.resolution_hz,2)+' Hz window resolution',number(spectrum.sample_rate_hz,0)+' samples/s'];
    if(spectrum.captured_at&&valid(spectrum.captured_at))metadata.push('Captured '+new Date(spectrum.captured_at*1000).toLocaleTimeString());
    $('spectrumMeta').textContent=metadata.join(' · ');
    const peakIndex=p.reduce((best,v,i)=>v>p[best]?i:best,0);
    $('spectrumPeak').textContent=spectrum.signal_present===false?'No dynamic signal in this window; no frequency is inferred.':'Highest displayed bin: '+number(f[peakIndex],1)+' Hz. It may be the belt’s harmonic or a toolhead mode.';
  }
  function renderQuality(state) {
    const list=$('qualityRows'); list.replaceChildren();
    let count=0;
    for(const belt of ['A','B']) {
      const result=(state.belts||{})[belt]; if(!result)continue;
      const quality=result.quality, rep=quality&&quality.repeatability;
      const row=node('div',null,'quality-row');
      row.append(node('strong','Belt '+belt));
      if(!quality)row.append(node('span','No repeatability diagnostics in this result.'));
      else {
        const estimate=valid(result.freq_estimate)?result.freq_estimate:result.freq;
        const summary=[];
        if(valid(estimate))summary.push(estimate.toFixed(2)+' Hz');
        if(rep&&Array.isArray(rep.ci95_hz)&&rep.ci95_hz.length===2&&rep.ci95_hz.every(valid))
          summary.push('Nominal 95% mean repeatability interval '+rep.ci95_hz[0].toFixed(2)+'–'+rep.ci95_hz[1].toFixed(2)+' Hz');
        if(rep&&valid(rep.stddev_hz))summary.push('SD '+rep.stddev_hz.toFixed(2)+' Hz');
        row.append(node('span',summary.join(' · ')||'No accepted readings'));
        const why=Array.isArray(quality.reasons)?quality.reasons:[];
        const status=node('span',quality.usable?'Accepted series':why.join('; ')||'Repeat this series',quality.usable?'quality-pass':'quality-repeat');
        row.append(status);
      }
      list.append(row);count++;
    }
    const measurement=state.measurement||{};
    if(measurement.phase==='error')list.prepend(node('p','Capture failed: '+(measurement.error||'Check the recording and repeat.'),'quality-repeat'));
    $('qualityPanel').hidden=count===0&&measurement.phase!=='error';
  }
  function render(state,context={}) { latest=state||{};latestContext=context;renderSpectrum(latest,context);renderQuality(latest); }
  $('spectrumFreeze').onclick=()=>{if(!frozen){if(!usable(latest&&latest.belt_spectrum))return;frozenData=JSON.parse(JSON.stringify(latest.belt_spectrum));frozenTarget=(latest.belts||{}).target;}else frozenData=null;frozen=!frozen;render(latest,latestContext);};
  $('spectrumDownload').onclick=()=>{
    const s=frozen?frozenData:latest&&latest.belt_spectrum;if(!usable(s))return;
    const noise=Array.isArray(s.noise_db)&&s.noise_db.length===s.power_db.length&&s.noise_db.every(valid)?s.noise_db:null;
    const header='frequency_hz,power_db_relative_peak'+(noise?',background_db_same_reference':'');
    const csv=[header,...s.frequencies_hz.map((f,i)=>[f,s.power_db[i],...(noise?[noise[i]]:[])].join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='chordata-spectrum.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  window.ChordataSpectrum={render};
})();
