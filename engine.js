export let W = 1100, H = 550;
export function setWorld(width, height) { W=width; H=height; }
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function direction(x, y) { const n = Math.hypot(x, y); return n ? { x: x / n, y: y / n } : { x: 0, y: 0 }; }
export const upgrades = [
 {id:'damage',icon:'⌁',name:'Перегрузка',text:'Урон каждого снаряда +35%.',apply:p=>{p.damage*=1.35;}},
 {id:'rate',icon:'≋',name:'Скорострельность',text:'Оружие стреляет на 20% чаще.',apply:p=>{p.fireRate*=.8;}},
 {id:'speed',icon:'↗',name:'Ионный двигатель',text:'Скорость движения +18%.',apply:p=>{p.speed*=1.18;}},
 {id:'heal',icon:'♡',name:'Ремонтный модуль',text:'Восстанови весь корпус и добавь одну ячейку.',apply:p=>{p.maxHp++;p.hp=p.maxHp;}},
 {id:'multi',icon:'⋔',name:'Разветвитель',text:'Ещё один снаряд в каждом залпе.',apply:p=>{p.shots++;}},
 {id:'magnet',icon:'◎',name:'Магнитное поле',text:'Радиус сбора энергии +70%.',apply:p=>{p.magnet*=1.7;}}
];
export function createGame(random = Math.random) {
 return {state:'playing',time:0,wave:1,spawned:0,spawnClock:.6,score:0,kills:0,xp:0,level:1,nextXp:6,
 player:{x:W/2,y:H/2,r:11,hp:5,maxHp:5,speed:190,damage:18,fireRate:.36,shots:1,magnet:90,fire:0,dash:0,dashTime:0,inv:1,dx:1,dy:0},
 enemies:[],bullets:[],gems:[],particles:[],random,banner:2,bossSpawned:false};
}
export function dash(g, input) {
 const p=g.player;if(g.state!=='playing'||p.dash>0)return false;
 const d=direction(input.x,input.y);if(d.x||d.y){p.dx=d.x;p.dy=d.y;}
 p.dash=2;p.dashTime=.18;p.inv=Math.max(p.inv,.3);return true;
}
function burst(g,x,y,color,n=10){for(let i=0;i<n;i++){const a=g.random()*Math.PI*2,s=30+g.random()*150;g.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+g.random()*.4,color});}if(g.particles.length>400)g.particles.splice(0,g.particles.length-400);}
function spawn(g,boss=false){const a=g.random()*Math.PI*2;let x=W/2+Math.cos(a)*W*.65,y=H/2+Math.sin(a)*H*.85; x=clamp(x,-25,W+25);y=clamp(y,-25,H+25);
 const type=boss?'boss':g.wave>=3&&g.random()<.23?'shooter':g.random()<.22?'fast':'normal';
 const hp=boss?950:type==='fast'?17+g.wave*5:28+g.wave*9;
 g.enemies.push({x,y,r:boss?34:type==='fast'?9:type==='shooter'?14:13,hp,maxHp:hp,type,speed:boss?44:type==='fast'?105+g.wave*6:53+g.wave*7,fire:1.5,phase:g.random()*6.28});
}
export function update(g,dt,input){
 if(g.state!=='playing')return; dt=Math.min(dt,.04);g.time+=dt;g.banner=Math.max(0,g.banner-dt);
 const p=g.player;for(const k of ['dash','dashTime','inv','fire'])p[k]=Math.max(0,p[k]-dt);
 const d=direction(input.x,input.y);if(d.x||d.y){p.dx=d.x;p.dy=d.y;}
 const speed=p.dashTime>0?p.speed*4:p.speed;
 p.x=clamp(p.x+(p.dashTime>0?p.dx:d.x)*speed*dt,16,W-16);p.y=clamp(p.y+(p.dashTime>0?p.dy:d.y)*speed*dt,16,H-16);
 const count=8+g.wave*5;g.spawnClock-=dt;
 if(g.spawned<count&&g.spawnClock<=0){spawn(g);g.spawned++;g.spawnClock=Math.max(.28,1.05-g.wave*.12);}
 if(g.wave===5&&g.spawned===count&&!g.bossSpawned){spawn(g,true);g.bossSpawned=true;g.banner=3;}
 if(g.enemies.length&&p.fire<=0){const target=g.enemies.reduce((a,b)=>distance(p,a)<distance(p,b)?a:b);const a=Math.atan2(target.y-p.y,target.x-p.x);
 for(let i=0;i<p.shots;i++){const angle=a+(i-(p.shots-1)/2)*.14;g.bullets.push({x:p.x,y:p.y,vx:Math.cos(angle)*530,vy:Math.sin(angle)*530,r:3,life:1.7,damage:p.damage,enemy:false});}p.fire=p.fireRate;
 }
 for(const e of g.enemies){const v=direction(p.x-e.x,p.y-e.y),dist=distance(p,e);if(e.type!=='shooter'||dist>240){e.x+=v.x*e.speed*dt;e.y+=v.y*e.speed*dt;}e.phase+=dt*2;e.fire-=dt;
 if((e.type==='shooter'||e.type==='boss')&&e.fire<=0){const a=Math.atan2(p.y-e.y,p.x-e.x);const n=e.type==='boss'?10:1;for(let i=0;i<n;i++){const ang=n===1?a:a+i*Math.PI*2/n;g.bullets.push({x:e.x,y:e.y,vx:Math.cos(ang)*155,vy:Math.sin(ang)*155,r:5,life:6,enemy:true});}e.fire=e.type==='boss'?1.5:2.5;}
 if(dist<p.r+e.r&&p.inv<=0){p.hp--;p.inv=1.2;burst(g,p.x,p.y,'#ff6b8c',18);}
 }
 for(const b of g.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
 if(b.enemy){if(p.inv<=0&&distance(b,p)<p.r+b.r){b.life=0;p.hp--;p.inv=1.2;burst(g,p.x,p.y,'#ff6b8c',18);}}
 else{for(const e of g.enemies){if(e.hp>0&&b.life>0&&distance(b,e)<b.r+e.r){e.hp-=b.damage;b.life=0;burst(g,b.x,b.y,'#c7ff6b',3);if(e.hp<=0){g.kills++;g.score+=e.type==='boss'?3000:e.type==='shooter'?180:100;burst(g,e.x,e.y,e.type==='boss'?'#ffcc70':'#ff6b8c',e.type==='boss'?45:12);g.gems.push({x:e.x,y:e.y,r:5,value:e.type==='boss'?15:1});}}}}
 }
 g.enemies=g.enemies.filter(e=>e.hp>0);g.bullets=g.bullets.filter(b=>b.life>0&&b.x>-50&&b.x<W+50&&b.y>-50&&b.y<H+50);
 for(const gem of g.gems){const dist=distance(p,gem);if(dist<p.magnet){const v=direction(p.x-gem.x,p.y-gem.y);gem.x+=v.x*360*dt;gem.y+=v.y*360*dt;}if(dist<19){gem.taken=true;g.xp+=gem.value;g.score+=25;}}
 g.gems=g.gems.filter(gem=>!gem.taken);
 for(const v of g.particles){v.x+=v.vx*dt;v.y+=v.vy*dt;v.life-=dt;}g.particles=g.particles.filter(v=>v.life>0);
 if(p.hp<=0){g.state='lost';return;}
 if(g.spawned>=count&&!g.enemies.length){if(g.wave===5){g.state='won';g.score+=Math.max(0,5000-Math.floor(g.time)*10);return;}g.wave++;g.spawned=0;g.spawnClock=2;g.banner=2.5;}
 if(g.xp>=g.nextXp){g.xp-=g.nextXp;g.level++;g.nextXp=Math.round(g.nextXp*1.4);g.state='upgrade';}
}
export function chooseUpgrade(g,id){if(g.state!=='upgrade')return;const u=upgrades.find(u=>u.id===id);if(!u)return;u.apply(g.player);g.state='playing';}
