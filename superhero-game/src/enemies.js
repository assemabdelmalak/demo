import * as THREE from 'three';
import { CITY, blockCenter, ZONES, GRAVITY } from './config.js';
import { makeHumanoid, animateHumanoid } from './humanoid.js';
import { rand, pick, angleDamp, damp } from './util.js';

const TIERS = {
  1: { hp: 40, dmg: 6, speed: 4.6, ranged: 0, color: '#b33a2e', pants: '#2d2d2d', mask: '#111111', count: 5, xp: 20, rate: 1.3 },
  2: { hp: 80, dmg: 9, speed: 5.0, ranged: 0.4, color: '#6c3483', pants: '#1f1f2e', mask: '#e0e0e0', count: 6, xp: 35, rate: 1.2 },
  3: { hp: 150, dmg: 12, speed: 5.6, ranged: 0.55, color: '#117a65', pants: '#1b2631', mask: '#f4d03f', count: 7, xp: 55, rate: 1.1 },
  4: { hp: 220, dmg: 15, speed: 6.0, ranged: 0.5, color: '#212121', pants: '#7b241c', mask: '#c0392b', count: 6, xp: 80, rate: 1.0 },
  boss: { hp: 1400, dmg: 24, speed: 4.2, ranged: 0, color: '#4a6b2a', pants: '#3e2723', mask: '#111111', xp: 400, rate: 2.2, scale: 2.3, boss: true },
};
const SKINS = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69'];
const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

const barGeo = new THREE.PlaneGeometry(1, 0.12);
const barFgGeo = new THREE.PlaneGeometry(1, 0.12).translate(0.5, 0, 0);
const barBgMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.6, depthWrite: false });
const barFgMat = new THREE.MeshBasicMaterial({ color: '#ff3b3b', depthWrite: false });

class Enemy {
  constructor(game, zone, T, pos) {
    this.game = game;
    this.zone = zone;
    this.T = T;
    this.boss = !!T.boss;
    this.scale = T.scale || 1;
    this.ranged = Math.random() < T.ranged;
    this.h = makeHumanoid({
      skin: pick(SKINS), shirt: T.color, pants: T.pants, mask: T.mask, hair: '#111111',
      uniqueShirt: true, shadows: true, scale: this.scale, gun: this.ranged,
    });
    game.scene.add(this.h.root);
    this.hp = this.maxHp = T.hp;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.facing = Math.random() * 6;
    this.onGround = true;
    this.radius = 0.45 * this.scale;
    this.height = 1.8 * this.scale;
    this.attackCd = rand(0.5, 1.5);
    this.windup = 0;
    this.punchT = 1;
    this.knockT = 0;
    this.dead = false;
    this.gone = false;
    this.deadT = 0;
    this.wander = pos.clone();
    this.wanderT = 0;
    this.phase = Math.random() * 6;
    this.flash = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.provoked = 0;

    this.bar = new THREE.Group();
    const bg = new THREE.Mesh(barGeo, barBgMat);
    this.fg = new THREE.Mesh(barFgGeo, barFgMat);
    this.fg.position.set(-0.5, 0, 0.001);
    this.bar.add(bg, this.fg);
    this.bar.scale.setScalar(this.boss ? 2.5 : 1);
    this.bar.visible = false;
    game.scene.add(this.bar);
  }

  chest(out) { return out.set(this.pos.x, this.pos.y + 1.25 * this.scale, this.pos.z); }

  takeHit(dmg, imp) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flash = 1;
    this.provoked = 8;
    const resist = this.boss ? 0.15 : 1;
    if (imp) {
      this.vel.addScaledVector(imp, resist);
      if (imp.length() * resist > 5) {
        this.knockT = 0.55;
        this.onGround = false;
        this.windup = 0;
      }
    }
    this.game.fx.sparks(this.chest(V), '#fff3b0', 6);
    if (this.hp <= 0) {
      this.dead = true;
      this.deadT = 0;
      this.vel.y = Math.max(this.vel.y, 5);
      this.bar.visible = false;
      return true;
    }
    return false;
  }

  remove() {
    this.gone = true;
    this.game.scene.remove(this.h.root);
    this.game.scene.remove(this.bar);
  }

  physics(dt, tx, tz) {
    const w = this.game.world, v = this.vel;
    if (tx !== null) {
      const k = this.onGround ? 10 : 1.5;
      v.x = damp(v.x, tx, k, dt);
      v.z = damp(v.z, tz, k, dt);
    } else if (this.onGround) {
      const f = Math.exp(-5 * dt);
      v.x *= f;
      v.z *= f;
    }
    v.y -= GRAVITY * dt;
    const prevY = this.pos.y;
    this.pos.addScaledVector(v, dt);
    const gnd = w.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    if (this.pos.y <= gnd) {
      this.pos.y = gnd;
      v.y = v.y < -8 ? v.y * -0.25 : 0;
      this.onGround = true;
    } else this.onGround = this.pos.y - gnd < 0.05;
    const hit = w.resolveCircle(this.pos, this.radius, this.pos.y, this.height);
    if (hit) {
      const vn = v.x * hit.nx + v.z * hit.nz;
      if (vn < 0) { v.x -= vn * hit.nx * 1.3; v.z -= vn * hit.nz * 1.3; }
    }
    w.clampBounds(this.pos);
  }

  update(dt) {
    const g = this.game, p = g.player, T = this.T;
    this.attackCd -= dt;
    this.provoked -= dt;
    this.punchT = Math.min(1, this.punchT + dt * 4);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.h.shirtMat.emissive.setScalar(this.flash * 0.8);

    let pose = 'stand', speed = 0;
    if (this.dead) {
      this.deadT += dt;
      this.physics(dt, null, null);
      if (this.deadT > 2.2) this.pos.y -= (this.deadT - 2.2) * dt * 3;
      if (this.deadT > 3.2) { this.remove(); return; }
      pose = this.onGround ? 'down' : 'air';
    } else if (this.knockT > 0) {
      this.knockT -= dt;
      this.physics(dt, null, null);
      pose = this.onGround ? 'down' : 'air';
    } else {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const dy = p.pos.y - this.pos.y;
      const zc = this.zone.center;
      const fromHome = Math.hypot(this.pos.x - zc.x, this.pos.z - zc.z);
      const playerNearZone = Math.hypot(p.pos.x - zc.x, p.pos.z - zc.z) < this.zone.radius + 25;
      let mode = 'patrol';
      if (!p.dead && ((dist < 24 && playerNearZone) || (this.provoked > 0 && dist < 60))) mode = 'fight';
      if (fromHome > this.zone.radius + 30) mode = 'return';
      let tx = 0, tz = 0;
      if (mode === 'fight') {
        const nx = dx / (dist || 1), nz = dz / (dist || 1);
        this.facing = angleDamp(this.facing, Math.atan2(dx, dz), 10, dt);
        const sp = T.speed;
        if (this.ranged && (dist > 5 || dy > 2.5)) {
          if (dist > 16) { tx = nx * sp; tz = nz * sp; }
          else if (dist < 9) { tx = -nx * sp; tz = -nz * sp; }
          else { tx = -nz * this.strafe * sp * 0.6; tz = nx * this.strafe * sp * 0.6; }
          if (Math.random() < dt * 0.3) this.strafe *= -1;
          if (this.attackCd <= 0 && dist < 32) {
            this.attackCd = 1.8 + Math.random() * 1.2;
            const o = this.chest(V);
            o.x += Math.sin(this.facing) * 0.6;
            o.z += Math.cos(this.facing) * 0.6;
            const aim = p.chest(V2).addScaledVector(p.vel, 0.25).sub(o).normalize();
            aim.x += rand(-0.04, 0.04);
            aim.y += rand(-0.03, 0.03);
            g.powers.enemyBolt(o, aim.normalize(), T.dmg);
            this.punchT = 0;
          }
        } else if (this.windup > 0) {
          this.windup -= dt;
          pose = 'windup';
          if (this.windup <= 0) this.strike(dist, dy);
        } else {
          const reach = 1.5 * this.scale;
          if (dist > reach) { tx = nx * sp; tz = nz * sp; }
          else if (this.attackCd <= 0 && Math.abs(dy) < 2 * this.scale) {
            this.windup = this.boss ? 0.75 : 0.3;
            if (!this.boss) this.punchT = 0.0;
          }
        }
      } else {
        const tgt = mode === 'return' ? zc : this.wander;
        this.wanderT -= dt;
        if (mode === 'patrol' && this.wanderT <= 0) {
          this.wanderT = rand(2, 5);
          this.wander.set(zc.x + rand(-1, 1) * this.zone.radius * 0.7, 0, zc.z + rand(-1, 1) * this.zone.radius * 0.7);
        }
        const wx = tgt.x - this.pos.x, wz = tgt.z - this.pos.z, wd = Math.hypot(wx, wz);
        if (wd > 0.8) {
          const sp = T.speed * (mode === 'return' ? 0.8 : 0.35);
          tx = (wx / wd) * sp;
          tz = (wz / wd) * sp;
          this.facing = angleDamp(this.facing, Math.atan2(wx, wz), 6, dt);
        }
      }
      this.physics(dt, tx, tz);
      speed = Math.hypot(this.vel.x, this.vel.z);
      if (!this.onGround) pose = 'air';
    }

    this.phase += speed * dt * 2.4 / this.scale;
    const root = this.h.root;
    root.position.copy(this.pos);
    root.rotation.y = this.facing;
    animateHumanoid(this.h, {
      pose, phase: this.phase, amt: Math.min(1.4, speed / 3.5), t: g.time,
      punchT: this.punchT, punchSide: this.ranged ? 'R' : (this.phase | 0) % 2 ? 'L' : 'R',
    });
    if (!this.dead && this.hp < this.maxHp) {
      this.bar.visible = true;
      this.bar.position.set(this.pos.x, this.pos.y + 2.25 * this.scale, this.pos.z);
      this.bar.quaternion.copy(g.camera.quaternion);
      this.fg.scale.x = Math.max(0.001, this.hp / this.maxHp);
    }
  }

  strike(dist, dy) {
    const g = this.game, p = g.player;
    this.attackCd = this.T.rate + Math.random() * 0.5;
    if (this.boss) {
      // Ground slam: big area knockback.
      this.punchT = 0;
      g.fx.shockwave(this.pos, 7, '#ff6a4d', 0.6);
      g.fx.dust(this.pos, 14, 3);
      const d = p.pos.distanceTo(this.pos);
      g.shake(Math.max(0, 0.7 - d / 40));
      if (d < 5.5 && Math.abs(p.pos.y - this.pos.y) < 2.5) {
        V.subVectors(p.pos, this.pos).setY(0).normalize().multiplyScalar(16);
        V.y = 9;
        p.takeDamage(this.T.dmg, V);
      }
      g.peds.alarm(this.pos, 30);
      return;
    }
    this.punchT = 0;
    if (dist < 2.2 && Math.abs(dy) < 2) {
      V.set(Math.sin(this.facing) * 5, 3, Math.cos(this.facing) * 5);
      p.takeDamage(this.T.dmg, V);
      g.fx.sparks(p.chest(V2), '#ff9a9a', 5);
    }
  }
}

class Zone {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.name = def.name;
    this.tier = def.tier;
    this.center = new THREE.Vector3(blockCenter(def.bi), 0, blockCenter(def.bj));
    this.radius = CITY.BLOCK / 2 - 3;
    this.enemies = [];
    this.liberated = false;
    this.respawnT = 0;

    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.6, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(this.radius - 0.6, this.radius, 64).rotateX(-Math.PI / 2), this.ringMat);
    ring.position.set(this.center.x, 0.2, this.center.z);
    game.scene.add(ring);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 160, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ff3030', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.beam.position.set(this.center.x, 80, this.center.z);
    game.scene.add(this.beam);
    this.spawn();
  }

  spawn() {
    const T = TIERS[this.tier];
    this.enemies = [];
    for (let i = 0; i < T.count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * this.radius * 0.7;
      this.enemies.push(new Enemy(this.game, this, T, new THREE.Vector3(this.center.x + Math.cos(a) * r, 0, this.center.z + Math.sin(a) * r)));
    }
    if (this.tier === 4) this.enemies.push(new Enemy(this.game, this, TIERS.boss, this.center));
    this.liberated = false;
    this.ringMat.color.set('#ff3b3b');
    this.beam.visible = true;
  }

  update(dt) {
    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter((e) => !e.gone);
    const g = this.game;
    if (!this.liberated) {
      if (this.enemies.every((e) => e.dead)) {
        this.liberated = true;
        this.respawnT = 120;
        this.ringMat.color.set('#3ddc84');
        this.beam.visible = false;
        g.hud.toast(`${this.name} liberated!`, `+${60 * this.tier} XP · The citizens cheer`);
        g.prog.addXP(60 * this.tier, null, null);
      }
    } else {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && g.player.pos.distanceTo(this.center) > 80) this.spawn();
    }
  }
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.zones = ZONES.map((d) => new Zone(game, d));
    this.list = [];
    this.rebuild();
  }

  rebuild() {
    this.list = this.zones.flatMap((z) => z.enemies);
  }

  update(dt) {
    for (const z of this.zones) z.update(dt);
    this.rebuild();
    // Keep enemies from stacking on top of each other.
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.radius + b.radius, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }
  }

  nearestEnemy(pos, maxD, filter) {
    let best = null, bd = maxD * maxD;
    for (const e of this.list) {
      if (e.dead || (filter && !filter(e))) continue;
      const d = e.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Enemy closest to the given aim ray (within a cone).
  bestTarget(origin, dir, maxD, minDot) {
    let best = null, bestDot = minDot;
    for (const e of this.list) {
      if (e.dead) continue;
      e.chest(V).sub(origin);
      const d = V.length();
      if (d > maxD || d < 0.5) continue;
      const dot = V.dot(dir) / d;
      if (dot > bestDot) { bestDot = dot; best = e; }
    }
    return best;
  }
}
