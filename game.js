import {Hunt, TYPES, coverMap, mapLandmark, pinchRatio} from './engine.js';

const $=id=>document.getElementById(id);
const canvas=$('canvas'), ctx=canvas.getContext('2d'), video=$('video'), stage=$('stage');
const ui=Object.fromEntries(['start','demo','pause','exit','overlay','hud','score','time','level','best','caught','tracking','toast','mode-label','modal-title','modal-text','modal-kicker','privacy','sound'].map(id=>[id,$(id)]));
let width=1,height=1,state='ready',mode='camera',hunt=null,stream=null,detector=null,modelPromise=null;
let session=0,lastFrame=performance.now(),lastDetection=0,lastVideoTime=-1,lastSeen=0,landmarks=null;
let cursor={x:0,y:0,visible:false,closed:false},particles=[],scorePopups=[],toastUntil=0,best=0;
let audio=null,sound=false,toastText='',trackingText='';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
try{best=Math.max(0,Number(localStorage.getItem('anomaly-best-v1'))||0);}catch{}
ui.best.textContent=String(best).padStart(4,'0');
function resize(){
  const rect=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  width=rect.width;height=rect.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);if(hunt)hunt.resize(width,height);
}
new ResizeObserver(resize).observe(stage);resize();
function tracking(text){if(text!==trackingText){ui.tracking.textContent=text;trackingText=text;}}
function toast(text,seconds=2){toastText=text;ui.toast.textContent=text;ui.toast.hidden=false;toastUntil=performance.now()+seconds*1000;}
function stopCamera(){if(stream){for(const track of stream.getTracks())track.stop();}stream=null;video.srcObject=null;landmarks=null;cursor.visible=false;cursor.closed=false;}
function showModal(kicker,title,text,button){
  ui['modal-kicker'].textContent=kicker;ui['modal-title'].textContent=title;ui['modal-text'].textContent=text;
  ui.start.textContent=button;ui.start.disabled=false;ui.overlay.hidden=false;
}
function updateStats(){
  ui.score.textContent=String(hunt.score).padStart(4,'0');ui.time.textContent=String(Math.ceil(hunt.remaining)).padStart(2,'0');
  ui.level.textContent=String(hunt.level).padStart(2,'0');ui.caught.textContent=`${hunt.caught} ПОЙМАНО`;
}
async function loadModel(){
  if(detector)return detector;
  if(modelPromise)return modelPromise;
  modelPromise=(async()=>{
    const {FilesetResolver,HandLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
    const fileset=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
    return HandLandmarker.createFromOptions(fileset,{
      baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'CPU'},
      runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.5
    });
  })();
  let timeout,expired=false;
  const original=modelPromise;
  original.then(value=>{if(expired)value.close();},()=>{});
  try{
    detector=await Promise.race([original,new Promise((_,reject)=>{timeout=setTimeout(()=>{expired=true;reject(new Error('MODEL_TIMEOUT'));},35000);})]);
    return detector;
  }finally{clearTimeout(timeout);modelPromise=null;}
}
function friendlyError(error){
  if(error.name==='NotAllowedError'||error.name==='PermissionDeniedError')return 'Доступ к камере не разрешён. Разреши его в настройках сайта браузера и попробуй снова. Или открой пробный режим.';
  if(error.name==='NotFoundError')return 'Камера не найдена. Подключи её или попробуй игру мышью и касаниями.';
  if(error.name==='NotReadableError'||error.name==='AbortError')return 'Не удалось запустить камеру. Возможно, она занята другим приложением. Закрой его и повтори попытку.';
  if(error.message==='INSECURE')return 'Для камеры открой игру по HTTPS, например на GitHub Pages, или через localhost. Запуск из файла не поддерживается.';
  return 'Не удалось загрузить распознавание руки или запустить камеру. Проверь интернет, открой сайт в актуальном Safari или Chrome и повтори попытку. Пробный режим доступен без камеры.';
}
async function begin(nextMode){
  if(state==='loading')return;
  const current=++session;stopCamera();mode=nextMode;state='loading';ui.exit.hidden=false;ui.pause.disabled=true;
  ui.demo.hidden=true;ui.privacy.hidden=false;ui.start.disabled=true;ui.start.textContent='Подключаемся…';
  ui['modal-title'].textContent='Ищем точку контакта';ui['modal-text'].textContent='Разреши доступ к камере. Первая загрузка распознавания может занять до 35 секунд.';
  ui.toast.hidden=true;
  try{
    if(mode==='camera'){
      if(!isSecureContext||location.protocol==='file:')throw new Error('INSECURE');
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('UNSUPPORTED');
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}});
      if(current!==session){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;video.srcObject=stream;await video.play();
      ui.start.textContent='Загружаем распознавание…';
      await loadModel();if(current!==session)return;
      stream.getVideoTracks()[0].addEventListener('ended',()=>{if(state==='running'||state==='paused')fail(new Error('CAMERA_ENDED'));},{once:true});
    }
    if(current!==session)return;
    hunt=new Hunt(width,height);particles=[];scorePopups=[];lastVideoTime=-1;lastDetection=0;lastSeen=0;
    cursor={x:width/2,y:height/2,visible:mode==='demo',closed:false};
    state='running';lastFrame=performance.now();ui.overlay.hidden=true;ui.hud.hidden=false;ui.pause.disabled=false;
    ui.pause.textContent='Пауза';ui['mode-label'].textContent=mode==='camera'?'КАМЕРА · ПРЯМОЙ КОНТАКТ':'ПРОБНЫЙ РЕЖИМ · БЕЗ КАМЕРЫ';
    updateStats();tracking(mode==='camera'?'ПОКАЖИ ОТКРЫТУЮ ЛАДОНЬ':'НАЖМИ И УДЕРЖИВАЙ СУЩЕСТВО');
    toast(mode==='camera'?'Покажи ладонь целиком. Время пойдёт, когда увидим руку.':'Нажми на существо и удерживай, пока кольцо не заполнится.',5);
    if(mode==='demo')canvas.focus({preventScroll:true});
  }catch(error){if(current!==session)return;fail(error);}
}
function fail(error){
  ++session;stopCamera();state='error';ui.pause.disabled=true;ui.exit.hidden=false;ui.demo.hidden=false;ui.hud.hidden=true;ui.toast.hidden=true;
  ui['mode-label'].textContent='КОНТАКТ ПРЕРВАН';tracking('МОЖНО ПОВТОРИТЬ ИЛИ ИГРАТЬ БЕЗ КАМЕРЫ');
  showModal('НЕ УДАЛОСЬ ПОДКЛЮЧИТЬСЯ','Давай попробуем ещё раз',friendlyError(error),'Повторить с камерой ↗');
}
function pause(){
  if(state!=='running')return;
  state='paused';hunt.release();cursor.closed=false;ui.pause.textContent='Продолжить';ui.demo.hidden=true;ui.privacy.hidden=true;ui.toast.hidden=true;
  showModal('ЭКСПЕДИЦИЯ НА ПАУЗЕ','Они подождут.', 'Время остановлено. Камера выключится, если нажать «Выйти».','Продолжить ↗');tracking('ПАУЗА');
}
function resume(){
  if(document.hidden)return;
  state='running';lastFrame=performance.now();lastSeen=0;cursor.closed=false;cursor.visible=mode==='demo';landmarks=null;hunt.needsRelease=true;
  ui.overlay.hidden=true;ui.pause.textContent='Пауза';toast('Разомкни пальцы и продолжай охоту.',2);
}
function finish(){
  state='over';stopCamera();ui.pause.disabled=true;ui.exit.hidden=false;ui.demo.hidden=false;ui.privacy.hidden=true;ui.toast.hidden=true;
  const record=hunt.score>best;
  if(record){best=hunt.score;ui.best.textContent=String(best).padStart(4,'0');try{localStorage.setItem('anomaly-best-v1',String(best));}catch{}}
  ui['mode-label'].textContent='ЭКСПЕДИЦИЯ ЗАВЕРШЕНА';tracking('КАМЕРА ВЫКЛЮЧЕНА');
  showModal(record?'НОВЫЙ ЛИЧНЫЙ РЕКОРД':'ДАННЫЕ СОБРАНЫ',`${hunt.score} очков. Хороший контакт.`,`Поймано: ${hunt.caught}. Уровень: ${hunt.level}. Следующая экспедиция может принести ещё больше открытий.`, 'Ещё одна экспедиция ↗');
  ui.start.focus({preventScroll:true});
}
function exit(){
  ++session;stopCamera();state='ready';hunt=null;ui.hud.hidden=true;ui.pause.disabled=true;ui.exit.hidden=true;ui.demo.hidden=false;ui.privacy.hidden=false;ui.toast.hidden=true;
  ui['mode-label'].textContent='СКАНЕР ОЖИДАЕТ';ui.caught.textContent='0 ПОЙМАНО';tracking('КАМЕРА ВЫКЛЮЧЕНА');
  showModal('КОНТАКТ ВОЗМОЖЕН','Прикоснись к неизвестному','Покажи ладонь камере. Наведи указатель на существо и соедини большой и указательный пальцы.','Включить камеру ↗');
}
function detect(now){
  if(!detector||video.readyState<2)return;
  if(now-lastDetection>=50&&video.currentTime!==lastVideoTime){
    lastDetection=now;lastVideoTime=video.currentTime;
    const result=detector.detectForVideo(video,now);
    landmarks=result.landmarks[0]||null;
    if(landmarks){
      const point=mapLandmark(landmarks[8],video.videoWidth,video.videoHeight,width,height);
      const ratio=pinchRatio(landmarks,video.videoWidth,video.videoHeight);
      const wasVisible=cursor.visible;
      cursor.x=wasVisible?cursor.x*.35+point.x*.65:point.x;cursor.y=wasVisible?cursor.y*.35+point.y*.65:point.y;
      cursor.closed=cursor.closed?ratio<.52:ratio<.34;
      cursor.visible=point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height;lastSeen=now;
    } else {cursor.visible=false;cursor.closed=false;}
  }
  if(now-lastSeen>300){cursor.visible=false;cursor.closed=false;landmarks=null;}
}
function beep(){
  if(!sound||!audio)return;
  const osc=audio.createOscillator(),gain=audio.createGain();osc.connect(gain);gain.connect(audio.destination);
  osc.frequency.setValueAtTime(520,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(1040,audio.currentTime+.12);
  gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.18);
  osc.start();osc.stop(audio.currentTime+.2);
}
function capture(target){
  beep();const spec=TYPES[target.type];
  for(let i=0;i<(reducedMotion?6:22);i++){const a=Math.random()*Math.PI*2,s=20+Math.random()*100;particles.push({x:target.x,y:target.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,color:spec.color});}
  scorePopups.push({x:target.x,y:target.y,text:`+${target.points}`,life:1.2,color:spec.color});
  if(target.newLevel)toast(`Уровень ${hunt.level} · ${hunt.level===2?'Обнаружены Беглецы':hunt.level===3?'Появились Призраки':'Существа стали быстрее'}`,3);
}
function creature(t,time,alpha=1){
  const spec=TYPES[t.type],r=t.r*(1+Math.sin(time*2+t.phase)*.07);
  ctx.save();ctx.translate(t.x,t.y);ctx.globalAlpha=alpha;
  const halo=ctx.createRadialGradient(0,0,2,0,0,r*2.7);halo.addColorStop(0,spec.color+'55');halo.addColorStop(1,spec.color+'00');
  ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,r*2.7,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=spec.color;ctx.shadowColor=spec.color;ctx.shadowBlur=17;ctx.beginPath();
  if(t.type===1){for(let i=0;i<12;i++){const angle=i*Math.PI/6-Math.PI/2,rad=i%2?r*.7:r*1.15;const x=Math.cos(angle)*rad,y=Math.sin(angle)*rad;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}
  else if(t.type===2){ctx.moveTo(0,-r);ctx.quadraticCurveTo(r*1.3,-r*.5,r*.8,r);ctx.lineTo(r*.3,r*.65);ctx.lineTo(0,r);ctx.lineTo(-r*.3,r*.65);ctx.lineTo(-r*.8,r);ctx.quadraticCurveTo(-r*1.3,-r*.5,0,-r);}
  else{ctx.ellipse(0,0,r*.9,r,0,0,Math.PI*2);}
  ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#143334';[-1,1].forEach(sign=>{ctx.beginPath();ctx.ellipse(sign*r*.29,-r*.06,2.5,4.5,0,0,Math.PI*2);ctx.fill();});
  ctx.strokeStyle='#143334';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,r*.2,4,0,Math.PI);ctx.stroke();
  if(hunt?.lock===t){ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r+12,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,hunt.progress/spec.hold));ctx.stroke();}
  ctx.restore();
}
function render(now,dt){
  const time=reducedMotion?0:now/1000;
  ctx.clearRect(0,0,width,height);ctx.fillStyle='#091a20';ctx.fillRect(0,0,width,height);
  if(stream&&video.readyState>=2){
    const {scale,ox,oy}=coverMap(video.videoWidth,video.videoHeight,width,height);
    ctx.save();ctx.translate(width,0);ctx.scale(-1,1);ctx.drawImage(video,ox,oy,video.videoWidth*scale,video.videoHeight*scale);ctx.restore();
    ctx.fillStyle='#03151b55';ctx.fillRect(0,0,width,height);
  }else{
    const g=ctx.createRadialGradient(width*.5,height*.4,0,width*.5,height*.4,width*.7);g.addColorStop(0,'#143b3c');g.addColorStop(1,'#08151c');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#a5d6cc0c';ctx.lineWidth=1;
    for(let x=0;x<width;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}for(let y=0;y<height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
    for(let i=0;i<35;i++){ctx.fillStyle=i%3?'#b5f6cf45':'#b5f6cf88';ctx.beginPath();ctx.arc((i*137.2)%width,((i*73.7)+time*(i%3+1)*2)%height,1,0,Math.PI*2);ctx.fill();}
  }
  if(hunt){for(const target of hunt.targets)creature(target,time);}
  else{for(let i=0;i<4;i++)creature({x:width*(i%2?.83:.16)+Math.sin(time+i)*10,y:height*(i<2?.28:.75),r:20,phase:i,type:i%3},time,.55);}
  if(landmarks&&state==='running'){
    ctx.strokeStyle='#b5f6cf45';ctx.lineWidth=1.5;
    const connections=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
    for(const chain of connections){ctx.beginPath();chain.forEach((index,i)=>{const p=mapLandmark(landmarks[index],video.videoWidth,video.videoHeight,width,height);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();}
  }
  if(cursor.visible&&state==='running'){
    ctx.save();ctx.translate(cursor.x,cursor.y);ctx.strokeStyle=cursor.closed?'#ffffff':'#b5f6cf';ctx.lineWidth=2;ctx.setLineDash(cursor.closed?[]:[4,5]);ctx.beginPath();ctx.arc(0,0,cursor.closed?13:21,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
  for(const p of scorePopups){p.life-=dt;p.y-=25*dt;ctx.globalAlpha=Math.min(1,Math.max(0,p.life));ctx.fillStyle=p.color;ctx.font='bold 20px monospace';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y);}ctx.globalAlpha=1;scorePopups=scorePopups.filter(p=>p.life>0);
}
function frame(now){
  const dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
  if(state==='running'){
    try{if(mode==='camera')detect(now);}catch(error){fail(error);}
    if(state==='running'){
      const caught=hunt.update(dt,cursor);if(caught)capture(caught);updateStats();
      if(mode==='camera'){
        tracking(!cursor.visible?'РУКА НЕ ВИДНА · ВРЕМЯ НА ПАУЗЕ':hunt.needsRelease?'РАЗОМКНИ ПАЛЬЦЫ ДЛЯ НОВОГО ЗАХВАТА':hunt.lock?'КОНТАКТ · УДЕРЖИВАЙ ЩИПОК':'РУКА НАЙДЕНА · ЛОВИ ЩИПКОМ');
        if(!cursor.visible&&now>toastUntil)toast('Покажи ладонь целиком в центре кадра.',2);
      }else tracking(hunt.needsRelease?'ОТПУСТИ ДЛЯ НОВОГО ЗАХВАТА':hunt.lock?'КОНТАКТ · УДЕРЖИВАЙ':'НАЖМИ И УДЕРЖИВАЙ СУЩЕСТВО');
      if(hunt.remaining<=0)finish();
    }
  }
  render(now,dt);if(now>toastUntil&&toastText){ui.toast.hidden=true;toastText='';}
  requestAnimationFrame(frame);
}
function pointer(event){const r=canvas.getBoundingClientRect();cursor.x=event.clientX-r.left;cursor.y=event.clientY-r.top;cursor.visible=true;}
let pointerId=null;
canvas.addEventListener('pointerdown',event=>{if(state!=='running'||mode!=='demo'||pointerId!==null)return;pointerId=event.pointerId;pointer(event);cursor.closed=true;canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(state==='running'&&mode==='demo'&&(pointerId===null||event.pointerId===pointerId))pointer(event);});
function releasePointer(event){if(event.pointerId===pointerId){cursor.closed=false;pointerId=null;}}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);
canvas.addEventListener('keydown',event=>{
  if(state!=='running'||mode!=='demo')return;
  const keys={ArrowLeft:[-15,0],ArrowRight:[15,0],ArrowUp:[0,-15],ArrowDown:[0,15]};
  if(keys[event.key]){event.preventDefault();cursor.x=Math.max(0,Math.min(width,cursor.x+keys[event.key][0]));cursor.y=Math.max(0,Math.min(height,cursor.y+keys[event.key][1]));cursor.visible=true;}
  if(event.code==='Space'){event.preventDefault();cursor.closed=true;}
});
canvas.addEventListener('keyup',event=>{if(event.code==='Space'&&mode==='demo'){event.preventDefault();cursor.closed=false;}});
ui.start.addEventListener('click',()=>{if(state==='paused')resume();else begin(state==='over'?mode:'camera');});
ui.demo.addEventListener('click',()=>begin('demo'));
ui.pause.addEventListener('click',()=>state==='paused'?resume():pause());ui.exit.addEventListener('click',exit);
ui.sound.addEventListener('click',()=>{
  sound=!sound;ui.sound.textContent=`Звук: ${sound?'вкл.':'выкл.'}`;ui.sound.setAttribute('aria-pressed',String(sound));
  if(sound){try{audio||=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{sound=false;ui.sound.textContent='Звук недоступен';ui.sound.setAttribute('aria-pressed','false');}}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state==='loading')exit();else if(state==='running')pause();}});
window.addEventListener('pagehide',exit);
requestAnimationFrame(frame);
