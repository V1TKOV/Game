import {W,H,setWorld,createGame,update,dash,upgrades,chooseUpgrade,clamp} from './engine.js';
const $=id=>document.getElementById(id),canvas=$('arena'),ctx=canvas.getContext('2d');
let game=createGame(),mode='menu',last=0,keys=new Set(),stick={x:0,y:0},best=0,sound=false,audio,previousKills=0,previousHp=5,joystickId=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
try{best=Number(localStorage.getItem('impulse-best'))||0;}catch{}
$('best').textContent=best;
function tone(freq=300,duration=.06){if(!sound)return;try{audio??=new AudioContext();audio.resume();const o=audio.createOscillator(),gain=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq/2,audio.currentTime+duration);gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(gain).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}}
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=`Звук: ${sound?'вкл.':'выкл.'}`;$('sound').setAttribute('aria-pressed',sound);tone(550);};
function input(){return{x:(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+stick.x,y:(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+stick.y};}
function clearInput(){keys.clear();stick={x:0,y:0};joystickId=null;$('stick').style.transform='';}
function overlay(html){$('menu').innerHTML=html;$('overlay').hidden=false;$('stage').classList.remove('playing');clearInput();$('menu').querySelector('button')?.focus({preventScroll:true});}
function hideOverlay(){ $('overlay').hidden=true;$('stage').classList.add('playing');canvas.focus({preventScroll:true});}
function start(){game=createGame();mode='playing';previousKills=0;previousHp=5;hideOverlay();$('pause').disabled=false;tone(650,.12);}
$('start').onclick=start;
function pause(){if(mode!=='playing')return;game.state='paused';mode='paused';overlay('<p class="eyebrow">СИГНАЛ ПРИОСТАНОВЛЕН</p><h2>Передышка.</h2><p>Арена подождёт. Продолжим, когда будешь готов.</p><button class="primary" id="resume">Продолжить ↗</button>');$('resume').onclick=()=>{game.state='playing';mode='playing';hideOverlay();};}
$('pause').onclick=pause;
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)&&mode==='playing')e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='Space'&&mode==='playing'){if(dash(game,input()))tone(170,.15);}if(e.code==='Escape'||e.code==='KeyP'){if(mode==='playing')pause();else if(mode==='paused')$('resume').click();}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{clearInput();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});
function moveStick(e){const r=$('joystick').getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/35,y=(e.clientY-r.top-r.height/2)/35,n=Math.max(1,Math.hypot(x,y));stick={x:x/n,y:y/n};$('stick').style.transform=`translate(${stick.x*30}px,${stick.y*30}px)`;}
$('joystick').addEventListener('pointerdown',e=>{if(joystickId!==null)return;joystickId=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);moveStick(e);});
$('joystick').addEventListener('pointermove',e=>{if(e.pointerId===joystickId)moveStick(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(event,e=>{if(e.pointerId===joystickId){joystickId=null;stick={x:0,y:0};$('stick').style.transform='';}});
$('dash-touch').addEventListener('pointerdown',e=>{e.preventDefault();if(dash(game,input()))tone(170,.15);});
function showUpgrades(){mode='upgrade';const options=[...upgrades];for(let i=options.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}
 overlay(`<p class="eyebrow">УРОВЕНЬ ${game.level} · ВЫБЕРИ УСИЛЕНИЕ</p><h2>Следующий импульс.</h2><p>Одно решение. Больше возможностей.</p><div class="upgrades">${options.slice(0,3).map(u=>`<button class="upgrade" data-upgrade="${u.id}"><span class="icon">${u.icon}</span><b>${u.name}</b><small>${u.text}</small></button>`).join('')}</div>`);
 for(const button of document.querySelectorAll('[data-upgrade]'))button.onclick=()=>{chooseUpgrade(game,button.dataset.upgrade);mode='playing';hideOverlay();tone(800,.12);};
}
function finish(){mode=game.state;const won=mode==='won';best=Math.max(best,game.score);try{localStorage.setItem('impulse-best',best);}catch{}$('pause').disabled=true;
 overlay(`<div class="sigil">${won?'✧':'ϟ'}</div><p class="eyebrow">${won?'ЯДРО РОЯ УНИЧТОЖЕНО':'СИГНАЛ ПОТЕРЯН'}</p><h2>${won?'Хаос под контролем.':'Ещё один импульс?'}</h2><p>Счёт: <b>${game.score.toLocaleString('ru-RU')}</b> · Волна ${game.wave}/5 · ${time(game.time)}<br>Уничтожено: ${game.kills} · Рекорд: ${best.toLocaleString('ru-RU')}</p><button class="primary" id="restart">Новый забег <span>↗</span></button>`);$('restart').onclick=start;tone(won?850:100,.35);
}
function time(n){return`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;}
function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
 const oldW=W,oldH=H,newW=r.width<600?660:1100;setWorld(newW,newW*r.height/r.width);
 for(const entity of [game.player,...game.enemies,...game.bullets,...game.gems,...game.particles]){entity.x*=W/oldW;entity.y*=H/oldH;}
}
new ResizeObserver(resize).observe(canvas);resize();
function poly(x,y,r,sides,angle,color,fill){ctx.beginPath();for(let i=0;i<sides;i++){const a=angle+i*Math.PI*2/sides;i?ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r):ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.stroke();}
function render(now){
 // Uniform scale preserves collision geometry at every screen aspect ratio.
 const scale=Math.min(canvas.width/W,canvas.height/H),ox=(canvas.width-W*scale)/2,oy=(canvas.height-H*scale)/2;
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#080e19';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,ox,oy);
 const grad=ctx.createRadialGradient(W*.5,H*.5,0,W*.5,H*.5,650);grad.addColorStop(0,'#132333');grad.addColorStop(1,'#080e19');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#6d97ab0b';ctx.lineWidth=1;for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
 ctx.strokeStyle='#38526155';ctx.strokeRect(1,1,W-2,H-2);
 for(let i=0;i<55;i++){const x=(i*179.3)%W,y=(i*97.7)%H;ctx.fillStyle=`rgba(137,189,213,${.12+(reduced?0:Math.sin(now*.0007+i)*.09)})`;ctx.fillRect(x,y,2,2);}
 if(mode==='menu'){const t=reduced?0:now*.0003;for(let i=0;i<7;i++){const a=i*6.28/7+t;poly(W/2+Math.cos(a)*380,H/2+Math.sin(a)*200,10+i%3*4,4,a,'#ff6b8c66','#ff6b8c0a');}poly(200,300,15,3,-Math.PI/2,'#c7ff6b88','#c7ff6b22');return;}
 for(const gem of game.gems){ctx.shadowBlur=reduced?0:12;ctx.shadowColor='#6ee7f5';poly(gem.x,gem.y,5,4,0,'#a2f7ff','#6ee7f599');}ctx.shadowBlur=0;
 for(const b of game.bullets){ctx.fillStyle=b.enemy?'#ff879f':'#d6ff8f';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=reduced?0:10;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;
 for(const e of game.enemies){const color=e.type==='shooter'?'#c297ff':e.type==='boss'?'#ffcc70':'#ff6b8c';poly(e.x,e.y,e.r,e.type==='fast'?3:e.type==='boss'?6:4,e.phase,color,color+'20');ctx.fillStyle=color;ctx.fillRect(e.x-2,e.y-2,4,4);if(e.hp<e.maxHp){ctx.fillStyle='#303747';ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2,3);ctx.fillStyle=color;ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2*e.hp/e.maxHp,3);}}
 for(const p of game.particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}ctx.globalAlpha=1;
 const p=game.player;if(p.inv<=0||Math.floor(now/80)%2===0){const a=Math.atan2(p.dy,p.dx);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(a);ctx.shadowBlur=reduced?0:20;ctx.shadowColor='#c7ff6b';ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(-10,-10);ctx.lineTo(-5,0);ctx.lineTo(-10,10);ctx.closePath();ctx.fillStyle='#c7ff6b';ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#6ee7f5';ctx.beginPath();ctx.moveTo(-9,-4);ctx.lineTo(-20-(reduced?0:Math.sin(now*.04)*5),0);ctx.lineTo(-9,4);ctx.fill();ctx.restore();}
 if(p.dashTime>0){ctx.strokeStyle='#b7fbffaa';ctx.beginPath();ctx.arc(p.x,p.y,24,0,Math.PI*2);ctx.stroke();}
 ctx.fillStyle='#1e3441';ctx.fillRect(0,H-3,W,3);ctx.fillStyle='#6ee7f5';ctx.fillRect(0,H-3,W*Math.min(1,game.xp/game.nextXp),3);
}
function frame(now){const dt=last?Math.min((now-last)/1000,.04):0;last=now;
 if(mode==='playing'){update(game,dt,input());if(game.kills>previousKills){tone(400,.05);previousKills=game.kills;}if(game.player.hp<previousHp){tone(100,.2);}previousHp=game.player.hp;
 if(game.state==='upgrade')showUpgrades();else if(game.state==='won'||game.state==='lost')finish();}
 $('health').innerHTML=Array.from({length:game.player.maxHp},(_,i)=>`<i class="${i>=game.player.hp?'empty':''}"></i>`).join('');$('health').setAttribute('aria-label',`Корпус: ${Math.max(0,game.player.hp)} из ${game.player.maxHp}`);
 $('wave').innerHTML=`${String(game.wave).padStart(2,'0')} <small>/ 05</small>`;$('score').textContent=String(game.score).padStart(6,'0');$('timer').textContent=time(game.time);$('dash-fill').style.width=`${(1-game.player.dash/2)*100}%`;
 $('status').textContent=mode==='menu'?'ОЖИДАНИЕ ПИЛОТА':mode==='playing'?`УРОВЕНЬ ${game.level} · ЭНЕРГИЯ ${game.xp}/${game.nextXp}`:mode==='upgrade'?'ВЫБОР УСИЛЕНИЯ':mode==='paused'?'ПАУЗА':mode==='won'?'МИССИЯ ВЫПОЛНЕНА':'ЗАБЕГ ЗАВЕРШЁН';
 $('banner').textContent=mode==='playing'&&game.banner>0?(game.wave===5&&game.bossSpawned?'⚠ ЯДРО РОЯ':`ВОЛНА ${String(game.wave).padStart(2,'0')}`):'';
 render(now);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
