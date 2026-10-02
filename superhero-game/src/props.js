import * as THREE from 'three';
import { GRAVITY } from './config.js';
import { mergeColored, box, rand } from './util.js';

const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const charMat = new THREE.MeshLambertMaterial({ color: '#2b2622' });
const HALF_PI = Math.PI / 2;

// Anything in the world that can be knocked around, broken, lifted or thrown.
// `pos` is the base point (feet); the mesh is centred so it spins around its middle.
export class Prop {
  constructor(game, o) {
    this.game = game;
    this.type = o.type;
    this.mesh = o.mesh;
    this.pos = o.pos.clone();
    this.hh = o.hh;
    this.radius = o.radius;
    this.height = o.hh * 2;
    this.mass = o.mass;
    this.hp = o.hp;
    this.explosive = !!o.explosive;
    this.color = o.color;
    this.liftable = o.liftable !== false;
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.dynamic = false;
    this.alive = true;
    this.carried = false;
    this.thrown = false;
    this.broken = false;
    this.fadeT = -1;
    this.sleepT = 0;
    if (!this.mesh.parent) game.scene.add(this.mesh);
    this.syncMesh();
  }

  center(out) { return out.set(this.pos.x, this.pos.y + this.hh, this.pos.z); }

  syncMesh() {
    // Approximate the half-height of the (possibly tipped-over) object so it rests on the ground.
    const q = this.mesh.quaternion;
    const yy = Math.abs(1 - 2 * (q.x * q.x + q.z * q.z));
    const he = this.hh * yy + Math.min(this.hh, this.radius * 0.8) * (1 - yy);
    this.mesh.position.set(this.pos.x, this.pos.y + he, this.pos.z);
  }

  knock(impulse) {
    if (this.carried) return;
    this.dynamic = true;
    this.sleepT = 0;
    this.vel.addScaledVector(impulse, 1 / this.mass);
    const spin = impulse.length() / this.mass;
    this.angVel.set(rand(-1, 1) * spin * 0.4, rand(-1, 1) * spin * 0.2, rand(-1, 1) * spin * 0.4);
  }

  damage(dmg, impulse) {
    if (this.carried || !this.alive) return;
    this.hp -= dmg;
    if (impulse) this.knock(impulse);
    if (this.hp <= 0 && !this.broken) this.breakApart();
  }

  breakApart() {
    this.broken = true;
    const g = this.game;
    const c = this.center(new THREE.Vector3());
    if (this.type === 'car') {
      // Cars explode and leave a charred wreck that can still be thrown.
      this.mesh.material = charMat;
      this.explosive = false;
      this.hp = 1e9;
      this.dynamic = true;
      this.vel.y += 9;
      this.angVel.set(rand(-2, 2), rand(-1, 1), rand(-2, 2));
      this.fadeT = 25;
      g.explode(c, 5.5, 50, { fromPlayer: true, exclude: this });
      g.prog.addXP(3, null, null);
    } else {
      g.fx.burst(c, this.color, 12, 6, 0.3);
      if (this.type === 'hydrant') g.fx.water(c);
      this.remove();
      if (this.explosive) g.explode(c, 5, 45, { fromPlayer: true });
      g.prog.addXP(1, null, null);
    }
  }

  impact() {
    if (!this.thrown) return;
    this.thrown = false;
    const g = this.game;
    const c = this.center(new THREE.Vector3());
    g.fx.dust(c, 8, 1);
    g.fx.shockwave(this.pos, 4 + this.mass * 0.3, '#ffe2b0');
    g.shake(0.3);
    g.damageArea(c, 3.2 + this.mass * 0.25, 25 + this.mass * 10, 12, { fromPlayer: true, exclude: this, buildingMul: 1.5 });
    this.damage(this.type === 'car' ? 999 : this.hp + 1, null);
  }

  remove() {
    this.alive = false;
    this.game.scene.remove(this.mesh);
    if (this.game.player.carrying === this) this.game.player.carrying = null;
  }

  update(dt) {
    if (this.carried) return;
    if (this.fadeT >= 0) {
      this.fadeT -= dt;
      if (this.fadeT < 3) this.pos.y -= dt * 0.6;
      if (this.fadeT < 0) { this.remove(); return; }
      if (this.fadeT < 3) this.syncMesh();
    }
    if (!this.dynamic) return;
    const g = this.game, w = g.world, v = this.vel;
    v.y -= GRAVITY * dt;
    const prevY = this.pos.y;
    this.pos.addScaledVector(v, dt);
    let onGround = false;
    const gnd = w.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    if (this.pos.y <= gnd) {
      const impactV = -v.y;
      this.pos.y = gnd;
      v.y = v.y < -6 ? v.y * -0.3 : 0;
      onGround = true;
      if (this.thrown && impactV > 8) this.impact();
    }
    const hit = w.resolveCircle(this.pos, this.radius, this.pos.y, this.height);
    if (hit) {
      const vn = v.x * hit.nx + v.z * hit.nz;
      if (vn < 0) {
        if (this.thrown && -vn > 10) {
          w.damageBuilding(hit.b, this.mass * -vn * 0.8, this.center(new THREE.Vector3()));
          this.impact();
        }
        v.x -= 1.5 * vn * hit.nx;
        v.z -= 1.5 * vn * hit.nz;
      }
    }
    w.clampBounds(this.pos);
    const r = this.mesh.rotation;
    r.x += this.angVel.x * dt;
    r.y += this.angVel.y * dt;
    r.z += this.angVel.z * dt;
    if (onGround) {
      const f = Math.exp(-4 * dt);
      v.x *= f;
      v.z *= f;
      this.angVel.multiplyScalar(Math.exp(-6 * dt));
      // Settle into a stable orientation (upright or lying on a side).
      const k = 1 - Math.exp(-6 * dt);
      r.x += (Math.round(r.x / HALF_PI) * HALF_PI - r.x) * k;
      r.z += (Math.round(r.z / HALF_PI) * HALF_PI - r.z) * k;
      if (v.lengthSq() < 0.5 && this.angVel.lengthSq() < 0.3) {
        this.sleepT += dt;
        if (this.sleepT > 0.6) { this.dynamic = false; this.thrown = false; }
      } else this.sleepT = 0;
    }
    this.syncMesh();
  }
}

const SPECS = {
  lamp: {
    parts: () => [
      { geo: box(0.16, 5, 0.16, 0, 0, 0), color: '#3d434b' },
      { geo: box(0.1, 0.1, 1.1, 0, 2.35, 0.5), color: '#3d434b' },
      { geo: box(0.45, 0.16, 0.6, 0, 2.27, 1.0), color: '#fff2b0' },
    ],
    hh: 2.5, radius: 0.25, mass: 1.5, hp: 12, color: '#3d434b',
  },
  hydrant: {
    parts: () => [
      { geo: box(0.34, 0.6, 0.34, 0, -0.05, 0), color: '#c0392b' },
      { geo: box(0.4, 0.1, 0.4, 0, 0.28, 0), color: '#a93226' },
      { geo: box(0.52, 0.12, 0.14, 0, 0.05, 0), color: '#c0392b' },
    ],
    hh: 0.35, radius: 0.25, mass: 1, hp: 8, color: '#c0392b',
  },
  bin: {
    parts: () => [
      { geo: box(0.6, 0.85, 0.6, 0, -0.03, 0), color: '#2e7d32' },
      { geo: box(0.66, 0.08, 0.66, 0, 0.42, 0), color: '#1b5e20' },
    ],
    hh: 0.46, radius: 0.38, mass: 0.8, hp: 8, color: '#2e7d32',
  },
  bench: {
    parts: () => [
      { geo: box(1.8, 0.1, 0.55, 0, 0, 0), color: '#8d6e63' },
      { geo: box(1.8, 0.45, 0.08, 0, 0.28, -0.25), color: '#8d6e63' },
      { geo: box(0.08, 0.45, 0.5, -0.8, -0.27, 0), color: '#37474f' },
      { geo: box(0.08, 0.45, 0.5, 0.8, -0.27, 0), color: '#37474f' },
    ],
    hh: 0.5, radius: 0.8, mass: 1.5, hp: 12, color: '#8d6e63',
  },
  crate: {
    parts: () => [
      { geo: box(1.2, 1.2, 1.2, 0, 0, 0), color: '#a47a45' },
      { geo: box(1.24, 0.12, 1.24, 0, 0.42, 0), color: '#7a5a30' },
      { geo: box(1.24, 0.12, 1.24, 0, -0.42, 0), color: '#7a5a30' },
    ],
    hh: 0.6, radius: 0.7, mass: 1.3, hp: 14, color: '#a47a45',
  },
  barrel: {
    parts: () => [
      { geo: new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), color: '#c62828' },
      { geo: new THREE.CylinderGeometry(0.44, 0.44, 0.1, 12).translate(0, 0.3, 0), color: '#f9a825' },
      { geo: new THREE.CylinderGeometry(0.44, 0.44, 0.1, 12).translate(0, -0.3, 0), color: '#f9a825' },
    ],
    hh: 0.55, radius: 0.45, mass: 1, hp: 6, color: '#c62828', explosive: true,
  },
};

export function makeProp(game, type, x, z, rotY = 0) {
  const spec = SPECS[type];
  const mesh = new THREE.Mesh(mergeColored(spec.parts()), propMat);
  mesh.castShadow = true;
  mesh.rotation.y = rotY;
  return new Prop(game, { type, mesh, pos: new THREE.Vector3(x, 0, z), ...spec });
}
