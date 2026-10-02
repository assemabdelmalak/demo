import * as THREE from 'three';
import { CITY, roadCenter } from './config.js';
import { mergeColored, box, rand, randInt, pick, angleDamp, damp } from './util.js';
import { Prop } from './props.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CAR_COLORS = ['#d63031', '#0984e3', '#f5f6fa', '#2d3436', '#fdcb6e', '#00b894', '#6c5ce7', '#e17055', '#b2bec3', '#fdcb6e'];
const carMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const LANE = 3, HALF_ROAD = CITY.ROAD / 2, CAR_HH = 0.75;

export function makeCarMesh(color) {
  const parts = [
    { geo: box(1.9, 0.62, 4.3, 0, -0.15, 0), color },
    { geo: box(1.7, 0.55, 2.2, 0, 0.42, -0.25), color: '#1d2b3a' },
    { geo: box(1.72, 0.08, 2.0, 0, 0.72, -0.25), color },
    { geo: box(0.4, 0.15, 0.05, 0.6, -0.1, 2.16), color: '#fff8c0' },
    { geo: box(0.4, 0.15, 0.05, -0.6, -0.1, 2.16), color: '#fff8c0' },
    { geo: box(0.4, 0.15, 0.05, 0.6, -0.1, -2.16), color: '#c0392b' },
    { geo: box(0.4, 0.15, 0.05, -0.6, -0.1, -2.16), color: '#c0392b' },
  ];
  for (const sx of [-0.85, 0.85]) for (const sz of [-1.35, 1.35]) parts.push({ geo: box(0.3, 0.6, 0.6, sx, -0.45, sz), color: '#151515' });
  if (color === '#fdcb6e') parts.push({ geo: box(0.6, 0.2, 0.3, 0, 0.86, -0.25), color: '#222222' });
  const m = new THREE.Mesh(mergeColored(parts), carMat);
  m.castShadow = true;
  return m;
}

// Cars drive on the right along the road grid, picking a random turn at each intersection.
export class Traffic {
  constructor(game, count) {
    this.game = game;
    this.cars = [];
    this.targetCount = count;
    this.respawnT = 0;
    for (let i = 0; i < count; i++) this.spawn(true);
  }

  entryPt(i, j, d, out) {
    return out.set(roadCenter(i) - d[0] * HALF_ROAD - d[1] * LANE, 0, roadCenter(j) - d[1] * HALF_ROAD + d[0] * LANE);
  }

  exitPt(i, j, d, out) {
    return out.set(roadCenter(i) + d[0] * HALF_ROAD - d[1] * LANE, 0, roadCenter(j) + d[1] * HALF_ROAD + d[0] * LANE);
  }

  valid(i, j) { return i >= 0 && i <= CITY.N && j >= 0 && j <= CITY.N; }

  spawn(anywhere) {
    const p = this.game.player;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let tries = 0; tries < 30; tries++) {
      const i = randInt(0, CITY.N), j = randInt(0, CITY.N), d = pick(DIRS);
      const ni = i + d[0], nj = j + d[1];
      if (!this.valid(ni, nj)) continue;
      this.exitPt(i, j, d, a);
      this.entryPt(ni, nj, d, b);
      const pos = a.clone().lerp(b, Math.random());
      if (!anywhere && p && pos.distanceTo(p.pos) < 70) continue;
      if (this.cars.some((c) => c.pos.distanceTo(pos) < 9)) continue;
      const color = pick(CAR_COLORS);
      const mesh = makeCarMesh(color);
      const yaw = Math.atan2(d[0], d[1]);
      const car = {
        isCar: true, mesh, color, pos, dir: d, i: ni, j: nj, phase: 'road', target: b.clone(),
        speed: rand(9, 13), cur: 0, yaw, stuck: 0, ignoreT: 0,
      };
      car.cur = car.speed;
      mesh.position.set(pos.x, CAR_HH, pos.z);
      mesh.rotation.y = yaw;
      this.game.scene.add(mesh);
      this.cars.push(car);
      return car;
    }
    return null;
  }

  advance(c) {
    if (c.phase === 'road') {
      const d = c.dir;
      const opts = [];
      for (const ch of [d, d, [-d[1], d[0]], [d[1], -d[0]]]) {
        if (this.valid(c.i + ch[0], c.j + ch[1])) opts.push(ch);
      }
      c.dir = pick(opts);
      c.phase = 'turn';
      this.exitPt(c.i, c.j, c.dir, c.target);
    } else {
      c.i += c.dir[0];
      c.j += c.dir[1];
      c.phase = 'road';
      this.entryPt(c.i, c.j, c.dir, c.target);
    }
  }

  // Turn a driving car into a physics prop (punched, exploded or lifted).
  wreck(c, impulse) {
    const idx = this.cars.indexOf(c);
    if (idx < 0) return null;
    this.cars.splice(idx, 1);
    const prop = new Prop(this.game, {
      type: 'car', mesh: c.mesh, pos: new THREE.Vector3(c.pos.x, 0, c.pos.z), hh: CAR_HH,
      radius: 1.7, mass: 6, hp: 60, explosive: true, color: c.color,
    });
    prop.vel.set(Math.sin(c.yaw) * c.cur, 0, Math.cos(c.yaw) * c.cur);
    prop.dynamic = true;
    if (impulse) prop.knock(impulse);
    this.game.world.props.push(prop);
    this.game.peds.alarm(c.pos, 20);
    return prop;
  }

  update(dt) {
    const p = this.game.player;
    const camPos = this.game.camera.position;
    for (const c of this.cars) {
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      let want = c.phase === 'turn' ? c.speed * 0.55 : c.speed;
      let blockedByCar = false;
      if (c.ignoreT > 0) c.ignoreT -= dt;
      else {
        for (const o of this.cars) {
          if (o === c) continue;
          const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z;
          const ahead = dx * fx + dz * fz;
          if (ahead > 0 && ahead < 8 && Math.abs(dx * fz - dz * fx) < 2.2) {
            want = Math.min(want, (ahead - 4.6) * 2);
            blockedByCar = true;
          }
        }
      }
      if (p.pos.y < 2.5 && !p.dead) {
        const dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z;
        const ahead = dx * fx + dz * fz;
        if (ahead > 0 && ahead < 8 && Math.abs(dx * fz - dz * fx) < 2) want = Math.min(want, (ahead - 3.2) * 2);
      }
      want = Math.max(0, want);
      if (blockedByCar && want < 0.5) {
        c.stuck += dt;
        if (c.stuck > 2.5) { c.ignoreT = 1.5; c.stuck = 0; }
      } else c.stuck = 0;
      c.cur = damp(c.cur, want, want < c.cur ? 6 : 1.5, dt);

      const tx = c.target.x - c.pos.x, tz = c.target.z - c.pos.z;
      const dist = Math.hypot(tx, tz);
      const step = c.cur * dt;
      if (dist <= Math.max(step, 0.25)) {
        c.pos.x = c.target.x;
        c.pos.z = c.target.z;
        this.advance(c);
      } else {
        c.pos.x += (tx / dist) * step;
        c.pos.z += (tz / dist) * step;
        if (dist > 0.6) c.yaw = angleDamp(c.yaw, Math.atan2(tx, tz), 7, dt);
      }
      c.mesh.position.set(c.pos.x, CAR_HH, c.pos.z);
      c.mesh.rotation.y = c.yaw;
      c.mesh.visible = Math.abs(c.pos.x - camPos.x) < 220 && Math.abs(c.pos.z - camPos.z) < 220;
    }
    if (this.cars.length < this.targetCount) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.spawn(false);
        this.respawnT = 3;
      }
    }
  }
}
