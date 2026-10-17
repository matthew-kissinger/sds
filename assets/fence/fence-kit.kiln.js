// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Review kit only. Normalised stock plus the three assemblies in root extras.
// The destination replaces these preview colours with its procedural timber TSL.
const meta = { name: 'Sheepdog mortised oak pasture kit', role: 'prop' };
const RAIL_LEVELS = [0.30, 0.83, 1.36];
const POST_HEIGHT = 1.76;
const POST_GIRTH = 0.38;
const SINK = 0.16;

// An eight-sided section is a square with its arrises knocked off, not a pole.
const SECTION = [[-0.36,-0.5],[0.36,-0.5],[0.5,-0.36],[0.5,0.36],
  [0.36,0.5],[-0.36,0.5],[-0.5,0.36],[-0.5,-0.36]];

function stockGeometry(kind) {
  const positions = [], normals = [];
  const rings = kind === 'post'
    ? [[-0.5,1.04,0,0],[-0.35,1,0,0],[0.37,0.92,0.018,-0.012],[0.5,0.08,0.018,-0.012]]
    : [[-0.5,0.96,0,0],[0,1,-0.055,0.025],[0.5,0.94,0,0]];
  const at = (r,i) => {
    const [a,s,dx,dz] = rings[r], [u,v] = SECTION[i % 8];
    return kind === 'post' ? [u*s+dx,a,v*s+dz] : [a,u*s+dx,v*s+dz];
  };
  const triangle = (a,b,c,n) => {
    positions.push(...a,...b,...c); normals.push(...n,...n,...n);
  };
  for (let r=0;r<rings.length-1;r++) for (let i=0;i<8;i++) {
    const a=at(r,i), b=at(r,i+1), c=at(r+1,i+1), d=at(r+1,i);
    const u=SECTION[i], v=SECTION[(i+1)%8];
    const nx=v[1]-u[1], nz=u[0]-v[0], len=Math.hypot(nx,nz);
    // Long-axis normal components stay zero under the runtime's nonuniform scale.
    const n=kind==='post' ? [nx/len,0,nz/len] : [0,nx/len,nz/len];
    if (kind==='post') { triangle(a,c,b,n); triangle(a,d,c,n); }
    else { triangle(a,b,c,n); triangle(a,c,d,n); }
  }
  for (const r of [0,rings.length-1]) {
    const top=r!==0, n=kind==='post' ? [0,top?1:-1,0] : [top?1:-1,0,0];
    for (let i=1;i<7;i++) {
      const reverse = kind==='post' ? top : !top;
      triangle(at(r,0),at(r,reverse?i+1:i),at(r,reverse?i:i+1),n);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  return g;
}

function assembly(id) { return { id, posts:[], rails:[], leaves:[] }; }
function post(a,x,z,girth=POST_GIRTH,height=POST_HEIGHT,tone=0) {
  a.posts.push({x,z,baseY:-SINK,height:height+SINK,girth,tilt:0,tiltDir:0,
    yaw:0,tone,seed:0.5+0.18*Math.sin(x*2.3+z*1.9)});
}
function bar(a,ax,ay,az,bx,by,bz,thickness,depth,tone=0,topness=0.5) {
  a.rails.push({ax,ay,az,bx,by,bz,thickness,depth,tone,topness,
    seed:0.5+0.2*Math.sin(ax*1.3+ay*7.1+az)});
}
function bay(a,ax,az,bx,bz) {
  // Rails enter the post's centreline as mortised joints. Heavy top rail,
  // middle stock rail and low kick rail have distinct visual weights.
  RAIL_LEVELS.forEach((y,i)=>bar(a,ax,y,az,bx,y-0.012,bz,
    [0.14,0.21,0.27][i],[0.13,0.15,0.18][i],0,i/2));
}

function modules() {
  const straight=assembly('straight');
  for (const x of [-2.5,2.5]) post(straight,x,0);
  bay(straight,-2.5,0,2.5,0);
  const corner=assembly('corner');
  post(corner,0,0,0.48,1.91); post(corner,-5,0); post(corner,0,5);
  bay(corner,-5,0,0,0); bay(corner,0,0,0,5);
  // Paired compression braces land on the common corner, one on each run.
  // Short knee braces join the post to the rail, no free sticks in the grass.
  bar(corner,-1.12,1.32,0, -0.12,0.71,0,0.14,0.14);
  bar(corner,0,1.32,1.12, 0,0.71,0.12,0.14,0.14);
  const gate=assembly('gate');
  for (const sign of [-1,1]) {
    const x=sign*4.34;
    // Single heavy pointed strainer, entirely outside the eight-metre mouth.
    post(gate,x,0,0.58,2.43,1);
    bar(gate,x+sign*1.8,0.02,0.16,x,1.98,0.16,0.19,0.16);
    // Folded fully back toward the adjoining run; rotate around this hinge.
    const hx=sign*4.06, hz=-0.25, end=hx+sign*3.98;
    const leaf=assembly('leaf');
    for (const [i,y] of [0.22,0.64,1.06].entries())
      bar(leaf,hx,y,hz,end,y-0.025,hz,i===0?0.18:0.13,0.11,1,i/3);
    // A swept top descends from the tall hinge stile to the meeting stile.
    const sweep=[[0,1.94],[0.8,1.77],[2.0,1.58],[3.98,1.48]];
    for (let i=0;i<sweep.length-1;i++) {
      const [s0,y0]=sweep[i], [s1,y1]=sweep[i+1];
      bar(leaf,hx+sign*s0,y0,hz,hx+sign*s1,y1,hz,0.2,0.13,1,1);
    }
    bar(leaf,hx+sign*0.07,0.1,hz,hx+sign*0.07,1.94,hz,0.20,0.13,1);
    bar(leaf,end-sign*0.07,0.1,hz,end-sign*0.07,1.48,hz,0.16,0.12,1);
    // Brace rises from hinge foot toward the latch; correct compression direction.
    bar(leaf,hx+sign*0.12,0.28,hz,end-sign*0.12,1.39,hz,0.14,0.10,1);
    for (const y of [0.43,1.51])
      bar(leaf,hx-sign*0.12,y,hz-0.085,hx+sign*0.75,y,hz-0.085,0.085,0.04,2);
    gate.leaves.push({hingeX:hx,hingeZ:hz,closeTurn:-sign*Math.PI,parts:leaf.rails});
  }
  return [straight,corner,gate];
}

function build() {
  const root=createRoot('SheepdogFenceKit');
  const kit=modules();
  root.userData.fenceKit={version:1,units:'metres',stockFrame:{post:'Y, centered unit',rail:'X, centered unit'}};
  const stock={post:stockGeometry('post'),rail:stockGeometry('rail')};
  const wood=gameMaterial(0x9b8060), pale=gameMaterial(0xbba17b), iron=gameMaterial(0x454344);
  for (let i=0;i<kit.length;i++) {
    const a=kit[i], group=new THREE.Group(); group.name=a.id;
    group.position.set((i-1)*16,0,0); root.add(group);
    group.userData.fenceModule=a.id;
    group.userData.fenceLeaves=a.leaves.map(l=>({hingeX:l.hingeX,hingeZ:l.hingeZ,closeTurn:l.closeTurn}));
    a.posts.forEach((p,j)=>{
      const m=createPart(a.id+'Post'+j,stock.post,wood,{parent:group,
        position:[p.x,p.baseY+p.height/2,p.z],scale:[p.girth,p.height,p.girth]});
      m.userData.fenceStock='post'; m.userData.fencePart=p;
    });
    const rails=a.rails.concat(...a.leaves.map(l=>l.parts));
    rails.forEach((p,j)=>{
      const start=new THREE.Vector3(p.ax,p.ay,p.az), end=new THREE.Vector3(p.bx,p.by,p.bz);
      const delta=end.clone().sub(start), span=delta.length();
      const m=createPart(a.id+'Rail'+j,stock.rail,p.tone===2?iron:p.tone===1||p.tone===3?pale:wood,
        {parent:group,position:start.clone().add(end).multiplyScalar(0.5).toArray(),
          scale:[span,p.thickness,p.depth]});
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),delta.normalize());
      m.userData.fenceStock='rail'; m.userData.fencePart=p;
      m.userData.fenceLeaf=a.leaves.findIndex(l=>l.parts.includes(p));
    });
  }
  return root;
}
