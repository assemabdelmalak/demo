import * as THREE from 'three';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Progression } from './progression.js';
import { FX } from './fx.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Enemies } from './enemies.js';
import { Powers } from './powers.js';
import { clamp, damp } from './util.js';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const D = new THREE.Vector3();

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    const coarse = matchMedia('(pointer: coarse)').matches;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !coarse, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color('#9fcbf2');
    s.fog = new THREE.Fog('#b9d6f0', 90, 340);
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 700);

    s.add(new THREE.HemisphereLight('#d6ebff', '#6b5a48', 1.7));
    const sun = (this.sun = new THREE.DirectionalLight('#fff1d6', 2.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 1;
    sc.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    s.add(sun, sun.target);

    this.time = 0;
    this.started = false;
    this.hitstopT = 0;
    this.shakeAmt = 0;
    this.cam = { yaw: Math.PI, pitch: 0.32, dist: 7, curDist: 7, target: new THREE.Vector3(2, 2, 10) };

    this.input = new Input(this);
    this.hud = new HUD(this);
    this.prog = new Progression(this);
    this.fx = new FX(this);
    this.world = new World(this);
    this.player = new Player(this);
    this.traffic = new Traffic(this, 28);
    this.peds = new Peds(this, 70);
    this.enemies = new Enemies(this);
    this.powers = new Powers(this);

    const params = new URLSearchParams(location.search);
    if (params.has('level')) this.prog.setLevel(parseInt(params.get('level'), 10) || 1);
    this.player.hp = this.player.maxHp = this.prog.maxHP;

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  start() {
    this.started = true;
    this.cam.yaw = Math.PI;
    this.hud.toast('SUPER CITY', 'Run at a wall to climb it. Find the red beacons to fight crime.', 4);
  }

  frame() {
    this.update(Math.min(this.clock.getDelta(), 0.05));
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  update(dt) {
    this.input.update(dt);
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      dt *= 0.1;
    }
    if (this.started) {
      this.time += dt;
      this.cam.yaw -= this.input.look.dx;
      this.cam.pitch = clamp(this.cam.pitch + this.input.look.dy, -0.45, 1.35);
      this.player.update(dt);
      this.traffic.update(dt);
      this.peds.update(dt);
      this.enemies.update(dt);
      this.powers.update(dt);
      this.world.update(dt);
      this.checkThrown();
    } else {
      this.time += dt;
      this.cam.yaw += dt * 0.08;
      this.traffic.update(dt);
      this.peds.update(dt);
      this.player.animate(dt);
    }
    this.fx.update(dt);
    this.updateCamera(dt);
    const p = this.player.pos;
    this.sun.position.set(p.x + 60, p.y + 120, p.z + 40);
    this.sun.target.position.copy(p);
    this.hud.update(dt);
  }

  updateCamera(dt) {
    const c = this.cam, pl = this.player;
    c.target.x = damp(c.target.x, pl.pos.x, 18, dt);
    c.target.z = damp(c.target.z, pl.pos.z, 18, dt);
    c.target.y = damp(c.target.y, pl.pos.y + (pl.carrying ? 3.6 : 2.0), pl.state === 'climb' ? 6 : 10, dt);
    let want = pl.state === 'fly' ? 10 : 7;
    if (pl.speed2D > 11) want += 1.5;
    if (pl.carrying) want += 3.5;
    if (!this.started) want = 11;
    c.dist = damp(c.dist, want, 3, dt);
    const cp = Math.cos(c.pitch);
    D.set(Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp);
    // Pull the camera in when a building is between it and the hero.
    let d = c.dist;
    for (let s = 0.6; s <= c.dist; s += 0.4) {
      V.copy(c.target).addScaledVector(D, s);
      if (V.y < 0.3 || this.world.pointInBuilding(V, 0.3)) {
        d = Math.max(0.8, s - 0.4);
        break;
      }
    }
    c.curDist = d < c.curDist ? d : damp(c.curDist, d, 4, dt);
    this.camera.position.copy(c.target).addScaledVector(D, c.curDist);
    this.camera.lookAt(c.target);
    if (this.shakeAmt > 0) {
      const a = this.shakeAmt * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.position.z += (Math.random() - 0.5) * a;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
  }

  // ---- Combat helpers ----------------------------------------------------

  shake(a) { this.shakeAmt = Math.min(1.2, Math.max(this.shakeAmt, a)); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }

  // Point under the crosshair (first building, enemy or ground hit).
  aimPoint(maxD, out) {
    this.camera.getWorldDirection(D);
    const start = V2.copy(this.camera.position).addScaledVector(D, this.cam.curDist + 0.5);
    for (let s = 0; s < maxD; s += 0.8) {
      out.copy(start).addScaledVector(D, s);
      if (out.y <= 0 || this.world.pointInBuilding(out, 0)) return out;
      for (const e of this.enemies.list) {
        if (!e.dead && e.chest(V).distanceTo(out) < 1.2 * e.scale) return out.copy(V);
      }
    }
    return out.copy(start).addScaledVector(D, maxD);
  }

  // Direction from origin toward the crosshair, with a little aim assist.
  aimDir(origin, out) {
    this.camera.getWorldDirection(D);
    const e = this.enemies.bestTarget(this.camera.position, D, 70, 0.975);
    if (e) e.chest(out);
    else this.aimPoint(140, out);
    return out.sub(origin).normalize();
  }

  hitEnemy(e, dmg, imp) {
    const killed = e.takeHit(dmg, imp);
    if (killed) {
      this.prog.addXP(e.T.xp, e.boss ? 'BOSS DOWN' : null, e.chest(new THREE.Vector3()));
      if (e.boss) this.hud.toast('BOSS DEFEATED!', 'The Iron Fortress has fallen.', 3.5);
    }
    return killed;
  }

  damageArea(c, r, dmg, knock, o = {}) {
    const fromPlayer = o.fromPlayer !== false;
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      e.chest(V);
      const d = V.distanceTo(c), rr = r + e.radius;
      if (d >= rr) continue;
      const f = 1 - (d / rr) * 0.5;
      const imp = new THREE.Vector3(V.x - c.x, 0, V.z - c.z).normalize().multiplyScalar(knock * f);
      imp.y = knock * 0.55 * f;
      this.hitEnemy(e, dmg * f, imp);
    }
    for (const p of this.world.props) {
      if (!p.alive || p.carried || p === o.exclude) continue;
      p.center(V);
      const d = V.distanceTo(c), rr = r + p.radius;
      if (d >= rr) continue;
      const f = 1 - (d / rr) * 0.5;
      const imp = new THREE.Vector3(V.x - c.x, 0, V.z - c.z).normalize().multiplyScalar(knock * f * p.mass * 0.8);
      imp.y = (knock * 0.6 + 3) * f * p.mass;
      p.damage(dmg * f, imp);
    }
    for (const car of [...this.traffic.cars]) {
      V.set(car.pos.x, 0.75, car.pos.z);
      const d = V.distanceTo(c);
      if (d >= r + 1.6) continue;
      const f = 1 - (d / (r + 1.6)) * 0.5;
      const imp = new THREE.Vector3(V.x - c.x, 0, V.z - c.z).normalize().multiplyScalar(knock * f * 4);
      imp.y = knock * 3 * f;
      const prop = this.traffic.wreck(car, imp);
      if (prop) prop.damage(dmg * f * 0.6, null);
    }
    this.peds.knockArea(c, r, knock);
    if (!fromPlayer) {
      const p = this.player;
      p.chest(V);
      const d = V.distanceTo(c);
      if (d < r + 0.5) {
        const imp = new THREE.Vector3(V.x - c.x, 0, V.z - c.z).normalize().multiplyScalar(knock);
        imp.y = knock * 0.5;
        p.takeDamage(dmg * (1 - (d / (r + 0.5)) * 0.5), imp);
      }
    }
    if (o.buildings !== false) {
      for (const b of this.world.buildings) {
        if (!b.solid || c.y > b.h + r) continue;
        const d = this.world.rectDist(b, c.x, c.z);
        if (d >= r) continue;
        const pt = new THREE.Vector3(clamp(c.x, b.minX, b.maxX), Math.min(c.y, b.h), clamp(c.z, b.minZ, b.maxZ));
        this.world.damageBuilding(b, dmg * (o.buildingMul ?? 1) * (1 - (d / r) * 0.5), pt);
      }
    }
    this.peds.alarm(c, 30);
  }

  explode(c, r, dmg, o = {}) {
    this.fx.fireBurst(c, r);
    this.fx.dust(c, 6, r * 0.5, '#5a5550', 2);
    this.fx.shockwave(V2.set(c.x, Math.max(0, c.y - 1), c.z), r * 1.6, '#ffcf8a');
    this.fx.flash(c, '#ff9a40', 1500);
    const d = c.distanceTo(this.player.pos);
    this.shake(Math.max(0, 0.7 - d / 60));
    this.damageArea(c, r, dmg, 14, o);
  }

  onBuildingDestroyed(b) {
    const top = new THREE.Vector3((b.minX + b.maxX) / 2, Math.min(b.h, this.player.pos.y + 6), (b.minZ + b.maxZ) / 2);
    this.prog.addXP(40, 'Building smashed', top);
    this.shake(0.6);
    this.peds.alarm(top, 70);
  }

  // Thrown objects hitting enemies or cars mid-flight.
  checkThrown() {
    for (const p of this.world.props) {
      if (!p.thrown || !p.dynamic || !p.alive) continue;
      p.center(V2);
      let hit = false;
      for (const e of this.enemies.list) {
        if (!e.dead && e.chest(V).distanceTo(V2) < p.radius + 0.9 * e.scale) { hit = true; break; }
      }
      if (!hit) {
        for (const c of this.traffic.cars) {
          if (V.set(c.pos.x, 0.75, c.pos.z).distanceTo(V2) < p.radius + 1.4) { hit = true; break; }
        }
      }
      if (hit) p.impact();
    }
  }
}

const game = new Game();
window.game = game;

const menu = document.getElementById('menu');
document.getElementById('start').addEventListener('click', () => {
  menu.classList.add('hidden');
  game.start();
  if (game.input.touch) {
    const el = document.documentElement;
    el.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } else {
    game.canvas.requestPointerLock?.();
  }
});
