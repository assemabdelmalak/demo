import * as THREE from 'three';
import { GRAVITY, START } from './config.js';
import { makeHumanoid, animateHumanoid } from './humanoid.js';
import { clamp, damp, angleDamp, rand } from './util.js';
import { Prop } from './props.js';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const WISH = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(START.x, 0, START.z);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.state = 'ground'; // ground (incl. airborne) | climb | fly
    this.onGround = true;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.radius = 0.45;
    this.height = 1.8;
    this.h = makeHumanoid({
      skin: '#f1c27d', shirt: '#1f4fd1', pants: '#1a2f80', hair: '#2b1b0e', mask: '#1a2f80',
      cape: '#d4252b', emblem: '#ffd31a', belt: '#ffd31a', shadows: true,
    });
    game.scene.add(this.h.root);
    this.hp = 100;
    this.maxHp = 100;
    this.lastHurt = -99;
    this.dead = false;
    this.respawnT = 0;
    this.punchCd = 0;
    this.combo = 0;
    this.comboT = 0;
    this.punchT = 1;
    this.punchSide = 'R';
    this.fireCd = 0;
    this.boltCd = 0;
    this.climbCd = 0;
    this.climb = null;
    this.climbPhase = 0;
    this.walkPhase = 0;
    this.carrying = null;
    this.landT = 0;
    this.flyTilt = 0;
    this.weakHintT = 0;
  }

  get speed2D() { return Math.hypot(this.vel.x, this.vel.z); }
  forward(out) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  chest(out) { return out.set(this.pos.x, this.pos.y + 1.3, this.pos.z); }

  update(dt) {
    const g = this.game, inp = g.input, prog = g.prog;
    this.maxHp = prog.maxHP;
    if (this.dead) {
      this.respawnT -= dt;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y -= GRAVITY * dt;
      this.pos.addScaledVector(this.vel, dt);
      const gnd = g.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
      if (this.pos.y < gnd) { this.pos.y = gnd; this.vel.y = 0; }
      if (this.respawnT <= 0) this.respawn();
      this.animate(dt);
      return;
    }
    if (g.time - this.lastHurt > 4) this.hp = Math.min(this.maxHp, this.hp + 6 * dt);
    this.punchCd -= dt;
    this.fireCd -= dt;
    this.boltCd -= dt;
    this.climbCd -= dt;
    this.comboT -= dt;
    this.landT -= dt;
    this.weakHintT -= dt;
    this.jumpBuf -= dt;
    this.punchT = Math.min(1, this.punchT + dt * 5);

    // Camera-relative movement intent.
    const yaw = g.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const mx = inp.move.x, my = inp.move.y;
    const wish = WISH.set(fx * my + rx * mx, 0, fz * my + rz * mx);
    const wishLen = Math.min(1, wish.length());

    if (inp.pressed('fly')) {
      if (prog.has('flight')) this.toggleFly();
      else g.hud.locked('flight');
    }

    if (this.state === 'climb') this.updateClimb(dt, wish);
    else if (this.state === 'fly') this.updateFly(dt, wish, wishLen, inp.sprint);
    else this.updateGround(dt, wish, wishLen, inp.sprint);

    if (inp.pressed('punch')) this.tryPunch();
    if (inp.pressed('fire')) this.tryFire();
    if (inp.pressed('lightning')) this.tryLightning();
    if (inp.pressed('interact')) this.interact();

    g.world.clampBounds(this.pos);
    if (this.pos.y > 260) { this.pos.y = 260; this.vel.y = Math.min(0, this.vel.y); }

    if (this.carrying) {
      const c = this.carrying;
      if (!c.alive) this.carrying = null;
      else {
        c.pos.set(this.pos.x, this.pos.y + 2.0, this.pos.z);
        c.mesh.rotation.set(0, this.facing + (c.type === 'car' ? Math.PI / 2 : 0), 0);
        c.syncMesh();
      }
    }
    this.animate(dt);
  }

  updateGround(dt, wish, wishLen, sprint) {
    const g = this.game, prog = g.prog, w = g.world;
    const max = (sprint ? 15 : 7.5) * prog.speedMul * (this.carrying ? 0.8 : 1) * (this.landT > 0 ? 0.2 : 1);
    const accel = this.onGround ? 14 : 3.5;
    this.vel.x = damp(this.vel.x, wish.x * max, accel, dt);
    this.vel.z = damp(this.vel.z, wish.z * max, accel, dt);
    if (wishLen > 0.1 && this.punchT >= 1) this.facing = angleDamp(this.facing, Math.atan2(wish.x, wish.z), 12, dt);

    if (g.input.pressed('jump')) {
      if (this.onGround || this.coyote > 0) this.jumpBuf = 0.15;
      else if (prog.has('flight')) { this.toggleFly(); return; }
      else this.jumpBuf = 0.15;
    }
    if (this.jumpBuf > 0 && (this.onGround || this.coyote > 0)) {
      this.jumpBuf = 0;
      this.coyote = 0;
      this.vel.y = 10.5 * prog.jumpMul;
      this.onGround = false;
      if (prog.has('strength')) g.fx.dust(this.pos, 4, 0.5);
    }

    this.vel.y -= GRAVITY * dt;
    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);
    const gnd = w.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    if (this.pos.y <= gnd) {
      if (!this.onGround) this.land(-this.vel.y);
      this.pos.y = gnd;
      this.vel.y = Math.max(0, this.vel.y);
      this.onGround = true;
      this.coyote = 0.12;
    } else {
      this.onGround = false;
      this.coyote -= dt;
    }

    const hit = w.resolveCircle(this.pos, this.radius, this.pos.y, this.height);
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (vn < 0) { this.vel.x -= vn * hit.nx; this.vel.z -= vn * hit.nz; }
      const push = -(wish.x * hit.nx + wish.z * hit.nz);
      if (push > 0.5 && wishLen > 0.3 && !this.carrying && this.climbCd <= 0) this.startClimb(hit);
    }
    w.collideObstacles(this);
  }

  land(v) {
    const g = this.game;
    if (v > 22) {
      // Superhero landing.
      this.landT = 0.35;
      g.fx.shockwave(this.pos, Math.min(9, v / 4), '#ffffff');
      g.fx.dust(this.pos, 16, 1.5);
      g.shake(Math.min(0.8, v / 50));
      if (g.prog.has('strength')) {
        g.damageArea(V.set(this.pos.x, this.pos.y + 0.5, this.pos.z), 5, v * 0.8, 12, { fromPlayer: true, buildings: false });
      }
    } else if (v > 12) g.fx.dust(this.pos, 5, 0.6);
  }

  startClimb(hit) {
    let nx = hit.nx, nz = hit.nz;
    if (Math.abs(nx) > Math.abs(nz)) { nx = Math.sign(nx); nz = 0; } else { nz = Math.sign(nz); nx = 0; }
    this.state = 'climb';
    this.climb = { b: hit.b, nx, nz };
    this.vel.set(0, 0, 0);
    this.onGround = false;
  }

  updateClimb(dt, wish) {
    const g = this.game, c = this.climb, b = c.b, prog = g.prog, inp = g.input;
    const exit = (vx, vy, vz) => {
      this.state = 'ground';
      this.climb = null;
      this.climbCd = 0.35;
      this.vel.set(vx, vy, vz);
    };
    if (!b.solid) { exit(0, 0, 0); return; }
    this.facing = Math.atan2(-c.nx, -c.nz);
    const into = -(wish.x * c.nx + wish.z * c.nz);
    const tx = -c.nz, tz = c.nx;
    const side = wish.x * tx + wish.z * tz;
    const speed = 8 * prog.climbMul * (inp.sprint ? 1.6 : 1);
    if (inp.pressed('jump')) {
      // Wall jump away from the building.
      this.facing = Math.atan2(c.nx, c.nz);
      exit(c.nx * 7, 9 * prog.jumpMul, c.nz * 7);
      return;
    }
    if (into < -0.6) { exit(c.nx * 3, 0, c.nz * 3); return; }
    const vy = into > 0.15 ? speed * into : inp.isHeld('descend') ? -speed : 0;
    const lateral = side * speed * 0.7;
    this.vel.set(tx * lateral, vy, tz * lateral);
    this.pos.addScaledVector(this.vel, dt);
    if (c.nx !== 0) this.pos.x = (c.nx > 0 ? b.maxX : b.minX) + c.nx * this.radius;
    else this.pos.z = (c.nz > 0 ? b.maxZ : b.minZ) + c.nz * this.radius;
    const along = c.nx !== 0 ? this.pos.z : this.pos.x;
    const lo = c.nx !== 0 ? b.minZ : b.minX, hi = c.nx !== 0 ? b.maxZ : b.maxX;
    if (along < lo - 0.2 || along > hi + 0.2) { exit(0, 0, 0); return; }
    this.climbPhase += (Math.abs(vy) + Math.abs(lateral)) * dt * 1.4;
    if (this.pos.y >= b.h - 1.0) {
      // Mantle onto the roof.
      this.pos.y = b.h;
      this.pos.x -= c.nx * 1.0;
      this.pos.z -= c.nz * 1.0;
      exit(-c.nx * 2, 0, -c.nz * 2);
      this.onGround = true;
      return;
    }
    if (this.pos.y <= 0) { this.pos.y = 0; if (vy < 0) exit(0, 0, 0); }
  }

  toggleFly() {
    const g = this.game;
    if (this.state === 'fly') {
      this.state = 'ground';
      this.onGround = false;
    } else {
      this.state = 'fly';
      this.climb = null;
      this.vel.y = Math.max(this.vel.y, 7);
      g.fx.shockwave(this.pos, 4, '#bfe3ff');
      g.fx.dust(this.pos, 8, 1);
    }
  }

  updateFly(dt, wish, wishLen, sprint) {
    const g = this.game, inp = g.input, w = g.world;
    const max = (sprint ? 60 : 30) * (1 + (g.prog.level - 5) * 0.05);
    let up = 0;
    if (inp.isHeld('jump')) up += 1;
    if (inp.isHeld('descend')) up -= 1;
    const k = 2.5;
    this.vel.x = damp(this.vel.x, wish.x * max, k, dt);
    this.vel.z = damp(this.vel.z, wish.z * max, k, dt);
    this.vel.y = damp(this.vel.y, up * max * 0.5, 4, dt);
    this.pos.addScaledVector(this.vel, dt);
    const gnd = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
    if (this.pos.y <= gnd) {
      this.pos.y = gnd;
      if (this.vel.y < 0) this.vel.y = 0;
      if (up < 0) { this.toggleFly(); this.onGround = true; return; }
    }
    const hit = w.resolveCircle(this.pos, this.radius, this.pos.y, this.height);
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (vn < 0) { this.vel.x -= vn * hit.nx; this.vel.z -= vn * hit.nz; }
    }
    const sp = this.speed2D;
    if (sp > 1 && this.punchT >= 1) this.facing = angleDamp(this.facing, Math.atan2(this.vel.x, this.vel.z), 6, dt);
    else if (wishLen > 0.1 && this.punchT >= 1) this.facing = angleDamp(this.facing, Math.atan2(wish.x, wish.z), 6, dt);
    this.flyTilt = damp(this.flyTilt, clamp(sp / 30, 0, 1) * 1.35, 4, dt);
    if (sp > 20) g.fx.trail(V.set(this.pos.x, this.pos.y + 1, this.pos.z), '#bfe3ff', 0.4);
  }

  // ---- Combat ------------------------------------------------------------

  tryPunch() {
    if (this.punchCd > 0 || this.state === 'climb') return;
    if (this.carrying) { this.throwCarried(); return; }
    const g = this.game, prog = g.prog, strong = prog.has('strength');
    this.combo = this.comboT > 0 ? (this.combo + 1) % 3 : 0;
    this.comboT = 0.7;
    const finisher = this.combo === 2;
    this.punchCd = finisher ? 0.42 : 0.22;
    this.punchT = 0;
    this.punchSide = finisher ? 'B' : this.combo === 1 ? 'L' : 'R';

    // Soft lock-on: turn toward (and lunge at) the closest enemy in front.
    const target = g.enemies.nearestEnemy(this.pos, 6, (e) => Math.abs(e.pos.y - this.pos.y) < 2.5 * e.scale);
    if (target) {
      const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      this.facing = Math.atan2(dx, dz);
      if (d > 1.8 && this.state !== 'fly') {
        this.vel.x = (dx / d) * 16;
        this.vel.z = (dz / d) * 16;
      }
    }
    const fwd = this.forward(V2);
    const reach = 2.0 + (strong ? 0.6 : 0);
    const dmg = (finisher ? 18 : 10) * prog.damageMul * (strong ? 2 : 1);
    const knock = (finisher ? 9 : 3) * (strong ? 2.2 : 1);
    let hitAny = false;
    const hitPt = new THREE.Vector3(this.pos.x + fwd.x * 1.1, this.pos.y + 1.3, this.pos.z + fwd.z * 1.1);

    const inArc = (x, z, y, r, h) => {
      const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + r || Math.abs(y - this.pos.y) > h) return 0;
      if (d > 0.6 && (dx * fwd.x + dz * fwd.z) / d < 0.25) return 0;
      return d || 0.01;
    };

    for (const e of g.enemies.list) {
      if (e.dead) continue;
      const d = inArc(e.pos.x, e.pos.z, e.pos.y, e.radius, 2 * e.scale);
      if (!d) continue;
      const imp = new THREE.Vector3(((e.pos.x - this.pos.x) / d) * knock, knock * (finisher ? 0.6 : 0.3), ((e.pos.z - this.pos.z) / d) * knock);
      g.hitEnemy(e, dmg, imp);
      hitAny = true;
    }
    for (const p of g.world.props) {
      if (!p.alive || p.carried) continue;
      const d = inArc(p.pos.x, p.pos.z, p.pos.y, p.radius, 2.5);
      if (!d) continue;
      const imp = new THREE.Vector3(((p.pos.x - this.pos.x) / d) * knock * 1.5, knock * 0.6 + 2, ((p.pos.z - this.pos.z) / d) * knock * 1.5);
      p.damage(dmg * 0.8, imp.multiplyScalar(p.mass * (strong ? 1 : 0.5)));
      hitAny = true;
    }
    for (const c of [...g.traffic.cars]) {
      const d = inArc(c.pos.x, c.pos.z, 0, 1.4, 2.5);
      if (!d) continue;
      const imp = new THREE.Vector3(((c.pos.x - this.pos.x) / d) * knock * 6, knock * (strong ? 4 : 1), ((c.pos.z - this.pos.z) / d) * knock * 6);
      const prop = g.traffic.wreck(c, strong ? imp : imp.multiplyScalar(0.3));
      if (prop) prop.damage(dmg * 0.6, null);
      hitAny = true;
    }
    const b = g.world.pointInBuilding(V.set(this.pos.x + fwd.x * (this.radius + 0.6), this.pos.y + 1.2, this.pos.z + fwd.z * (this.radius + 0.6)), 0.15);
    if (b) {
      if (strong) {
        g.world.damageBuilding(b, dmg * 1.5, hitPt);
        hitAny = true;
      } else {
        g.fx.sparks(hitPt, '#ffffff', 4, 3);
        if (this.weakHintT <= 0) {
          g.hud.notice('Too weak to break walls… reach Level 2 for Super Strength');
          this.weakHintT = 6;
        }
      }
    }
    if (hitAny) {
      g.shake(finisher ? 0.35 : 0.15);
      g.hitstop(finisher ? 0.08 : 0.045);
      g.fx.sparks(hitPt, '#fff6c8', finisher ? 14 : 7);
      if (finisher && strong) g.fx.shockwave(V.set(hitPt.x, this.pos.y, hitPt.z), 3, '#ffffff');
      g.peds.alarm(this.pos, 18);
    }
  }

  tryFire() {
    const g = this.game;
    if (!g.prog.has('fire')) { g.hud.locked('fire'); return; }
    if (this.fireCd > 0 || this.dead) return;
    this.fireCd = 0.45;
    const origin = V.set(this.pos.x, this.pos.y + 1.45, this.pos.z);
    const dir = g.aimDir(origin, new THREE.Vector3());
    this.facing = Math.atan2(dir.x, dir.z);
    origin.addScaledVector(dir, 0.8);
    g.powers.fireball(origin.clone(), dir);
    this.punchT = 0;
    this.punchSide = 'R';
  }

  tryLightning() {
    const g = this.game;
    if (!g.prog.has('lightning')) { g.hud.locked('lightning'); return; }
    if (this.boltCd > 0 || this.dead) return;
    this.boltCd = 1.1;
    this.punchT = 0;
    this.punchSide = 'B';
    g.powers.chainLightning(this);
  }

  interact() {
    const g = this.game;
    if (this.carrying) { this.throwCarried(); return; }
    const ped = g.peds.nearest(this.pos, 3.2);
    if (ped) { g.peds.talk(ped); return; }
    if (!g.prog.has('strength')) {
      if (this.findLiftable(true)) g.hud.locked('strength');
      return;
    }
    if (this.state === 'climb') return;
    const obj = this.findLiftable();
    if (obj) this.lift(obj);
  }

  contextLabel() {
    if (this.dead) return null;
    if (this.carrying) return 'Throw';
    if (this.game.peds.nearest(this.pos, 3.2)) return 'Talk';
    if (this.game.prog.has('strength') && this.state !== 'climb' && this.findLiftable()) return 'Lift';
    return null;
  }

  findLiftable() {
    const g = this.game, p = this.pos;
    let best = null, bd = Infinity;
    if (p.y < 2) {
      for (const c of g.traffic.cars) {
        const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z) - 1.2;
        if (d < 2 && d < bd) { best = c; bd = d; }
      }
    }
    for (const pr of g.world.props) {
      if (!pr.alive || !pr.liftable || pr.carried || pr.thrown) continue;
      const d = Math.hypot(pr.pos.x - p.x, pr.pos.z - p.z) - pr.radius;
      if (d < 1.4 && d < bd && Math.abs(pr.pos.y - p.y) < 2) { best = pr; bd = d; }
    }
    return best;
  }

  lift(obj) {
    const g = this.game;
    const prop = obj instanceof Prop ? obj : g.traffic.wreck(obj, null);
    if (!prop) return;
    prop.carried = true;
    prop.dynamic = false;
    prop.thrown = false;
    prop.vel.set(0, 0, 0);
    this.carrying = prop;
    this.punchCd = 0.3;
    g.fx.dust(this.pos, 6, 1);
    g.shake(0.1);
  }

  throwCarried() {
    const g = this.game, c = this.carrying;
    this.carrying = null;
    if (!c || !c.alive) return;
    const origin = V.set(this.pos.x, this.pos.y + 2.4, this.pos.z);
    const dir = g.aimDir(origin, new THREE.Vector3());
    this.facing = Math.atan2(dir.x, dir.z);
    c.carried = false;
    c.dynamic = true;
    c.thrown = true;
    c.sleepT = 0;
    c.vel.copy(dir).multiplyScalar(34 + g.prog.level * 1.5);
    c.vel.y += 4;
    c.angVel.set(rand(-3, 3), rand(-2, 2), rand(-3, 3));
    c.pos.addScaledVector(dir, 1.2);
    this.punchT = 0;
    this.punchSide = 'B';
    this.punchCd = 0.35;
    g.shake(0.15);
  }

  takeDamage(n, impulse) {
    if (this.dead) return;
    const g = this.game;
    this.hp -= n;
    this.lastHurt = g.time;
    g.hud.hurt();
    g.shake(0.25);
    if (impulse) {
      if (this.state === 'climb') { this.state = 'ground'; this.climb = null; this.climbCd = 0.5; }
      this.vel.add(impulse);
      if (impulse.y > 0 && this.state !== 'fly') this.onGround = false;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.respawnT = 3;
      if (this.carrying) { this.carrying.carried = false; this.carrying.dynamic = true; this.carrying = null; }
      this.state = 'ground';
      g.hud.toast('Knocked out!', 'Respawning at the city centre…');
    }
  }

  respawn() {
    this.dead = false;
    this.hp = this.game.prog.maxHP;
    this.pos.set(START.x, 0, START.z);
    this.vel.set(0, 0, 0);
    this.state = 'ground';
    this.lastHurt = -99;
  }

  animate(dt) {
    const g = this.game, h = this.h;
    const sp = this.speed2D;
    let pose = 'stand', amt = 0;
    if (this.dead) pose = 'down';
    else if (this.state === 'climb') pose = 'climb';
    else if (this.state === 'fly') pose = sp > 4 ? 'fly' : 'hover';
    else if (this.landT > 0) pose = 'land';
    else if (this.carrying) { pose = 'carry'; amt = Math.min(1.4, sp / 6); }
    else if (!this.onGround) pose = 'air';
    else amt = Math.min(1.5, sp / 6);
    this.walkPhase += sp * dt * (sp > 10 ? 1.1 : 1.6);
    h.root.position.copy(this.pos);
    h.root.rotation.y = this.facing;
    const capeX = 0.15 + Math.min(1.25, (sp + Math.abs(this.vel.y) * 0.5) * 0.07) + Math.sin(g.time * 9) * 0.05 * Math.min(1, sp / 8);
    animateHumanoid(h, {
      pose, amt, t: g.time, tilt: this.flyTilt,
      phase: pose === 'climb' ? this.climbPhase : this.walkPhase,
      punchT: this.carrying ? undefined : this.punchT, punchSide: this.punchSide, capeX,
    });
  }
}
