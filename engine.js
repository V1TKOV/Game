export function coverMap(vw,vh,w,h){const scale=Math.max(w/vw,h/vh);return{scale,ox:(w-vw*scale)/2,oy:(h-vh*scale)/2};}
export function mapPoint(p,vw,vh,w,h){const{scale,ox,oy}=coverMap(vw,vh,w,h);return{x:w-(p.x*vw*scale+ox),y:p.y*vh*scale+oy};}
export function pinchRatio(points,vw,vh){const d=(a,b)=>Math.hypot((points[a].x-points[b].x)*vw,(points[a].y-points[b].y)*vh);return d(4,8)/Math.max(1,d(5,17));}
export function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export class Studio{
 constructor(w,h){this.width=w;this.height=h;this.objects=[];this.active=null;this.stroke=null;this.grab=null;this.previous=null;this.nextId=1;this.color='#b8f6d2';this.size=5;this.history=[];this.limit=18000;this.points=0;}
 snapshot(){this.history.push(JSON.stringify({objects:this.objects,activeId:this.active?.id,points:this.points}));if(this.history.length>25)this.history.shift();}
 newObject(){this.endStroke();this.active=null;}
 startStroke(p){if(this.grab||this.points>=this.limit)return false;this.snapshot();if(!this.active){this.active={id:this.nextId++,strokes:[]};this.objects.push(this.active);}this.stroke={color:this.color,size:this.size,points:[{...p}]};this.active.strokes.push(this.stroke);this.points++;return true;}
 addPoint(p){if(!this.stroke||this.points>=this.limit)return;const last=this.stroke.points.at(-1);if(Math.hypot(last.x-p.x,last.y-p.y)>2){this.stroke.points.push({...p});this.points++;}}
 endStroke(){this.stroke=null;}
 hit(p,radius=38){for(let i=this.objects.length-1;i>=0;i--){const o=this.objects[i];for(const s of o.strokes){if(s.points.length===1&&Math.hypot(s.points[0].x-p.x,s.points[0].y-p.y)<radius+s.size)return o;for(let j=1;j<s.points.length;j++)if(segmentDistance(p,s.points[j-1],s.points[j])<radius+s.size)return o;}}return null;}
 startGrab(p){this.endStroke();const object=this.hit(p);if(!object)return false;this.snapshot();this.grab=object;this.active=null;this.previous={...p};return true;}
 moveGrab(p){if(!this.grab)return;let dx=p.x-this.previous.x,dy=p.y-this.previous.y;
 const points=this.grab.strokes.flatMap(s=>s.points);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const q of points){minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);}
 dx=Math.max(-minX,Math.min(this.width-maxX,dx));dy=Math.max(-minY,Math.min(this.height-maxY,dy));
 for(const q of points){q.x+=dx;q.y+=dy;}this.previous={...p};}
 endGrab(){this.grab=null;this.previous=null;}
 release(){this.endStroke();this.endGrab();}
 undo(){this.release();const data=this.history.pop();if(!data)return;const restored=JSON.parse(data);this.objects=restored.objects;this.active=this.objects.find(o=>o.id===restored.activeId)||null;this.points=restored.points;}
 clear(){if(!this.objects.length)return;this.snapshot();this.release();this.objects=[];this.active=null;this.points=0;}
 resize(w,h){this.release();const sx=w/this.width,sy=h/this.height;for(const o of this.objects)for(const s of o.strokes)for(const p of s.points){p.x*=sx;p.y*=sy;}this.width=w;this.height=h;this.history=[];}
}
export class Gestures{
 constructor(studio){this.studio=studio;this.reset();}
 reset(){this.studio.release();this.armed={right:false,left:false};this.closed={right:false,left:false};}
 step(right,left){
  const s=this.studio;
  for(const [side,hand] of [['right',right],['left',left]]){
   if(!hand?.visible){this.armed[side]=false;this.closed[side]=false;side==='right'?s.endStroke():s.endGrab();}
   else if(!hand.closed){this.armed[side]=true;this.closed[side]=false;side==='right'?s.endStroke():s.endGrab();}
  }
  if(left?.visible&&left.closed){
   if(this.armed.left&&!this.closed.left){s.startGrab(left);this.closed.left=true;}
   if(s.grab){s.moveGrab(left);s.endStroke();this.armed.right=false;}
  }
  if(right?.visible&&right.closed&&!s.grab){
   if(this.armed.right&&!this.closed.right){s.startStroke(right);this.closed.right=true;}
   if(s.stroke)s.addPoint(right);
  }
 }
}
