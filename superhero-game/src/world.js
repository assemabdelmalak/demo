import * as THREE from 'three';
import { CITY, CITY_W, HALF, blockMin, roadCenter, ZONES, PARK } from './config.js';
import { clamp, mulberry32, mergeColored, box } from './util.js';
import { makeProp } from './props.js';

const WALL_COLORS = ['#cdbfa6', '#a9b6c4', '#d9d3c7', '#8e9aa8', '#bb937a', '#e3dfd3', '#7f8e9c', '#c9a98b', '#9fb0a0'];
const TILE_W = 16, TILE_H = 14; // world units covered by one window-texture tile

function makeWindowTexture(R) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 4; r++) {
    g.fillStyle = '#dcdcdc';
    g.fillRect(0, r * 32 + 28, 128, 4);
    for (let col = 0; col < 4; col++) {
      const lit = R() < 0.2;
      g.fillStyle = lit ? '#ffe7a3' : '#4a5d74';
      g.fillRect(col * 32 + 5, r * 32 + 5, 22, 20);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(col * 32 + 5, r * 32 + 5, 22, 5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Box with UVs scaled to world size so windows tile at a constant size on every building.
function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    let su, sv;
    if (face < 2) { su = d / TILE_W; sv = h / TILE_H; }
    else if (face < 4) { su = w / TILE_W; sv = d / TILE_W; }
    else { su = w / TILE_W; sv = h / TILE_H; }
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return g;
}

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.buildings = [];
    this.props = [];
    this.trees = [];
    this.rng = mulberry32(20261002);
    this.mapDirty = true;
    this.winTex = makeWindowTexture(this.rng);
    this.wallMats = WALL_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c, map: this.winTex }));
    this.roofMat = new THREE.MeshLambertMaterial({ color: '#5b5f66' });
    this.acMat = new THREE.MeshLambertMaterial({ color: '#9aa0a6' });
    this.rubbleMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.build();
  }

  build() {
    const scene = this.scene;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: '#6f8f5a' }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.03;
    outer.receiveShadow = true;
    scene.add(outer);
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(CITY_W, CITY_W), new THREE.MeshLambertMaterial({ color: '#43474d' }));
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.receiveShadow = true;
    scene.add(asphalt);

    const slabs = [];
    const trees = [];
    const R = this.rng;
    const B = CITY.BLOCK;
    for (let bi = 0; bi < CITY.N; bi++) {
      for (let bj = 0; bj < CITY.N; bj++) {
        const x0 = blockMin(bi), z0 = blockMin(bj), cx = x0 + B / 2, cz = z0 + B / 2;
        slabs.push({ geo: box(B, 0.12, B, cx, 0.06, cz), color: '#a3a29c' });
        const zone = ZONES.find((z) => z.bi === bi && z.bj === bj);
        const park = PARK.bi === bi && PARK.bj === bj;
        if (zone) {
          slabs.push({ geo: box(B - 6, 0.14, B - 6, cx, 0.07, cz), color: '#5a4e44' });
          this.zoneProps(x0, z0);
        } else if (park) {
          slabs.push({ geo: box(B - 6, 0.14, B - 6, cx, 0.07, cz), color: '#5f9e4a' });
          slabs.push({ geo: box(B - 6, 0.15, 3, cx, 0.075, cz), color: '#c9b48a' });
          slabs.push({ geo: box(3, 0.15, B - 6, cx, 0.075, cz), color: '#c9b48a' });
          for (let i = 0; i < 16; i++) {
            const tx = x0 + 5 + R() * (B - 10), tz = z0 + 5 + R() * (B - 10);
            if (Math.abs(tx - cx) < 3 || Math.abs(tz - cz) < 3) continue;
            trees.push({ x: tx, z: tz, s: 0.9 + R() * 0.6 });
          }
          this.addProp('bench', cx - 7, cz + 2.4, 0);
          this.addProp('bench', cx + 7, cz - 2.4, Math.PI);
          this.addProp('bench', cx + 2.4, cz + 8, Math.PI / 2);
          this.addProp('bench', cx - 2.4, cz - 8, -Math.PI / 2);
        } else {
          this.cityLot(x0, z0);
        }
        // Street furniture along the curb.
        this.addProp('lamp', x0 + 0.7, z0 + 0.7, -Math.PI * 0.75);
        this.addProp('lamp', x0 + B - 0.7, z0 + B - 0.7, Math.PI * 0.25);
        this.addProp('hydrant', x0 + 0.7, z0 + B * 0.5, 0);
        this.addProp('bin', x0 + B - 0.7, z0 + B * 0.35, 0);
        if (!zone) {
          trees.push({ x: x0 + B * 0.3, z: z0 + 0.8, s: 0.8 });
          trees.push({ x: x0 + B * 0.7, z: z0 + B - 0.8, s: 0.8 });
          trees.push({ x: x0 + 0.8, z: z0 + B * 0.75, s: 0.8 });
          trees.push({ x: x0 + B - 0.8, z: z0 + B * 0.2, s: 0.8 });
        }
      }
    }
    const slab = new THREE.Mesh(mergeColored(slabs), new THREE.MeshLambertMaterial({ vertexColors: true }));
    slab.receiveShadow = true;
    scene.add(slab);
    this.buildMarkings();
    this.buildTrees(trees);
  }

  cityLot(x0, z0) {
    const R = this.rng, m = 3.5, A = CITY.BLOCK - 2 * m, ax = x0 + m, az = z0 + m;
    const lots = [];
    const r = R();
    if (r < 0.22) lots.push([ax, az, A, A]);
    else if (r < 0.5) {
      const s = A * (0.4 + R() * 0.2);
      lots.push([ax, az, s, A], [ax + s, az, A - s, A]);
    } else if (r < 0.78) {
      const s = A * (0.4 + R() * 0.2);
      lots.push([ax, az, A, s], [ax, az + s, A, A - s]);
    } else {
      const s = A * (0.4 + R() * 0.2), t = A * (0.4 + R() * 0.2);
      lots.push([ax, az, s, t], [ax + s, az, A - s, t], [ax, az + t, s, A - t], [ax + s, az + t, A - s, A - t]);
    }
    for (const [lx, lz, lw, ld] of lots) {
      const gap = 0.6, inset = R() < 0.3 ? R() * 2 : 0;
      const minX = lx + gap + inset, maxX = lx + lw - gap - inset;
      const minZ = lz + gap + inset, maxZ = lz + ld - gap - inset;
      const dist = Math.min(1, Math.hypot((minX + maxX) / 2, (minZ + maxZ) / 2) / HALF);
      let h = 8 + R() * 14 + Math.pow(1 - dist, 2) * (25 + R() * 65);
      h = Math.max(7, Math.round(h / 3.5) * 3.5);
      this.addBuilding(minX, maxX, minZ, maxZ, h);
    }
  }

  addBuilding(minX, maxX, minZ, maxZ, h) {
    const R = this.rng;
    const w = maxX - minX, d = maxZ - minZ;
    const ci = Math.floor(R() * WALL_COLORS.length);
    const wall = this.wallMats[ci];
    const mesh = new THREE.Mesh(buildingGeo(w, h, d), [wall, wall, this.roofMat, this.roofMat, wall, wall]);
    mesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    if (R() < 0.5) {
      const s = Math.min(w, d) * 0.22;
      const ac = new THREE.Mesh(new THREE.BoxGeometry(s, 0.9, s * 0.8), this.acMat);
      ac.position.set((R() - 0.5) * w * 0.4, h + 0.45, (R() - 0.5) * d * 0.4);
      ac.castShadow = true;
      mesh.add(ac);
    }
    this.scene.add(mesh);
    const b = {
      minX, maxX, minZ, maxZ, h, mesh, color: WALL_COLORS[ci],
      solid: true, collapsing: false, shake: 0, fallV: 0, dustAcc: 0,
      cx: mesh.position.x, cz: mesh.position.z,
    };
    b.maxHp = b.hp = 120 + h * 5 + w * d * 0.15;
    this.buildings.push(b);
  }

  zoneProps(x0, z0) {
    const R = this.rng, B = CITY.BLOCK;
    for (let i = 0; i < 9; i++) this.addProp('crate', x0 + 6 + R() * (B - 12), z0 + 6 + R() * (B - 12), R() * 3);
    for (let i = 0; i < 5; i++) this.addProp('barrel', x0 + 6 + R() * (B - 12), z0 + 6 + R() * (B - 12), 0);
  }

  addProp(type, x, z, rot) {
    const p = makeProp(this.game, type, x, z, rot);
    this.props.push(p);
    return p;
  }

  buildMarkings() {
    const dashes = [];
    for (let i = 0; i <= CITY.N; i++) {
      const rc = roadCenter(i);
      for (let s = -HALF; s < HALF; s += 6) {
        const c = s + 1.5;
        let near = false;
        for (let j = 0; j <= CITY.N; j++) {
          if (Math.abs(c - roadCenter(j)) < CITY.ROAD / 2 + 1.5) { near = true; break; }
        }
        if (near) continue;
        dashes.push([rc, c, 0], [c, rc, 1]);
      }
    }
    const im = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.25, 2.5).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#e8e3c8' }),
      dashes.length,
    );
    const d = new THREE.Object3D();
    dashes.forEach(([x, z, rot], i) => {
      d.position.set(x, 0.02, z);
      d.rotation.set(0, rot ? Math.PI / 2 : 0, 0);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    });
    im.receiveShadow = true;
    this.scene.add(im);
  }

  buildTrees(list) {
    const n = list.length;
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.15, 0.22, 2.2, 6).translate(0, 1.1, 0),
      new THREE.MeshLambertMaterial({ color: '#6b4a2b' }), n,
    );
    const crown = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.5, 0).translate(0, 3.2, 0),
      new THREE.MeshLambertMaterial({ color: '#ffffff' }), n,
    );
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach((t, i) => {
      d.position.set(t.x, 0, t.z);
      d.rotation.set(0, this.rng() * 6, 0);
      d.scale.setScalar(t.s);
      d.updateMatrix();
      trunk.setMatrixAt(i, d.matrix);
      crown.setMatrixAt(i, d.matrix);
      crown.setColorAt(i, c.setHSL(0.27 + this.rng() * 0.06, 0.45, 0.32 + this.rng() * 0.1));
    });
    trunk.castShadow = crown.castShadow = true;
    this.scene.add(trunk, crown);
    this.trees = list.map((t) => ({ x: t.x, z: t.z, r: 0.35 }));
  }

  // ---- Queries -----------------------------------------------------------

  // Push a vertical cylinder out of solid buildings. Mutates pos; returns the last wall hit.
  resolveCircle(pos, r, feetY, height) {
    let hit = null;
    for (const b of this.buildings) {
      if (!b.solid) continue;
      if (feetY >= b.h - 0.05 || feetY + height <= 0) continue;
      if (pos.x < b.minX - r || pos.x > b.maxX + r || pos.z < b.minZ - r || pos.z > b.maxZ + r) continue;
      const cx = clamp(pos.x, b.minX, b.maxX), cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      let nx, nz, pen;
      if (d2 > 1e-9) {
        const dd = Math.sqrt(d2);
        pen = r - dd;
        if (pen <= 0) continue;
        nx = dx / dd;
        nz = dz / dd;
      } else {
        const l = pos.x - b.minX, rr = b.maxX - pos.x, bk = pos.z - b.minZ, f = b.maxZ - pos.z;
        const m = Math.min(l, rr, bk, f);
        if (m === l) { nx = -1; nz = 0; pen = l + r; }
        else if (m === rr) { nx = 1; nz = 0; pen = rr + r; }
        else if (m === bk) { nx = 0; nz = -1; pen = bk + r; }
        else { nx = 0; nz = 1; pen = f + r; }
      }
      pos.x += nx * pen;
      pos.z += nz * pen;
      hit = { b, nx, nz };
    }
    return hit;
  }

  // Highest walkable surface under (x,z) that is not above feetY (+ a small step).
  groundAt(x, z, feetY) {
    let g = 0;
    for (const b of this.buildings) {
      if (!b.solid || b.h <= g || b.h > feetY + 0.6) continue;
      if (x >= b.minX - 0.25 && x <= b.maxX + 0.25 && z >= b.minZ - 0.25 && z <= b.maxZ + 0.25) g = b.h;
    }
    return g;
  }

  pointInBuilding(p, m = 0) {
    for (const b of this.buildings) {
      if (!b.solid) continue;
      if (p.y < b.h + m && p.y > -1 && p.x > b.minX - m && p.x < b.maxX + m && p.z > b.minZ - m && p.z < b.maxZ + m) return b;
    }
    return null;
  }

  rectDist(b, x, z) {
    const dx = Math.max(b.minX - x, 0, x - b.maxX);
    const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
    return Math.hypot(dx, dz);
  }

  clampBounds(pos) {
    const B = HALF + 30;
    pos.x = clamp(pos.x, -B, B);
    pos.z = clamp(pos.z, -B, B);
  }

  // Player vs trees, props and traffic.
  collideObstacles(pl) {
    const p = pl.pos, r = pl.radius;
    for (const t of this.trees) {
      if (p.y > 4) break;
      const dx = p.x - t.x, dz = p.z - t.z, rr = r + t.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (rr - d);
        p.z += (dz / d) * (rr - d);
      }
    }
    const spd = pl.speed2D;
    for (const pr of this.props) {
      if (!pr.alive || pr.carried) continue;
      if (p.y > pr.pos.y + pr.height || p.y + 1.8 < pr.pos.y) continue;
      const dx = p.x - pr.pos.x, dz = p.z - pr.pos.z, rr = r + pr.radius, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      if (spd > 9 && pr.mass <= 2 && pr.type !== 'car') {
        // Running into small things knocks them flying.
        pr.knock(new THREE.Vector3(pl.vel.x * 0.9, 3 + spd * 0.15, pl.vel.z * 0.9).multiplyScalar(pr.mass));
        continue;
      }
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (rr - d);
      p.z += (dz / d) * (rr - d);
    }
    if (p.y < 1.6) {
      for (const c of this.game.traffic.cars) {
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        for (const off of [-1.1, 1.1]) {
          const cx = c.pos.x + fx * off, cz = c.pos.z + fz * off;
          const dx = p.x - cx, dz = p.z - cz, rr = r + 1.05, d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            p.x += (dx / d) * (rr - d);
            p.z += (dz / d) * (rr - d);
          }
        }
      }
    }
  }

  // ---- Destruction -------------------------------------------------------

  damageBuilding(b, dmg, point) {
    if (!b.solid) return;
    b.hp -= dmg;
    b.shake = 0.25;
    const g = this.game;
    g.fx.burst(point, b.color, Math.min(18, 5 + Math.round(dmg / 10)), 7, 0.45);
    g.fx.dust(point, 3, 0.5, '#c8beae', 1.1);
    if (b.hp <= 0) {
      b.solid = false;
      b.collapsing = true;
      this.mapDirty = true;
      g.onBuildingDestroyed(b);
    }
  }

  addRubble(b) {
    const R = Math.random, parts = [];
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    const n = 10 + Math.round((w * d) / 30);
    for (let i = 0; i < n; i++) {
      const s = 1 + R() * 2.5;
      parts.push({
        geo: box(s, s * 0.6, s, b.minX + R() * w, s * 0.2, b.minZ + R() * d).rotateY(R()),
        color: R() < 0.5 ? b.color : '#8a8580',
      });
    }
    const m = new THREE.Mesh(mergeColored(parts), this.rubbleMat);
    m.receiveShadow = m.castShadow = true;
    this.scene.add(m);
  }

  update(dt) {
    const fx = this.game.fx;
    for (const b of this.buildings) {
      if (b.shake > 0) {
        b.shake -= dt;
        const k = b.shake > 0 ? 0.12 : 0;
        b.mesh.position.x = b.cx + (Math.random() - 0.5) * k;
        b.mesh.position.z = b.cz + (Math.random() - 0.5) * k;
      }
      if (b.collapsing) {
        b.fallV += 9 * dt;
        b.mesh.position.y -= b.fallV * dt;
        b.mesh.position.x = b.cx + (Math.random() - 0.5) * 0.5;
        b.mesh.position.z = b.cz + (Math.random() - 0.5) * 0.5;
        b.dustAcc += dt * 40;
        const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
        while (b.dustAcc > 1) {
          b.dustAcc--;
          const side = Math.random() * 4 | 0, t = Math.random();
          const px = side < 2 ? b.minX + t * w : side === 2 ? b.minX - 1 : b.maxX + 1;
          const pz = side < 2 ? (side === 0 ? b.minZ - 1 : b.maxZ + 1) : b.minZ + t * d;
          fx.dust(new THREE.Vector3(px, 0.5, pz), 1, 1, '#b5aa98', 3.5);
        }
        if (Math.random() < dt * 25) {
          const top = Math.max(1, b.mesh.position.y + b.h);
          fx.burst(new THREE.Vector3(b.minX + Math.random() * w, top, b.minZ + Math.random() * d), b.color, 3, 8, 0.8);
        }
        if (b.mesh.position.y < -b.h) {
          b.collapsing = false;
          this.scene.remove(b.mesh);
          b.mesh.geometry.dispose();
          this.addRubble(b);
        }
      }
    }
    let dead = false;
    for (const p of this.props) {
      if (p.alive) p.update(dt);
      if (!p.alive) dead = true;
    }
    if (dead) this.props = this.props.filter((p) => p.alive);
  }
}
