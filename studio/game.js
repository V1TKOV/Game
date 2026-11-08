import {Studio,Gestures,coverMap,mapPoint,pinchRatio} from './engine.js';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d'),video=$('video'),stage=$('stage');
const ui=Object.fromEntries(['overlay','title','description','kicker','start','demo','privacy','mode','calibrate','stop','hint','status','count','hand-labels','right-status','left-status','demo-tools','draw-tool','move-tool','camera-tool','new-object','undo','clear','save','size'].map(id=>[id,$(id)]));
let width=1,height=1,state='ready',stream=null,detector=null,modelPromise=null,session=0,lastVideoTime=-1,lastDetect=0,lastSeen=0;
const studio=new Studio(1,1),gestures=new Gestures(studio);
let rightCategory=null,hands=[],right=null,left=null,hintExpiry=0,tool='draw',pointerId=null,oldStatus='',undoCount=-1,calibrationFrames=0,calibrationLabel=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function resize(){const r=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);width=r.width;height=r.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);studio.resize(width,height);gestures.reset();right=null;left=null;}
new ResizeObserver(resize).observe(stage);resize();
function setStatus(text){if(text!==oldStatus){ui.status.textContent=text;oldStatus=text;}}
function hint(text,seconds=3){ui.hint.textContent=text;ui.hint.hidden=false;hintExpiry=performance.now()+seconds*1000;}
function releaseHands(){gestures.reset();right=null;left=null;hands=[];}
function stopStream(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;releaseHands();}
function modal(title,text,button){ui.title.textContent=title;ui.description.textContent=text;ui.start.textContent=button;ui.start.disabled=false;ui.overlay.hidden=false;}
function enableTools(enabled){for(const id of ['new-object','undo','clear','save'])ui[id].disabled=!enabled;}
async function loadModel(){
 if(detector)return detector;if(modelPromise)return modelPromise;
 let timeout,expired=false;
 const loading=(async()=>{const{FilesetResolver,HandLandmarker}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');return HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.5});})();
 loading.then(value=>{if(expired)value.close();},()=>{});
 modelPromise=Promise.race([loading,new Promise((_,reject)=>{timeout=setTimeout(()=>{expired=true;reject(new Error('MODEL_TIMEOUT'));},35000);})]);
 try{detector=await modelPromise;return detector;}finally{clearTimeout(timeout);modelPromise=null;}
}
function errorText(error){
 if(error.name==='NotAllowedError')return 'Доступ к камере не разрешён. Разреши его в настройках сайта и повтори попытку. Пока можно рисовать в пробном режиме.';
 if(error.name==='NotFoundError')return 'Камера не найдена. Подключи её или попробуй управление мышью и пальцем.';
 if(error.name==='NotReadableError')return 'Камера занята или недоступна. Закрой другие приложения с камерой и попробуй снова.';
 if(error.message==='INSECURE')return 'Открой студию по HTTPS, например на GitHub Pages. На компьютере также подходит localhost. Камера не запускается из файла.';
 return 'Не удалось запустить распознавание рук. Проверь интернет и открой сайт в актуальном Safari или Chrome. Рисунки сохранены на холсте — можно продолжить без камеры.';
}
function fail(error){++session;stopStream();state='error';ui.overlay.classList.remove('calibration');ui.demo.hidden=false;ui.privacy.hidden=false;ui.calibrate.hidden=true;ui['hand-labels'].hidden=true;ui.stop.hidden=false;ui.mode.textContent='КАМЕРА НЕДОСТУПНА';ui.hint.hidden=true;setStatus('КАМЕРА ВЫКЛЮЧЕНА');modal('Контакт не установлен',errorText(error),'Попробовать снова ↗');enableTools(false);}
async function startCamera(){
 if(state==='loading')return;
 const current=++session;stopStream();state='loading';ui.overlay.classList.remove('calibration');ui.demo.hidden=true;ui.privacy.hidden=false;ui['demo-tools'].hidden=true;ui.stop.hidden=false;ui.stop.textContent='Отменить';ui.calibrate.hidden=true;ui['hand-labels'].hidden=true;enableTools(false);
 modal('Открываем пространство','Разреши доступ к фронтальной камере. Первая загрузка распознавания может занять до 35 секунд.','Подключаемся…');ui.start.disabled=true;ui.mode.textContent='ПОДКЛЮЧЕНИЕ';
 try{
  if(!isSecureContext||location.protocol==='file:')throw new Error('INSECURE');
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('UNSUPPORTED');
  const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}});
  if(current!==session){acquired.getTracks().forEach(t=>t.stop());return;}
  stream=acquired;video.srcObject=stream;await video.play();if(current!==session)return;
  ui.start.textContent='Загружаем распознавание…';await loadModel();if(current!==session)return;
  stream.getVideoTracks()[0].addEventListener('ended',()=>{if(['camera','calibration','paused'].includes(state))fail(new Error('CAMERA_ENDED'));},{once:true});
  lastVideoTime=-1;lastDetect=0;lastSeen=0;calibrate();
 }catch(error){if(current===session)fail(error);}
}
function calibrate(){
 if(!stream)return;state='calibration';releaseHands();calibrationFrames=0;calibrationLabel=null;ui.overlay.classList.add('calibration');ui.demo.hidden=true;ui.privacy.hidden=true;ui.calibrate.hidden=true;ui.stop.hidden=false;ui.stop.textContent='Выключить камеру';ui['hand-labels'].hidden=true;ui.hint.hidden=true;enableTools(false);
 ui.mode.textContent='НАСТРОЙКА РУК';modal('Покажи только правую ладонь','Держи правую ладонь раскрытой в кадре, а левую убери. Затем нажми кнопку — мы запомним, какая рука рисует.','Ждём правую ладонь…');ui.start.disabled=true;setStatus('ПОКАЖИ ОДНУ РАСКРЫТУЮ ЛАДОНЬ');
}
function confirmCalibration(){
 if(state!=='calibration'||calibrationFrames<4||hands.length!==1||performance.now()-lastSeen>250)return;
 rightCategory=hands[0].label;state='camera';releaseHands();ui.overlay.hidden=true;ui.overlay.classList.remove('calibration');ui['hand-labels'].hidden=false;ui.calibrate.hidden=false;ui.stop.textContent='Выключить камеру';ui.mode.textContent='КАМЕРА · РИСОВАНИЕ В ВОЗДУХЕ';enableTools(true);hint('Правая рисует щипком. Левая захватывает линию.',5);
}
function demo(){++session;stopStream();state='demo';ui.overlay.hidden=true;ui.overlay.classList.remove('calibration');ui['demo-tools'].hidden=false;ui['hand-labels'].hidden=true;ui.calibrate.hidden=true;ui.stop.hidden=true;ui.mode.textContent='ПРОБНЫЙ РЕЖИМ · БЕЗ КАМЕРЫ';enableTools(true);selectTool('draw');setStatus('РИСУЙ МЫШЬЮ ИЛИ ПАЛЬЦЕМ');hint('Рисуй на холсте. Для переноса выбери «Перемещать».',4);}
function stop(){++session;stopStream();state='ready';ui.overlay.classList.remove('calibration');ui.calibrate.hidden=true;ui.stop.hidden=true;ui.demo.hidden=false;ui.privacy.hidden=false;ui['hand-labels'].hidden=true;ui['demo-tools'].hidden=true;ui.mode.textContent='КАМЕРА ВЫКЛЮЧЕНА';ui.hint.hidden=true;setStatus('РИСУНКИ ОСТАЛИСЬ НА ХОЛСТЕ');enableTools(false);modal('Пространство ждёт тебя','Рисунки остаются здесь до перезагрузки страницы. Включи камеру или продолжай в пробном режиме.','Открыть камеру ↗');}
function pause(){if(!['camera','calibration'].includes(state))return;state='paused';releaseHands();ui.overlay.classList.remove('calibration');ui.demo.hidden=false;ui.privacy.hidden=true;ui.calibrate.hidden=true;enableTools(false);modal('Небольшая пауза','Рисование остановлено. Чтобы выключить камеру, нажми кнопку над холстом.','Продолжить ↗');}
function resume(){if(!stream){startCamera();return;}if(!rightCategory){calibrate();return;}state='camera';releaseHands();ui.overlay.hidden=true;ui.calibrate.hidden=false;ui['hand-labels'].hidden=false;enableTools(true);hint('Разомкни пальцы перед следующим жестом.',2);}
function detect(now){
 if(!detector||video.readyState<2)return;
 if(now-lastDetect>=50&&video.currentTime!==lastVideoTime){
  lastDetect=now;lastVideoTime=video.currentTime;const result=detector.detectForVideo(video,now);
  const candidates=result.landmarks.map((points,i)=>({points,label:result.handedness[i]?.[0]?.categoryName,score:result.handedness[i]?.[0]?.score||0})).filter(h=>h.label&&h.score>.65);
  // Ambiguous duplicate handedness cannot safely control two separate roles.
  hands=candidates.length===2&&candidates[0].label===candidates[1].label?[]:candidates;
  lastSeen=now;
  if(state==='calibration'){
   const valid=hands.length===1&&pinchRatio(hands[0].points,video.videoWidth,video.videoHeight)>.65;
   if(valid&&calibrationLabel===hands[0].label)calibrationFrames++;else{calibrationFrames=valid?1:0;calibrationLabel=valid?hands[0].label:null;}
   ui.start.disabled=calibrationFrames<4;ui.start.textContent=calibrationFrames>=4?'Это моя правая рука ✓':hands.length>1?'Убери левую руку из кадра':'Покажи раскрытую правую ладонь';
  }else{
   right=handFor(hands.find(h=>h.label===rightCategory),right,'right');left=handFor(hands.find(h=>h.label!==rightCategory),left,'left');
  }
 }
 if(now-lastSeen>250){hands=[];right=null;left=null;if(state==='calibration'){calibrationFrames=0;ui.start.disabled=true;}}
}
function handFor(hand,previous,side){
 if(!hand)return null;const points=hand.points;
 const raw=side==='right'?points[8]:{x:(points[4].x+points[8].x)/2,y:(points[4].y+points[8].y)/2};
 const p=mapPoint(raw,video.videoWidth,video.videoHeight,width,height),ratio=pinchRatio(points,video.videoWidth,video.videoHeight);
 return{x:previous?.visible?previous.x*.3+p.x*.7:p.x,y:previous?.visible?previous.y*.3+p.y*.7:p.y,visible:p.x>0&&p.x<width&&p.y>0&&p.y<height,closed:previous?.closed?ratio<.5:ratio<.32,points};
}
function renderObjects(context,glow=true){
 context.save();context.lineCap='round';context.lineJoin='round';
 for(const object of studio.objects){for(const stroke of object.strokes){
  context.strokeStyle=stroke.color;context.fillStyle=stroke.color;context.lineWidth=stroke.size;context.shadowColor=stroke.color;context.shadowBlur=glow?(object===studio.grab?24:13):0;
  if(stroke.points.length===1){const p=stroke.points[0];context.beginPath();context.arc(p.x,p.y,stroke.size/2,0,Math.PI*2);context.fill();continue;}
  context.beginPath();stroke.points.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.stroke();
  if(glow){context.shadowBlur=0;context.globalAlpha=.55;context.strokeStyle='#ffffff';context.lineWidth=Math.max(1,stroke.size*.24);context.stroke();context.globalAlpha=1;}
 }}context.restore();
}
function skeleton(points,color){ctx.strokeStyle=color+'50';ctx.lineWidth=1.2;for(const chain of [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]]){ctx.beginPath();chain.forEach((index,i)=>{const p=mapPoint(points[index],video.videoWidth,video.videoHeight,width,height);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();}}
function reticle(hand,color,label){if(!hand?.visible)return;ctx.save();ctx.translate(hand.x,hand.y);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash(hand.closed?[]:[3,4]);ctx.beginPath();ctx.arc(0,0,hand.closed?12:20,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();ctx.font='10px Arial';ctx.textAlign='center';ctx.fillText(label,0,-29);ctx.restore();}
function draw(now){
 ctx.clearRect(0,0,width,height);ctx.fillStyle='#091b22';ctx.fillRect(0,0,width,height);
 if(stream&&video.readyState>=2){const{scale,ox,oy}=coverMap(video.videoWidth,video.videoHeight,width,height);ctx.save();ctx.translate(width,0);ctx.scale(-1,1);ctx.drawImage(video,ox,oy,video.videoWidth*scale,video.videoHeight*scale);ctx.restore();ctx.fillStyle='#04121c35';ctx.fillRect(0,0,width,height);}
 else{
  const gradient=ctx.createRadialGradient(width*.45,height*.4,0,width*.45,height*.4,width*.75);gradient.addColorStop(0,'#163b42');gradient.addColorStop(1,'#07131d');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#b8f6d22b';for(let x=22;x<width;x+=32)for(let y=22;y<height;y+=32)ctx.fillRect(x,y,1,1);
  if(!studio.objects.length&&state==='ready'){const t=reduced?0:now/2500;ctx.save();ctx.strokeStyle='#b8f6d250';ctx.shadowColor='#b8f6d2';ctx.shadowBlur=20;ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<180;i++){const x=width*(.07+i/180*.86),y=height*.5+Math.sin(i/19+t)*height*.22; i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.restore();}
 }
 renderObjects(ctx);
 if(state==='calibration')for(const hand of hands)skeleton(hand.points,'#b8f6d2');
 if(state==='camera'){
  if(right)skeleton(right.points,'#b8f6d2');if(left)skeleton(left.points,'#dbb6ff');
  reticle(right,'#b8f6d2',studio.stroke?'РИСУЮ':'ПРАВАЯ');reticle(left,'#dbb6ff',studio.grab?'ДЕРЖУ':'ЛЕВАЯ');
  if(studio.grab&&left?.visible){ctx.strokeStyle='#dbb6ff90';ctx.setLineDash([4,5]);ctx.lineWidth=1;const p=studio.grab.strokes[0].points[0];ctx.beginPath();ctx.moveTo(left.x,left.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);}
 }
}
function frame(now){
 if(['camera','calibration'].includes(state)){
  try{detect(now);}catch(error){fail(error);}
  if(state==='camera'){
   gestures.step(right,left);
   ui['right-status'].textContent=`ПРАВАЯ · ${!right?.visible?'НЕ ВИДНА':studio.stroke?'РИСУЕТ':'ГОТОВА'}`;
   ui['left-status'].textContent=`ЛЕВАЯ · ${!left?.visible?'НЕ ВИДНА':studio.grab?'ДЕРЖИТ':'ГОТОВА'}`;
   setStatus(studio.grab?'ПЕРЕМЕЩАЙ · РАЗОМКНИ ПАЛЬЦЫ, ЧТОБЫ ОТПУСТИТЬ':studio.stroke?'РИСУЙ · РАЗОМКНИ ПАЛЬЦЫ ДЛЯ ПАУЗЫ':!right?.visible&&!left?.visible?'ПОКАЖИ РУКИ В КАДРЕ':'ПРАВАЯ РИСУЕТ · ЛЕВАЯ ПЕРЕМЕЩАЕТ');
  }
 }
 draw(now);ui.count.textContent=`РИСУНКОВ: ${studio.objects.length}`;
 if(undoCount!==studio.history.length){undoCount=studio.history.length;ui.undo.disabled=!undoCount||!['demo','camera'].includes(state);}
 if(studio.points>=studio.limit&&['camera','demo'].includes(state)){setStatus('ХОЛСТ ЗАПОЛНЕН · СОХРАНИ PNG И ОЧИСТИ');studio.endStroke();}
 if(now>hintExpiry)ui.hint.hidden=true;requestAnimationFrame(frame);
}
function selectTool(next){tool=next;studio.release();for(const [id,name] of [['draw-tool','draw'],['move-tool','move']]){ui[id].classList.toggle('active',tool===name);ui[id].setAttribute('aria-pressed',String(tool===name));}setStatus(tool==='draw'?'РИСУЙ МЫШЬЮ ИЛИ ПАЛЬЦЕМ':'ЗАЖМИ ЛИНИЮ И ПЕРЕТАЩИ РИСУНОК');}
function position(event){const rect=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(width,event.clientX-rect.left)),y:Math.max(0,Math.min(height,event.clientY-rect.top))};}
canvas.addEventListener('pointerdown',event=>{if(state!=='demo'||pointerId!==null)return;pointerId=event.pointerId;canvas.setPointerCapture(pointerId);const p=position(event);if(tool==='draw')studio.startStroke(p);else if(!studio.startGrab(p))hint('Захвати саму линию рисунка.',2);});
canvas.addEventListener('pointermove',event=>{if(state!=='demo'||event.pointerId!==pointerId)return;const p=position(event);tool==='draw'?studio.addPoint(p):studio.moveGrab(p);});
function pointerUp(event){if(event.pointerId===pointerId){studio.release();pointerId=null;}}
canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);canvas.addEventListener('lostpointercapture',pointerUp);
ui.start.addEventListener('click',()=>{if(state==='calibration')confirmCalibration();else if(state==='paused')resume();else startCamera();});ui.demo.addEventListener('click',demo);ui['camera-tool'].addEventListener('click',startCamera);ui.stop.addEventListener('click',stop);ui.calibrate.addEventListener('click',calibrate);
ui['draw-tool'].addEventListener('click',()=>selectTool('draw'));ui['move-tool'].addEventListener('click',()=>selectTool('move'));
ui['new-object'].addEventListener('click',()=>{gestures.reset();studio.newObject();hint('Следующий штрих — новый рисунок.');});
ui.undo.addEventListener('click',()=>{gestures.reset();studio.undo();});ui.clear.addEventListener('click',()=>{gestures.reset();studio.clear();hint('Холст очищен. «Отмена» вернёт рисунки.');});
ui.size.addEventListener('input',()=>{studio.size=Number(ui.size.value);});
document.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{studio.color=button.dataset.color;document.querySelectorAll('[data-color]').forEach(b=>{const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}));
ui.save.addEventListener('click',()=>{
 const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const context=output.getContext('2d');context.scale(output.width/width,output.height/height);renderObjects(context);
 output.toBlob(blob=>{if(!blob){hint('Не удалось сохранить. Попробуй ещё раз.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='efir-drawing.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);hint('PNG с прозрачным фоном, без изображения камеры.');},'image/png');
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state==='loading')stop();else pause();studio.release();pointerId=null;}});
window.addEventListener('pagehide',()=>{++session;stopStream();});
enableTools(false);requestAnimationFrame(frame);
