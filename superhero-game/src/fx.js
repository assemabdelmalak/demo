import * as THREE from 'three';
import { rand, pick } from './util.js';

const dummy = new THREE.Object3D();
const col = new THREE.Color();
const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

// Particle pool backed by one InstancedMesh (one draw call per pool).
// mode 0: debris (shrinks at end), 1: fire (shrinks over life), 2: smoke (grows).
class Pool {
  constructor(scene, geo, material, max, floor = false) {
    this.max = max;
    this.floor = floor;
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, col.set(1, 1, 1));
    }
    this.items = Array.from({ length: max }, () => ({
      alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(),
      rv: new THREE.Vector3(), life: 0, max: 1, size: 1, grav: 0, drag: 0, mode: 0,
    }));
    this.next = 0;
    scene.add(this.mesh);
  }

  spawn(pos, vel, color, size, life, grav = 0, drag = 0, mode = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const p = this.items[i];
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = p.max = life;
    p.size = size;
    p.grav = grav;
    p.drag = drag;
    p.mode = mode;
    p.rot.set(Math.random() * 6, Math.random() * 6, 0);
    p.rv.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
    this.mesh.setColorAt(i, col.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (!p.alive) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (this.floor && p.pos.y < p.size * 0.5) {
        p.pos.y = p.size * 0.5;
        p.vel.y *= -0.35;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
        p.rv.multiplyScalar(0.6);
      }
      p.rot.addScaledVector(p.rv, dt);
      const k = p.life / p.max;
      let s = p.size;
      if (p.mode === 0) s *= Math.min(1, k * 4);
      else if (p.mode === 1) s *= k;
      else s *= 0.4 + (1 - k) * 1.6;
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function randDir(out) {
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
  return out.set(r * Math.cos(a), u, r * Math.sin(a));
}

export class FX {
  constructor(game) {
    this.game = game;
    const s = game.scene;
    this.debris = new Pool(s, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 500, true);
    this.glow = new Pool(
      s,
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      700,
    );
    this.smoke = new Pool(
      s,
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
      300,
    );

    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false;
      s.add(m);
      this.rings.push({ mesh: m, t: 0, life: 0, r: 1 });
    }

    this.bolts = [];
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(17 * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#eaf6ff', transparent: true, toneMapped: false }));
      line.frustumCulled = false;
      line.visible = false;
      s.add(line);
      this.bolts.push({ line, life: 0, a: new THREE.Vector3(), b: new THREE.Vector3() });
    }
    this.nextRing = 0;
    this.nextBolt = 0;

    this.light = new THREE.PointLight('#ffaa55', 0, 45, 1.6);
    s.add(this.light);
  }

  burst(pos, color, n = 10, speed = 6, size = 0.3) {
    for (let i = 0; i < n; i++) {
      randDir(V).multiplyScalar(speed * rand(0.4, 1));
      V.y = Math.abs(V.y) + speed * 0.4;
      this.debris.spawn(pos, V, color, size * rand(0.6, 1.4), rand(1.2, 2.2), 22, 0.3, 0);
    }
  }

  sparks(pos, color = '#fff1b0', n = 8, speed = 8) {
    for (let i = 0; i < n; i++) {
      randDir(V).multiplyScalar(speed * rand(0.4, 1));
      this.glow.spawn(pos, V, color, rand(0.12, 0.25), rand(0.15, 0.35), 6, 2, 1);
    }
  }

  dust(pos, n = 10, r = 1, color = '#b8ad9c', size = 1.4) {
    for (let i = 0; i < n; i++) {
      V2.set(pos.x + rand(-r, r), Math.max(0.3, pos.y + 0.3), pos.z + rand(-r, r));
      V.set(rand(-2, 2), rand(0.4, 2), rand(-2, 2));
      this.smoke.spawn(V2, V, color, size * rand(0.7, 1.3), rand(0.8, 1.6), -0.6, 1.4, 2);
    }
  }

  fireBurst(pos, r = 3) {
    const n = Math.round(18 + r * 6);
    for (let i = 0; i < n; i++) {
      randDir(V).multiplyScalar(r * rand(1.5, 3.5));
      this.glow.spawn(pos, V, pick(['#ffe066', '#ff9a2e', '#ff5a1f', '#ffcf5a']), rand(0.6, 1.3) * (r / 3) * 1.5, rand(0.35, 0.75), -2, 3, 1);
    }
    for (let i = 0; i < 8; i++) {
      randDir(V).multiplyScalar(r * 0.8);
      V.y = Math.abs(V.y) + 1;
      this.smoke.spawn(pos, V, '#3d3a38', rand(1.2, 2.2) * (r / 3), rand(1.2, 2.2), -1.2, 1.2, 2);
    }
  }

  water(pos) {
    for (let i = 0; i < 40; i++) {
      V.set(rand(-1.5, 1.5), rand(8, 14), rand(-1.5, 1.5));
      this.glow.spawn(pos, V, '#7cc6ff', rand(0.15, 0.3), rand(1, 1.8), 18, 0.2, 1);
    }
  }

  trail(pos, color, size = 0.5) {
    V.set(rand(-0.6, 0.6), rand(-0.3, 0.8), rand(-0.6, 0.6));
    this.glow.spawn(pos, V, color, size * rand(0.7, 1.2), rand(0.15, 0.35), 0, 1, 1);
  }

  shockwave(pos, r, color = '#ffffff', life = 0.45) {
    const ring = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % this.rings.length;
    ring.mesh.position.set(pos.x, pos.y + 0.15, pos.z);
    ring.mesh.material.color.set(color);
    ring.mesh.visible = true;
    ring.t = 0;
    ring.life = life;
    ring.r = r;
  }

  lightning(a, b, color = '#bfe3ff') {
    const bolt = this.bolts[this.nextBolt];
    this.nextBolt = (this.nextBolt + 1) % this.bolts.length;
    bolt.a.copy(a);
    bolt.b.copy(b);
    bolt.life = 0.22;
    bolt.line.visible = true;
    this.jag(bolt);
    // Thick glowing body made of particles along the path.
    const arr = bolt.line.geometry.attributes.position.array;
    for (let i = 0; i < 16; i++) {
      const ax = arr[i * 3], ay = arr[i * 3 + 1], az = arr[i * 3 + 2];
      const bx = arr[i * 3 + 3], by = arr[i * 3 + 4], bz = arr[i * 3 + 5];
      const segLen = Math.hypot(bx - ax, by - ay, bz - az);
      const steps = Math.max(1, Math.round(segLen / 0.6));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        V2.set(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
        V.set(0, 0, 0);
        this.glow.spawn(V2, V, color, rand(0.25, 0.45), rand(0.12, 0.22), 0, 0, 1);
      }
    }
    this.flash(b, '#9fd0ff', 900);
  }

  jag(bolt) {
    const arr = bolt.line.geometry.attributes.position.array;
    const { a, b } = bolt;
    const len = a.distanceTo(b);
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const j = i === 0 || i === 16 ? 0 : len * 0.06;
      arr[i * 3] = a.x + (b.x - a.x) * t + rand(-j, j);
      arr[i * 3 + 1] = a.y + (b.y - a.y) * t + rand(-j, j);
      arr[i * 3 + 2] = a.z + (b.z - a.z) * t + rand(-j, j);
    }
    bolt.line.geometry.attributes.position.needsUpdate = true;
  }

  flash(pos, color = '#ffaa55', power = 600) {
    this.light.position.copy(pos);
    this.light.color.set(color);
    this.light.intensity = Math.max(this.light.intensity, power);
  }

  levelUp(pos) {
    this.shockwave(pos, 8, '#ffd84a', 0.8);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      V2.set(pos.x + Math.cos(a) * 1.2, pos.y + rand(0, 2), pos.z + Math.sin(a) * 1.2);
      V.set(Math.cos(a) * 2, rand(4, 9), Math.sin(a) * 2);
      this.glow.spawn(V2, V, pick(['#ffd84a', '#fff5c0', '#ffb300']), rand(0.2, 0.4), rand(0.8, 1.4), 2, 0.5, 1);
    }
    this.flash(V.set(pos.x, pos.y + 2, pos.z), '#ffd84a', 1200);
  }

  update(dt) {
    this.debris.update(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) { r.mesh.visible = false; continue; }
      const s = 0.5 + (r.r - 0.5) * (1 - Math.pow(1 - k, 3));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = 0.85 * (1 - k);
    }
    for (const b of this.bolts) {
      if (!b.line.visible) continue;
      b.life -= dt;
      if (b.life <= 0) { b.line.visible = false; continue; }
      if (Math.random() < 0.5) this.jag(b);
      b.line.material.opacity = Math.min(1, b.life * 8);
    }
    this.light.intensity *= Math.exp(-10 * dt);
    if (this.light.intensity < 1) this.light.intensity = 0;
  }
}
