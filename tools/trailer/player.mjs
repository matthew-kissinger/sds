// SPDX-License-Identifier: AGPL-3.0-or-later
// Filmmaking controller. Reads state; emits normal analog input only.
export function createPlayer({ gain = .09, turnRate = 2.6 } = {}) {
  let collecting = false, angle = Math.PI / 2, effort = 0;
  return state => {
    const sheep = state.sheep.filter(s => s.state === 'active');
    if (!sheep.length) return { direction: { x: 0, z: 0 }, sprint: false, bark: false };
    const dog = state.dogs[0].position;
    const cx = sheep.reduce((a,s) => a+s.position.x,0)/sheep.length;
    const cz = sheep.reduce((a,s) => a+s.position.z,0)/sheep.length;
    const stray = sheep.reduce((a,b) => Math.hypot(a.position.x-cx,a.position.z-cz) > Math.hypot(b.position.x-cx,b.position.z-cz) ? a:b);
    const spread = Math.min(16, Math.max(6, 2 * sheep.length ** (2/3)));
    const distance = Math.hypot(stray.position.x-cx,stray.position.z-cz);
    collecting = distance > spread * (collecting ? .7 : 1);
    const anchor = collecting ? stray.position : { x:cx,z:cz };
    const aim = collecting ? { x:cx,z:cz } : { x:state.field.gate.position.x,z:state.field.gate.position.z+8 };
    let vx=anchor.x-aim.x,vz=anchor.z-aim.z;
    const length=Math.hypot(vx,vz)||1;vx/=length;vz/=length;
    const stand=collecting ? 3 : 2*Math.sqrt(sheep.length);
    const tx=anchor.x+vx*stand,tz=anchor.z+vz*stand;
    let ox=dog.x-anchor.x,oz=dog.z-anchor.z;
    const radius=Math.hypot(ox,oz)||1;ox/=radius;oz/=radius;
    let dx=tx-dog.x,dz=tz-dog.z;
    const travel=Math.hypot(dx,dz);
    if (ox*vx+oz*vz < .4) {
      const sign=ox*vz-oz*vx>=0?1:-1, radial=(14-radius)/14;
      dx=-oz*sign+ox*radial;dz=ox*sign+oz*radial;
    }
    const targetAngle=Math.atan2(dz,dx);
    const difference=Math.atan2(Math.sin(targetAngle-angle),Math.cos(targetAngle-angle));
    angle+=Math.max(-turnRate/60,Math.min(turnRate/60,difference));
    const wanted=Math.min(.85,travel*gain) * Math.max(.25, Math.cos(difference));
    effort+=(wanted-effort)*.08;
    return { direction:{x:Math.cos(angle)*effort,z:Math.sin(angle)*effort},sprint:false,bark:false };
  };
}
