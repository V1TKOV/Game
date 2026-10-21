export const TYPES = [
  { name: 'Искра', color: '#b5f6cf', points: 100, hold: .4, speed: 13 },
  { name: 'Беглец', color: '#ffad91', points: 180, hold: .7, speed: 28 },
  { name: 'Призрак', color: '#d2b8ff', points: 300, hold: 1.6, speed: 9 }
];
export function coverMap(vw, vh, width, height) {
  const scale = Math.max(width / vw, height / vh);
  return { scale, ox: (width - vw * scale) / 2, oy: (height - vh * scale) / 2 };
}
export function mapLandmark(point, vw, vh, width, height) {
  const {scale, ox, oy} = coverMap(vw, vh, width, height);
  return { x: width - (point.x * vw * scale + ox), y: point.y * vh * scale + oy };
}
export function pinchRatio(landmarks, vw, vh) {
  const distance = (a,b) => Math.hypot((landmarks[a].x-landmarks[b].x)*vw, (landmarks[a].y-landmarks[b].y)*vh);
  return distance(4,8) / Math.max(1, distance(5,17));
}
export class Hunt {
  constructor(width, height, random = Math.random) {
    this.width=width; this.height=height; this.random=random;
    this.targets=[]; this.score=0; this.caught=0; this.level=1; this.remaining=60;
    this.lock=null; this.progress=0; this.needsRelease=false; this.elapsed=0;
    this.fill();
  }
  fill() {
    const desired = Math.min(3 + Math.floor(this.level/2), 6);
    while(this.targets.length < desired) {
      const type = Math.floor(this.random()*Math.min(this.level,3));
      let x, y;
      for (let tries=0;tries<20;tries++) {
        x=45+this.random()*Math.max(1,this.width-90);
        y=115+this.random()*Math.max(1,this.height-185);
        if(!this.targets.some(t=>Math.hypot(t.x-x,t.y-y)<90)) break;
      }
      this.targets.push({type,x,y,phase:this.random()*Math.PI*2,r:25});
    }
  }
  release() { this.lock=null; this.progress=0; }
  update(dt, cursor) {
    if(this.remaining<=0) return null;
    // Losing the hand freezes the clock and cancels incomplete captures.
    if(!cursor.visible) { this.release(); this.needsRelease=true; return null; }
    dt=Math.min(Math.max(0,dt),.1);
    this.remaining=Math.max(0,this.remaining-dt); this.elapsed+=dt;
    if(!cursor.closed) {this.release();this.needsRelease=false;}
    if(this.remaining<=0) {this.release();return null;}
    if(cursor.closed&&!this.needsRelease&&!this.lock) {
      this.lock=this.targets.filter(t=>Math.hypot(t.x-cursor.x,t.y-cursor.y)<t.r+23)
        .sort((a,b)=>Math.hypot(a.x-cursor.x,a.y-cursor.y)-Math.hypot(b.x-cursor.x,b.y-cursor.y))[0]||null;
    }
    if(this.lock) {
      if(Math.hypot(this.lock.x-cursor.x,this.lock.y-cursor.y)>this.lock.r+48) {this.release();this.needsRelease=true;}
      else {
        this.progress+=dt;
        if(this.progress>=TYPES[this.lock.type].hold) {
          const captured=this.lock, oldLevel=this.level;
          this.score+=TYPES[captured.type].points;this.caught++;this.level=1+Math.floor(this.caught/5);
          this.targets=this.targets.filter(t=>t!==captured);this.release();this.needsRelease=true;this.fill();
          return {...captured,points:TYPES[captured.type].points,newLevel:this.level>oldLevel};
        }
      }
    }
    for(const t of this.targets) {
      if(t===this.lock) continue;
      const spec=TYPES[t.type], drift=spec.speed*(1+Math.min(this.level-1,8)*.12);
      t.x+=Math.cos(this.elapsed*.8+t.phase)*drift*dt;
      t.y+=Math.sin(this.elapsed*.65+t.phase*1.7)*drift*dt;
      const dx=t.x-cursor.x,dy=t.y-cursor.y,d=Math.hypot(dx,dy);
      if(t.type===1&&d<125&&d>0){t.x+=dx/d*65*dt;t.y+=dy/d*65*dt;}
      t.x=Math.max(35,Math.min(this.width-35,t.x));t.y=Math.max(110,Math.min(this.height-40,t.y));
    }
    return null;
  }
  resize(width,height) {
    for(const t of this.targets){t.x*=width/this.width;t.y*=height/this.height;}
    this.width=width;this.height=height;this.release();
  }
}
