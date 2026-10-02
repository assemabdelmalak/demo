import * as THREE from 'three';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

const fireGeo = new THREE.IcosahedronGeometry(0.45, 1);
const fireMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false });
const boltGeo = new THREE.IcosahedronGeometry(0.28, 1);
const boltMat = new THREE.MeshBasicMaterial({ color: '#e08bff', toneMapped: false });

// Projectiles (player fireballs, enemy energy bolts) and chain lightning.
export class Powers {
  constructor(game) {
    this.game = game;
    this.shots = [];
  }

  fireball(origin, dir) {
    const mesh = new THREE.Mesh(fireGeo, fireMat);
    mesh.position.copy(origin);
    this.game.scene.add(mesh);
    this.shots.push({ kind: 'fire', mesh, pos: origin.clone(), vel: dir.clone().multiplyScalar(45), life: 2.2 });
    this.game.fx.flash(origin, '#ff9a40', 300);
  }

  enemyBolt(origin, dir, dmg) {
    const mesh = new THREE.Mesh(boltGeo, boltMat);
    mesh.position.copy(origin);
    this.game.scene.add(mesh);
    this.shots.push({ kind: 'bolt', mesh, pos: origin.clone(), vel: dir.clone().multiplyScalar(20), life: 3, dmg });
  }

  chainLightning(player) {
    const g = this.game;
    const mul = g.prog.damageMul;
    const origin = player.chest(new THREE.Vector3());
    origin.y += 0.4;
    g.camera.getWorldDirection(V2);
    const first = g.enemies.bestTarget(g.camera.position, V2, 45, 0.85) || g.enemies.nearestEnemy(player.pos, 18);
    g.shake(0.3);
    if (!first) {
      // Nothing to chain to: call a bolt down from the sky where we're aiming.
      const p = g.aimPoint(60, new THREE.Vector3());
      g.fx.lightning(V.set(p.x + 3, p.y + 45, p.z - 2), p);
      g.fx.lightning(origin, p);
      g.fx.shockwave(p, 5, '#9fd0ff');
      g.damageArea(p, 4.5, 45 * mul, 10, { fromPlayer: true });
      return;
    }
    player.facing = Math.atan2(first.pos.x - player.pos.x, first.pos.z - player.pos.z);
    const hit = new Set();
    let from = origin, cur = first;
    for (let k = 0; k < 5 && cur; k++) {
      hit.add(cur);
      const cp = cur.chest(new THREE.Vector3());
      g.fx.lightning(from, cp);
      if (k === 0) g.fx.lightning(V.set(cp.x + 2, cp.y + 40, cp.z + 1), cp);
      V.subVectors(cp, from).setY(0).normalize().multiplyScalar(6);
      V.y = 5;
      g.hitEnemy(cur, 55 * mul * (k === 0 ? 1 : 0.75), V.clone());
      from = cp;
      cur = g.enemies.nearestEnemy(cur.pos, 12, (e) => !hit.has(e));
    }
  }

  update(dt) {
    const g = this.game, fx = g.fx;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      if (s.kind === 'fire') s.vel.y -= 4 * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.x += dt * 10;
      let hit = s.life <= 0 || s.pos.y <= 0.15 || !!g.world.pointInBuilding(s.pos, 0);
      if (s.kind === 'fire') {
        fx.trail(s.pos, Math.random() < 0.5 ? '#ff8a2a' : '#ffd25a', 0.7);
        if (!hit) {
          for (const e of g.enemies.list) {
            if (!e.dead && e.chest(V).distanceTo(s.pos) < 1.1 * e.scale) { hit = true; break; }
          }
        }
        if (!hit) {
          for (const p of g.world.props) {
            if (p.alive && !p.carried && p.center(V).distanceTo(s.pos) < p.radius + 0.5) { hit = true; break; }
          }
        }
        if (!hit) {
          for (const c of g.traffic.cars) {
            if (V.set(c.pos.x, 0.75, c.pos.z).distanceTo(s.pos) < 1.9) { hit = true; break; }
          }
        }
        if (hit) {
          s.pos.y = Math.max(s.pos.y, 0.3);
          g.explode(s.pos, 4.5, 45 * g.prog.damageMul, { fromPlayer: true, buildingMul: 1.2 });
        }
      } else {
        fx.trail(s.pos, '#c46bff', 0.35);
        const p = g.player;
        if (!p.dead && p.chest(V).distanceTo(s.pos) < 0.95) {
          V2.copy(s.vel).normalize().multiplyScalar(3);
          V2.y = 2;
          p.takeDamage(s.dmg, V2);
          hit = true;
        }
        if (hit) fx.sparks(s.pos, '#d58bff', 10, 6);
      }
      if (hit) {
        g.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }
  }
}
