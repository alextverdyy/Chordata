/* Chordata CAD measurement guide. GPL-3.0. Bundled Three.js: MIT. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const assetURL = new URL('monolith-gantry.glb', document.currentScript?.src || location.href).href;
const viewers = new WeakMap();
  const steps = [
    {title:'Set the reference', short:'Reference', focus:'Free span', text:'Use your printer manufacturer’s belt span, toolhead position and target frequency. Measure both belts at equivalent spans and the same toolhead position. The viewer uses the Monolith R0 Trident 6 mm 2WD gantry from the source CAD. Select a source part to inspect it; use your own build’s documented span and target for measurement.', check:'Before measuring: printer idle, toolhead in the prescribed position, span and target confirmed.'},
    {title:'Secure the sensor', short:'Sensor', focus:'Sensor + rigid mount', text:'Attach the accelerometer rigidly to the toolhead using the recommended mount. Tighten the mounting screws and keep the cable clear of the belt and frame. A loose mount can resonate and change the result. This bare gantry CAD does not include a toolhead or sensor mount. Use the mounting instructions for your actual toolhead.', check:'Check: the sensor cannot rock, and the cable cannot rub or pull on the mount.'},
    {title:'Check the recording', short:'Quiet + tap', focus:'Toolhead tap', text:'Start the belt workflow. Stay still during the quiet baseline, then follow its prompt for one light tap on the toolhead. Chordata uses the tap to learn toolhead ringing and help reject knocks during measurement. It is not a belt measurement. Wait for the listening prompt before plucking.', check:'If the tap is not detected, inspect the sensor and connection before continuing.'},
    {title:'Pluck belt A', short:'Belt A', focus:'A · free span', text:'Pluck the middle of the prescribed free span sideways with a small, consistent movement. Release cleanly without touching the neighboring belt. Let it ring down before the next pluck. Follow the on-screen prompts and collect several accepted readings.', check:'The animation is slowed down. Chordata compares the fundamental (F), second harmonic (2F) and signal decay automatically. The highest spectrum peak alone may not be the fundamental; inspect accepted readings and quality before adjusting a belt.'},
    {title:'Repeat on belt B', short:'Belt B', focus:'B · equivalent span', text:'Record belt B using the same span length, toolhead position, pluck direction and strength. Do not move the toolhead or change the sensor mount between belts. Small differences are useful only when each belt’s repeated readings agree.', check:'Check the accepted count, spread, signal quality and rejected readings for both belts.'},
    {title:'Compare, adjust, repeat', short:'Compare', focus:'Manual tension adjustment', text:'Compare repeatability before comparing belt frequencies. If readings are scattered, improve the recording and repeat. If an adjustment is needed, stop recording, follow your printer’s tensioning procedure, then measure both belts again with the same setup.', check:'The guide does not move the printer or tension a belt. Frequency alone does not establish an absolute tension without the correct span and belt mass per length.'}
  ];
  const css = `
  .cg { margin-top:10px; font-size:16px; }
  .cg * { box-sizing:border-box; }
  .cg .cg-steps { display:flex; gap:5px; overflow-x:auto; padding:2px 2px 10px; scrollbar-color:var(--muted) var(--card); }
  .cg .cg-steps button { flex:0 0 auto; min-height:44px; padding:7px 10px; font-size:14px; border:1px solid var(--line); color:var(--text); border-radius:6px; background:var(--card); }
  .cg .cg-steps button[aria-current=step] { border-color:var(--primary); background:var(--primary-soft); }
  .cg .cg-stage { position:relative; overflow:hidden; border-radius:8px; background:var(--bg); }
  .cg canvas { display:block; width:100%; height:480px; touch-action:pan-y; cursor:grab; }
  .cg canvas:active { cursor:grabbing; }
  .cg .cg-badge { position:absolute; top:10px; left:12px; pointer-events:none; font-size:13px; color:var(--muted); }
  .cg .cg-legend { margin:7px 0 12px; font-size:13px; color:var(--muted); }
  .cg a { color:var(--primary); text-underline-offset:3px; }
  .cg .cg-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:10px 0; }
  .cg .cg-toolbar button { min-height:44px; padding:6px 10px; font-size:14px; border:1px solid var(--line); color:var(--text); border-radius:6px; }
  .cg .cg-toolbar label { display:flex; flex:1 1 160px; align-items:center; gap:8px; font-size:14px; }
  .cg input[type=range] { min-width:80px; width:100%; accent-color:var(--primary); min-height:38px; }
  .cg .cg-copy { min-height:192px; }
  .cg h3 { font-size:19px; margin:15px 0 6px; }
  .cg .cg-check { margin-top:10px; color:var(--muted); }
  .cg .cg-nav { display:flex; justify-content:space-between; gap:10px; margin-top:15px; }
  .cg .cg-nav button { min-height:44px; font-size:15px; }
  .cg button:focus-visible, .cg input:focus-visible, .cg canvas:focus-visible { outline:3px solid var(--primary); outline-offset:2px; }
  .cg .cg-fallback { padding:20px; }
  .cg [hidden] { display:none!important; }
  @media(max-width:480px) { .cg canvas { height:400px; } .cg .cg-copy { min-height:0; } }
  `;
  const extraCSS=`
  .cg .cg-status { position:absolute; left:12px; right:12px; bottom:10px; padding:7px 9px; background:var(--card); color:var(--text); font-size:13px; border-radius:4px; pointer-events:none; }
  .cg .cg-label { position:absolute; top:40px; left:12px; padding:4px 7px; background:var(--card); color:var(--text); font-size:14px; pointer-events:none; }
  .cg .cg-loadbar { width:100%; height:5px; display:block; accent-color:var(--primary); margin-top:3px; }
  .cg .cg-status[aria-busy=false] progress { display:none; }
  .cg .cg-selection { margin:5px 0; font-size:14px; color:var(--muted); }
  .cg button[aria-pressed=true] { background:var(--primary-soft); border-color:var(--primary); }
  `;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ROLE_COLORS={belt_a:0x399df4,belt_b:0xe6b344,x_axis:0x399df4,tensioner:0xda8c34};
function mount(root) {
  if(!root||root.dataset.guideMounted)return;
  root.dataset.guideMounted='true';root.classList.add('cg');
  if(!document.getElementById('chordataGuideStyle')){const style=document.createElement('style');style.id='chordataGuideStyle';style.textContent=css+extraCSS;document.head.append(style);}
  root.innerHTML=`<nav class="cg-steps" aria-label="Measurement guide steps">${steps.map((s,i)=>`<button type="button" data-step="${i}">${i+1}. ${s.short}</button>`).join('')}</nav>
  <div class="cg-stage"><span class="cg-badge">Monolith R0 · Trident 6 mm 2WD gantry</span><canvas tabindex="0" role="img" aria-label="3D CAD viewer. Drag to orbit, arrow keys rotate, plus or minus zoom, Home focuses the current step."></canvas><span class="cg-label" hidden></span><div class="cg-status" role="status" aria-live="polite" aria-busy="false"><span>Open the guide to load the CAD assembly.</span><progress class="cg-loadbar" max="1"></progress></div></div>
  <p class="cg-fallback" hidden>The 3D view is unavailable. The written guide below remains available. Try a browser with WebGL 2 enabled.</p>
  <p class="cg-legend">Drag to orbit · scroll or pinch to zoom · arrow keys rotate the focused viewer · Home focuses the step. Blue: upper belt A; amber: lower belt B. Pluck motion is a slowed teaching overlay. The CAD has no toolhead or sensor.</p>
  <div class="cg-toolbar"><button type="button" data-action="retry" hidden>Retry CAD loading</button><button type="button" data-action="focus">Focus step</button><button type="button" data-action="whole">Whole gantry</button><button type="button" data-action="isolate" aria-pressed="false">Isolate step parts</button><button type="button" data-action="xray" aria-pressed="false">See through frame</button><button type="button" data-action="out" aria-label="Zoom out">Zoom −</button><button type="button" data-action="in" aria-label="Zoom in">Zoom +</button></div>
  <p class="cg-selection">Select the CAD to identify a source part. Source part names and relative positions are retained.</p>
  <div class="cg-toolbar cg-animation"><button type="button" data-action="play" aria-pressed="false">Play illustration</button><label>Illustration <input type="range" min="0" max="1000" value="0" aria-label="Animation progress"></label></div>
  <div class="cg-copy" aria-live="polite" aria-atomic="true"><h3></h3><p class="cg-text"></p><p class="cg-check"></p></div><p class="cg-motion" hidden>Reduced motion is enabled. Use the Illustration slider to inspect the movement.</p>
  <div class="cg-nav"><button type="button" data-action="previous">Previous step</button><button type="button" data-action="next">Next step</button></div>
  <p class="cg-legend">Source: <a href="https://github.com/Monolith3D/Monolith_Gantry/blob/0051697bd2b6c22d557c05ffe8e4b5e43c90490e/CAD/Monolith_Gantry_v604.step" target="_blank" rel="noopener noreferrer">Monolith Gantry by CloakedWayne and contributors</a>, R0/v604, assembly “printed VT 6mm 2WD”. Converted from STEP with the MGN12H X rail; the alternative MGN9H X-rail branch is omitted. No mesh decimation. <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>. This is the legacy gantry reference; follow your build’s actual measurement span. The guide sends no printer commands.</p>`;
  const canvas=root.querySelector('canvas'),details=root.closest('details'),media=matchMedia('(prefers-reduced-motion: reduce)');
  const slider=root.querySelector('input'),status=root.querySelector('.cg-status span'),loadbar=root.querySelector('progress');
  const state={step:0,loaded:false,loading:false,contextLost:false,visible:true,playing:false,progress:0,frame:0,last:0,isolate:false,xray:false,meshes:[],roles:{},spans:{},meshCount:0,triangles:0,renderCount:0};
  let renderer,scene,camera,controls,model,overlay,modelBounds,animationLine,selected,raycaster;
  const unit=new THREE.Vector3(),center=new THREE.Vector3();
  const store=new Map(),highlight=new Map();
  viewers.set(root,{inspect:()=>({loaded:state.loaded,loading:state.loading,meshCount:state.meshCount,triangles:state.triangles,roles:Object.fromEntries(Object.entries(state.roles).map(([r,m])=>[r,m.length])),webgl:!!renderer,renderCalls:renderer?.info.render.calls||0,step:state.step,playing:state.playing,visible:available(),renderCount:state.renderCount,cameraPosition:camera?.position.toArray()})});
  function busy(text,active=false){status.textContent=text;root.querySelector('.cg-status').setAttribute('aria-busy',String(active));}
  function available(){return !state.contextLost&&state.visible&&!document.hidden&&(!details||details.open);}
  function normalizedRole(role){
    if(/^tensioner/.test(role))return 'tensioner';
    if(/^drive/.test(role))return 'motor';
    return role;
  }
  function roleFor(mesh){
    let object=mesh;
    while(object){if(object.userData?.role)return normalizedRole(object.userData.role);object=object.parent;}
    let name='';object=mesh;while(object){name+=' '+object.name;object=object.parent;}
    if(/belt.?a\b|a.?belt\b/i.test(name))return 'belt_a';
    if(/belt.?b\b|b.?belt\b/i.test(name))return 'belt_b';
    if(/tension|front.?idler|a_idler|b_idler/i.test(name))return 'tensioner';
    if(/toolhead|stealthburner|afterburner|hotend|clockwork|x_carriage/i.test(name))return 'toolhead';
    if(/motor|drive/i.test(name))return 'motor';
    if(/bed|build.?plate|heater.?plate/i.test(name))return 'bed';
    if(/frame|extrusion|2020/i.test(name))return 'frame';
    return 'other';
  }
  function activeRole(){return ['all','x_axis','x_axis','belt_a','belt_b','tensioner'][state.step];}
  function boundsFor(role){
    const box=new THREE.Box3();for(const mesh of state.roles[role]||[])box.expandByObject(mesh);
    return box.isEmpty()?modelBounds.clone():box;
  }
  function render(){if(renderer&&scene&&camera&&available()){renderer.render(scene,camera);state.renderCount++;}}
  function theme(){if(!scene)return;scene.background=new THREE.Color(getComputedStyle(root).getPropertyValue('--bg').trim()||'#121212');render();}
  function resize(){
    if(!renderer)return;const w=canvas.clientWidth||640,h=canvas.clientHeight||480;
    const fit=aspect=>Math.sin(Math.atan(Math.tan(camera.fov*Math.PI/360)*Math.min(1,aspect)));
    if(state.loaded&&camera.aspect!==w/h){camera.position.sub(controls.target).multiplyScalar(fit(camera.aspect)/fit(w/h)).add(controls.target);controls.update();}
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();
    const strip=root.querySelector('.cg-steps'),button=root.querySelector(`[data-step="${state.step}"]`);strip.scrollLeft=button.offsetLeft-strip.offsetLeft-strip.clientWidth/2+button.offsetWidth/2;
  }
  function focus(whole=false){
    if(!state.loaded)return;const box=whole||state.step===0?modelBounds:boundsFor(activeRole());
    box.getCenter(center);box.getSize(unit);
    const fullSize=modelBounds.getSize(new THREE.Vector3()).length();
    const minimum=whole?fullSize*.4:fullSize*.11;
    const radius=Math.max(box.getBoundingSphere(new THREE.Sphere()).radius,minimum/2);
    const halfFov=Math.atan(Math.tan(camera.fov*Math.PI/360)*Math.min(1,camera.aspect));
    const distance=radius/Math.sin(halfFov)*1.08;
    const dir=new THREE.Vector3(-.85,.55,1.1).normalize();
    // Loader exports a conventional Y-up model. Front is +Z.
    camera.position.copy(center).addScaledVector(dir,distance);controls.target.copy(center);
    camera.near=Math.max(.001,fullSize/10000);camera.far=fullSize*30;camera.updateProjectionMatrix();controls.minDistance=fullSize*.045;controls.maxDistance=fullSize*5;controls.update();render();
  }
  function materialFor(mesh,kind){
    const original=mesh.userData.originalMaterial,key=`${original.uuid}:${kind}`;
    if(store.has(key))return store.get(key);
    const material=original.clone();
    if(kind==='xray'){material.transparent=true;material.opacity=.12;material.depthWrite=false;}
    else if(kind==='dim'){material.transparent=true;material.opacity=.33;material.depthWrite=false;}
    store.set(key,material);return material;
  }
  function appearance(){
    if(!state.loaded)return;const role=activeRole();
    for(const mesh of state.meshes){
      const active=role==='all'||mesh.userData.role===role;
      mesh.visible=!state.isolate||active;
      if(role!=='all'&&active){
        if(!highlight.has(role))highlight.set(role,new THREE.MeshStandardMaterial({color:ROLE_COLORS[role]||0x3a9bea,roughness:.45,metalness:.15,emissive:ROLE_COLORS[role]||0x3a9bea,emissiveIntensity:.08}));
        mesh.material=highlight.get(role);
      }else mesh.material=state.xray&&(role!=='all'||['frame','hardware'].includes(mesh.userData.role))?materialFor(mesh,'xray'):mesh.userData.originalMaterial;
    }
    if(overlay)overlay.visible=[3,4].includes(state.step);
    updateIllustration();render();
  }
  function makeOverlays(){
    overlay=new THREE.Group();overlay.name='Instructional overlays (not original CAD)';scene.add(overlay);
    const positions=new Float32Array(65*3),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    animationLine=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x55b6ff,depthTest:false,transparent:true,opacity:.95}));animationLine.renderOrder=10;overlay.add(animationLine);
  }
  function findStraightSpan(role){
    // Select an actual long, horizontal CAD triangle edge. This is an animation
    // anchor, never a prescribed measurement span or a source of physical length.
    const tolerance=modelBounds.getSize(new THREE.Vector3()).length()*.002;
    let best=null;const a=new THREE.Vector3(),b=new THREE.Vector3();
    for(const mesh of state.roles[role]||[]){const p=mesh.geometry.attributes.position,indices=mesh.geometry.index;
      const count=indices?indices.count:p.count;
      for(let i=0;i<count;i+=3)for(let j=0;j<3;j++){
        a.fromBufferAttribute(p,indices?indices.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(p,indices?indices.getX(i+(j+1)%3):i+(j+1)%3).applyMatrix4(mesh.matrixWorld);
        const dx=Math.abs(a.x-b.x),dz=Math.abs(a.z-b.z),length=a.distanceTo(b);
        if(Math.abs(a.y-b.y)>tolerance||Math.min(dx,dz)>tolerance||length<tolerance*15)continue;
        if(!best||length>best.length*1.05||(length>best.length*.95&&(a.z+b.z)>best.a.z+best.b.z))best={a:a.clone(),b:b.clone(),length};
      }
    }
    return best;
  }
  function updateIllustration(){
    if(!overlay)return;const label=root.querySelector('.cg-label');label.hidden=![3,4].includes(state.step);
    animationLine.visible=state.step===3||state.step===4;
    label.textContent='Slowed motion overlay · confirm the free span for your build';
    if(animationLine.visible){
      const span=state.spans[activeRole()];
      if(!span){animationLine.visible=false;label.textContent='Source CAD belt highlighted · use the documented free span';return;}
      const delta=span.b.clone().sub(span.a),axis=Math.abs(delta.x)>Math.abs(delta.z)?'x':'z',length=span.length;
      const positions=animationLine.geometry.attributes.position;
      for(let i=0;i<65;i++){const t=i/64,p=span.a.clone().lerp(span.b,t);p.y+=length*.006;const transverse=Math.sin(t*Math.PI)*Math.sin(state.progress*Math.PI*10)*Math.exp(-state.progress*3.8)*length*.05;p[axis==='x'?'z':'x']+=transverse;positions.setXYZ(i,p.x,p.y,p.z);}
      positions.needsUpdate=true;animationLine.geometry.computeBoundingSphere();animationLine.material.color.setHex(state.step===3?0x55b6ff:0xe6b344);
    }
  }
  function tick(time){state.frame=0;if(!state.playing||!available()||media.matches||!state.loaded)return;if(state.last&&time-state.last<32){state.frame=requestAnimationFrame(tick);return;}const dt=state.last?Math.min(time-state.last,100):0;state.last=time;state.progress=(state.progress+dt/4200)%1;slider.value=Math.round(state.progress*1000);updateIllustration();render();state.frame=requestAnimationFrame(tick);}
  function motion(){
    cancelAnimationFrame(state.frame);state.frame=0;state.last=0;
    const animate=state.loaded&&!state.contextLost&&[3,4].includes(state.step);const button=root.querySelector('[data-action=play]');button.disabled=!animate||media.matches;button.textContent=state.playing?'Pause illustration':'Play illustration';button.setAttribute('aria-pressed',String(state.playing));slider.disabled=!animate;root.querySelector('.cg-motion').hidden=!media.matches;
    for(const action of ['focus','whole','isolate','xray','in','out'])root.querySelector(`[data-action=${action}]`).disabled=!state.loaded||state.contextLost;
    if(animate&&state.playing&&available()&&!media.matches)state.frame=requestAnimationFrame(tick);
  }
  function select(i){state.step=clamp(i,0,5);state.playing=false;state.progress=0;slider.value=0;const step=steps[state.step];canvas.setAttribute('aria-label',`${step.title}. ${step.focus}. Actual CAD viewer; arrow keys rotate, plus and minus zoom, Home focuses this step.`);root.querySelector('h3').textContent=`${state.step+1} of 6 · ${step.title}`;root.querySelector('.cg-text').textContent=step.text;root.querySelector('.cg-check').textContent=step.check;
    for(const button of root.querySelectorAll('[data-step]'))Number(button.dataset.step)===state.step?button.setAttribute('aria-current','step'):button.removeAttribute('aria-current');root.querySelector('[data-action=previous]').disabled=state.step===0;root.querySelector('[data-action=next]').disabled=state.step===5;
    if(state.loaded){appearance();focus();}motion();resize();
  }
  function setupRenderer(){
    if(renderer)return true;
    try {
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x121212);
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(37,1,.01,1000);scene.add(new THREE.HemisphereLight(0xe9f3ff,0x4a4653,2.1));const light=new THREE.DirectionalLight(0xffffff,2.9);light.position.set(-4,8,6);scene.add(light);const fill=new THREE.DirectionalLight(0xd6e6ff,1.2);fill.position.set(4,2,-5);scene.add(fill);
      controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.enablePan=true;controls.addEventListener('change',render);raycaster=new THREE.Raycaster();
      theme();resize();return true;
    }catch(error){renderer=null;canvas.hidden=true;root.querySelector('.cg-stage').style.minHeight='100px';busy('WebGL 2 is unavailable. Use the written instructions below.');root.querySelector('.cg-fallback').hidden=false;root.querySelector('[data-action=retry]').hidden=true;return false;}
  }
  async function load(){
    if(state.loading||state.loaded||!available())return;canvas.hidden=false;root.querySelector('.cg-stage').style.minHeight='';if(!setupRenderer())return;resize();state.loading=true;root.querySelector('[data-action=retry]').hidden=true;busy('Loading Monolith Trident gantry…',true);loadbar.removeAttribute('value');
    try {
      const gltf=await new GLTFLoader().loadAsync(assetURL,event=>{if(event.total>0){loadbar.value=event.loaded/event.total;busy(`Loading CAD · ${Math.round(event.loaded/event.total*100)}%`,true);}});
      model=gltf.scene;scene.add(model);model.updateMatrixWorld(true);state.meshes=[];state.roles={};state.triangles=0;
      model.traverse(mesh=>{if(!mesh.isMesh)return;const role=roleFor(mesh);mesh.userData.role=role;mesh.userData.originalMaterial=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;if(/^belt_/.test(role)){mesh.userData.originalMaterial=mesh.userData.originalMaterial.clone();mesh.userData.originalMaterial.color.setHex(ROLE_COLORS[role]);}state.meshes.push(mesh);(state.roles[role]||=([])).push(mesh);state.triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;});
      if(!state.meshes.length)throw new Error('No CAD mesh geometry found');
      modelBounds=new THREE.Box3().setFromObject(model);if(modelBounds.isEmpty())throw new Error('Empty CAD assembly');
      state.spans={belt_a:findStraightSpan('belt_a'),belt_b:findStraightSpan('belt_b')};
      state.meshCount=state.meshes.length;state.loaded=true;state.loading=false;root.dataset.cadLoaded='true';root.querySelector('.cg-fallback').hidden=true;busy(`${state.meshCount.toLocaleString()} CAD parts · ${Math.round(state.triangles).toLocaleString()} triangles`);makeOverlays();appearance();focus();motion();resize();
    }catch(error){state.loading=false;canvas.hidden=true;root.querySelector('.cg-stage').style.minHeight='100px';busy('CAD loading failed. Check the connection, then retry.');root.querySelector('[data-action=retry]').hidden=false;const fallback=root.querySelector('.cg-fallback');fallback.textContent='The CAD assembly could not be loaded. The written instructions remain available. Check the connection, then use Retry CAD loading.';fallback.hidden=false;}
  }
  function zoom(factor){if(!controls)return;camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();render();}
  root.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-step')){select(Number(b.dataset.step));return;}switch(b.dataset.action){case 'previous':select(state.step-1);break;case 'next':select(state.step+1);break;case 'retry':load();break;case 'focus':focus();break;case 'whole':focus(true);break;case 'isolate':state.isolate=!state.isolate;b.setAttribute('aria-pressed',String(state.isolate));appearance();break;case 'xray':state.xray=!state.xray;b.setAttribute('aria-pressed',String(state.xray));appearance();break;case 'in':zoom(.85);break;case 'out':zoom(1.15);break;case 'play':state.playing=!state.playing;motion();break;}});
  slider.addEventListener('input',()=>{state.playing=false;state.progress=Number(slider.value)/1000;motion();updateIllustration();render();});
  canvas.addEventListener('keydown',event=>{if(!state.loaded)return;const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);switch(event.key){case 'ArrowLeft':s.theta-=.12;break;case 'ArrowRight':s.theta+=.12;break;case 'ArrowUp':s.phi=clamp(s.phi-.1,.08,Math.PI-.08);break;case 'ArrowDown':s.phi=clamp(s.phi+.1,.08,Math.PI-.08);break;case '+':case '=':event.preventDefault();zoom(.9);return;case '-':event.preventDefault();zoom(1.1);return;case 'Home':event.preventDefault();focus();return;default:return;}event.preventDefault();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();render();});
  let down=null;canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});canvas.addEventListener('pointerup',e=>{if(!state.loaded||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=raycaster.intersectObjects(state.meshes,false).find(h=>h.object.visible);if(hit){selected=hit.object;root.querySelector('.cg-selection').textContent=`CAD part: ${selected.userData.source_part||selected.name||'unnamed part'} · ${selected.userData.role.replaceAll('_',' ')}`;}});
  if(window.ResizeObserver)new ResizeObserver(resize).observe(canvas);else window.addEventListener('resize',resize);
  if(window.IntersectionObserver)new IntersectionObserver(entries=>{state.visible=entries[0].isIntersecting;motion();if(available()){load();render();}}).observe(canvas);
  new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  document.addEventListener('visibilitychange',()=>{motion();if(available()){load();render();}});
  if(details)details.addEventListener('toggle',()=>{motion();if(available()){load();resize();render();}});
  media.addEventListener?.('change',()=>{state.playing=false;motion();});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();state.contextLost=true;state.playing=false;motion();busy('The 3D graphics context was lost. Reload this page to restore the CAD viewer.');root.querySelector('.cg-fallback').hidden=false;});
  select(0);if(available())load();
}
window.ChordataGuide={mount,inspect:root=>viewers.get(root)?.inspect()};
function start(){mount(document.getElementById('guideApp'));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
