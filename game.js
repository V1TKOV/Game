'use strict';
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const ui = Object.fromEntries(['score','best','pause','overlay','title','message','start','status','speed'].map(id => [id, document.getElementById(id)]));
const size = 20, cell = canvas.width / size;
const directions = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
let snake, food, direction, queued, score, state = 'ready', timer, best = 0;
try { best = Math.max(0, Number(localStorage.getItem('neon-snake-best')) || 0); } catch {}
ui.best.textContent = String(best).padStart(3,'0');
function placeFood() {
  const free = [];
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(!snake.some(p=>p.x===x&&p.y===y)) free.push({x,y});
  return free[Math.floor(Math.random()*free.length)];
}
function reset() { snake=[{x:9,y:10},{x:8,y:10},{x:7,y:10},{x:6,y:10}];direction=directions.right;queued=null;score=0;food=placeFood(); }
function draw() {
  ctx.clearRect(0,0,600,600);ctx.strokeStyle='#1c281f';ctx.lineWidth=1;
  for(let i=1;i<size;i++){ctx.beginPath();ctx.moveTo(i*cell,0);ctx.lineTo(i*cell,600);ctx.moveTo(0,i*cell);ctx.lineTo(600,i*cell);ctx.stroke();}
  if(food){ctx.fillStyle='#ff82b1';ctx.shadowColor='#ff82b1';ctx.shadowBlur=18;ctx.beginPath();ctx.arc((food.x+.5)*cell,(food.y+.5)*cell,8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  snake.forEach((p,i)=>{ctx.fillStyle=i===0?'#d3ff91':'#9bc94f';ctx.beginPath();ctx.roundRect(p.x*cell+2,p.y*cell+2,cell-4,cell-4,6);ctx.fill();});
  const head=snake[0],side={x:-direction.y,y:direction.x};ctx.fillStyle='#172210';
  [-1,1].forEach(sign=>{ctx.beginPath();ctx.arc((head.x+.5)*cell+direction.x*6+side.x*sign*5,(head.y+.5)*cell+direction.y*6+side.y*sign*5,2.3,0,Math.PI*2);ctx.fill();});
}
function stats(){ui.score.textContent=String(score).padStart(3,'0');ui.speed.textContent=(150/delay()).toFixed(1)+'×';}
function delay(){return Math.max(65,150-Math.floor(score/30)*10);}
function schedule(){clearTimeout(timer);timer=setTimeout(tick,delay());}
function start(){reset();state='running';ui.overlay.hidden=true;ui.pause.disabled=false;ui.pause.textContent='Ⅱ';ui.pause.setAttribute('aria-label','Пауза');ui.status.textContent='В ИГРЕ';stats();draw();schedule();}
function finish(won=false){clearTimeout(timer);state='over';ui.pause.disabled=true;ui.title.textContent=won?'Всё поле твоё!':'Ещё одну попытку?';ui.message.textContent=`Твой счёт: ${score}. Рекорд: ${best}.`;ui.start.innerHTML='Играть снова <span>↗</span>';ui.overlay.hidden=false;ui.status.textContent=won?'ПОБЕДА':'ИГРА ОКОНЧЕНА';}
function tick(){
  if(state!=='running')return;
  if(queued){direction=queued;queued=null;}
  const head={x:snake[0].x+direction.x,y:snake[0].y+direction.y};
  const eating=head.x===food.x&&head.y===food.y;
  const body=eating?snake:snake.slice(0,-1);
  if(head.x<0||head.x>=size||head.y<0||head.y>=size||body.some(p=>p.x===head.x&&p.y===head.y)){finish();return;}
  snake.unshift(head);
  if(eating){score+=10;if(score>best){best=score;ui.best.textContent=String(best).padStart(3,'0');try{localStorage.setItem('neon-snake-best',String(best));}catch{}}food=placeFood();}else snake.pop();
  stats();draw();if(!food){finish(true);return;}schedule();
}
function turn(name){if(state!=='running'||queued)return;const next=directions[name];if(next.x===-direction.x&&next.y===-direction.y)return;queued=next;}
function pause(){
  if(state==='running'){state='paused';clearTimeout(timer);ui.title.textContent='Выдохни. Это пауза.';ui.message.textContent='Продолжим с того же места, когда будешь готов.';ui.start.innerHTML='Продолжить <span>↗</span>';ui.overlay.hidden=false;ui.pause.textContent='▶';ui.pause.setAttribute('aria-label','Продолжить');ui.status.textContent='ПАУЗА';}
  else if(state==='paused'){state='running';ui.overlay.hidden=true;ui.pause.textContent='Ⅱ';ui.pause.setAttribute('aria-label','Пауза');ui.status.textContent='В ИГРЕ';schedule();}
}
ui.start.addEventListener('click',()=>state==='paused'?pause():start());ui.pause.addEventListener('click',pause);
document.querySelectorAll('[data-dir]').forEach(button=>button.addEventListener('click',()=>turn(button.dataset.dir)));
document.addEventListener('keydown',event=>{
  const keys={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
  if(keys[event.code]){event.preventDefault();turn(keys[event.code]);}
  if(event.code==='Space'&&event.target.tagName!=='BUTTON'){event.preventDefault();if(!event.repeat){if(state==='ready'||state==='over')start();else pause();}}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='running')pause();});
let touch=null;
canvas.addEventListener('pointerdown',e=>{touch={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',e=>{if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;if(Math.max(Math.abs(dx),Math.abs(dy))<12)return;turn(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));});
canvas.addEventListener('pointercancel',()=>{touch=null;});
reset();draw();
