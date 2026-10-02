import * as THREE from 'three';
import { CITY, blockMin, ZONES, GRAVITY } from './config.js';
import { makeHumanoid, animateHumanoid } from './humanoid.js';
import { rand, pick, angleDamp, clamp } from './util.js';

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a86b3c'];
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#ecf0f1', '#34495e', '#e67e22', '#1abc9c', '#fd79a8'];
const PANTS = ['#2c3e50', '#34495e', '#7f8c8d', '#1e272e', '#6d4c41', '#2d3436'];
const HAIR = ['#2b1b0e', '#4a2c12', '#090806', '#b89778', '#d6c4a8', '#71635a', null];

const LINES = [
  'Whoa! A real superhero?!',
  'Thugs have taken over {zone}. Someone should do something!',
  'I heard heroes who train hard enough learn to fly.',
  'Be careful, the {zone} gang is no joke.',
  'My cat is stuck on a roof. Can you climb up there?',
  'Is it a bird? Is it a plane? ...No, just you.',
  'Try not to wreck too many cars, OK?',
  'Thanks for keeping the city safe!',
  'Can I get an autograph? No? OK...',
  'They say the boss at Iron Fortress is huge.',
  'You can climb any building, just run at the wall!',
];

const T = new THREE.Vector3();

class Ped {
  constructor(game, bi, bj) {
    this.game = game;
    const inset = 1.8;
    this.x0 = blockMin(bi) + inset;
    this.x1 = blockMin(bi) + CITY.BLOCK - inset;
    this.z0 = blockMin(bj) + inset;
    this.z1 = blockMin(bj) + CITY.BLOCK - inset;
    const w = this.x1 - this.x0, d = this.z1 - this.z0;
    this.P = 2 * (w + d);
    this.t = Math.random() * this.P;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.speed = rand(1.1, 1.8);
    this.h = makeHumanoid({ skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR) });
    this.h.root.scale.setScalar(rand(0.9, 1.05));
    game.scene.add(this.h.root);
    this.pos = new THREE.Vector3();
    this.pointAt(this.t, this.pos);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.state = 'walk';
    this.timer = 0;
    this.talked = false;
    this.phase = Math.random() * 6;
    this.radius = 0.35;
    this.onGround = true;
    this.retT = 0;
  }

  pointAt(t, out) {
    const w = this.x1 - this.x0, d = this.z1 - this.z0;
    t = ((t % this.P) + this.P) % this.P;
    if (t < w) return out.set(this.x0 + t, 0, this.z0);
    if (t < w + d) return out.set(this.x1, 0, this.z0 + (t - w));
    if (t < 2 * w + d) return out.set(this.x1 - (t - w - d), 0, this.z1);
    return out.set(this.x0, 0, this.z1 - (t - 2 * w - d));
  }

  closestT(x, z) {
    const { x0, x1, z0, z1 } = this;
    const w = x1 - x0, d = z1 - z0;
    const cx = clamp(x, x0, x1), cz = clamp(z, z0, z1);
    const cands = [
      [cx, z0, cx - x0],
      [x1, cz, w + cz - z0],
      [cx, z1, w + d + (x1 - cx)],
      [x0, cz, 2 * w + d + (z1 - cz)],
    ];
    let best = 0, bd = Infinity;
    for (const [px, pz, t] of cands) {
      const dd = (px - x) ** 2 + (pz - z) ** 2;
      if (dd < bd) { bd = dd; best = t; }
    }
    return best;
  }

  knock(imp) {
    this.state = 'knocked';
    this.vel.copy(imp);
    this.onGround = false;
    this.timer = 2;
  }

  panic(from) {
    if (this.state !== 'walk' && this.state !== 'panic') return;
    this.state = 'panic';
    this.timer = rand(4, 6);
    const a = this.pointAt(this.t + 1, T).distanceToSquared(from);
    const b = this.pointAt(this.t - 1, T).distanceToSquared(from);
    this.dir = a > b ? 1 : -1;
  }

  update(dt) {
    const g = this.game;
    this.timer -= dt;
    let speed = 0;
    let pose = 'stand';
    switch (this.state) {
      case 'walk':
      case 'panic': {
        if (this.state === 'panic' && this.timer <= 0) this.state = 'walk';
        speed = this.state === 'panic' ? 5.5 : this.speed;
        this.t += this.dir * speed * dt;
        this.pointAt(this.t, T);
        const dx = T.x - this.pos.x, dz = T.z - this.pos.z;
        if (dx * dx + dz * dz > 1e-6) this.facing = angleDamp(this.facing, Math.atan2(dx, dz), 10, dt);
        this.pos.set(T.x, 0, T.z);
        break;
      }
      case 'talk': {
        const p = g.player.pos;
        this.facing = angleDamp(this.facing, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), 8, dt);
        if (this.timer <= 0) this.state = 'walk';
        break;
      }
      case 'knocked': {
        const v = this.vel;
        v.y -= GRAVITY * dt;
        const prevY = this.pos.y;
        this.pos.addScaledVector(v, dt);
        const gnd = g.world.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
        if (this.pos.y <= gnd) {
          this.pos.y = gnd;
          v.y = 0;
          this.onGround = true;
          const f = Math.exp(-5 * dt);
          v.x *= f;
          v.z *= f;
        } else this.onGround = false;
        g.world.resolveCircle(this.pos, this.radius, this.pos.y, 1.7);
        g.world.clampBounds(this.pos);
        pose = this.onGround ? 'down' : 'air';
        if (this.onGround && this.timer <= 0) {
          this.state = 'return';
          this.retT = this.closestT(this.pos.x, this.pos.z);
        }
        break;
      }
      case 'return': {
        this.pointAt(this.retT, T);
        const dx = T.x - this.pos.x, dz = T.z - this.pos.z, d = Math.hypot(dx, dz);
        speed = 2.5;
        if (d < 0.2 || this.pos.y > 0.5) {
          // Peds knocked onto a roof just teleport home - not worth path-finding for.
          this.pos.set(T.x, 0, T.z);
          this.t = this.retT;
          this.state = 'walk';
        } else {
          this.pos.x += (dx / d) * speed * dt;
          this.pos.z += (dz / d) * speed * dt;
          this.facing = angleDamp(this.facing, Math.atan2(dx, dz), 8, dt);
        }
        break;
      }
    }
    this.phase += speed * dt * 3.2;
    const root = this.h.root;
    const cam = g.camera.position;
    const near = Math.abs(this.pos.x - cam.x) < 160 && Math.abs(this.pos.z - cam.z) < 160;
    root.visible = near;
    if (!near) return;
    root.position.copy(this.pos);
    root.rotation.y = this.facing;
    animateHumanoid(this.h, {
      pose, phase: this.phase, amt: Math.min(1.5, speed / 2.5), t: g.time,
      punchT: this.state === 'talk' ? (g.time * 0.8) % 1 : undefined, punchSide: 'L',
    });
  }
}

export class Peds {
  constructor(game, count) {
    this.game = game;
    this.list = [];
    const blocks = [];
    for (let bi = 0; bi < CITY.N; bi++) {
      for (let bj = 0; bj < CITY.N; bj++) {
        if (!ZONES.some((z) => z.bi === bi && z.bj === bj)) blocks.push([bi, bj]);
      }
    }
    for (let i = 0; i < count; i++) {
      const [bi, bj] = pick(blocks);
      this.list.push(new Ped(game, bi, bj));
    }
  }

  update(dt) {
    for (const p of this.list) p.update(dt);
  }

  nearest(pos, r) {
    let best = null, bd = r * r;
    for (const p of this.list) {
      if (p.state === 'knocked' || p.state === 'return') continue;
      const d = (p.pos.x - pos.x) ** 2 + (p.pos.z - pos.z) ** 2;
      if (d < bd && Math.abs(p.pos.y - pos.y) < 2) { bd = d; best = p; }
    }
    return best;
  }

  talk(p) {
    const g = this.game;
    p.state = 'talk';
    p.timer = 4;
    const zone = g.enemies.zones.find((z) => !z.liberated);
    let line = pick(LINES);
    if (line.includes('{zone}')) line = zone ? line.replace('{zone}', zone.name) : 'The gangs are gone! You are my hero!';
    g.hud.speech(p, line, 4);
    if (!p.talked) {
      p.talked = true;
      g.prog.addXP(5, 'New fan', p.pos.clone().setY(p.pos.y + 2));
    }
  }

  alarm(pos, r) {
    const r2 = r * r;
    for (const p of this.list) {
      if ((p.pos.x - pos.x) ** 2 + (p.pos.z - pos.z) ** 2 < r2) p.panic(pos);
    }
  }

  knockArea(c, r, knock) {
    const r2 = r * r;
    for (const p of this.list) {
      const dx = p.pos.x - c.x, dz = p.pos.z - c.z, d2 = dx * dx + dz * dz;
      if (d2 > r2 || Math.abs(p.pos.y - c.y) > r + 2) continue;
      const d = Math.sqrt(d2) || 1;
      const f = 1 - d / r * 0.5;
      p.knock(new THREE.Vector3((dx / d) * knock * f * 0.7, knock * 0.5 * f, (dz / d) * knock * f * 0.7));
    }
  }
}
