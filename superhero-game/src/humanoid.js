import * as THREE from 'three';

// Blocky low-poly characters. Origin is at the feet; the model faces +Z.
const G = {
  torso: new THREE.BoxGeometry(0.52, 0.62, 0.28).translate(0, 0.31, 0),
  head: new THREE.BoxGeometry(0.3, 0.32, 0.3).translate(0, 0.16, 0),
  hair: new THREE.BoxGeometry(0.32, 0.1, 0.32).translate(0, 0.32, -0.01),
  mask: new THREE.BoxGeometry(0.32, 0.09, 0.32).translate(0, 0.19, 0),
  arm: new THREE.BoxGeometry(0.16, 0.64, 0.16).translate(0, -0.3, 0),
  leg: new THREE.BoxGeometry(0.2, 0.84, 0.22).translate(0, -0.42, 0),
  cape: new THREE.BoxGeometry(0.5, 1.0, 0.03).translate(0, -0.5, 0),
  emblem: new THREE.BoxGeometry(0.2, 0.2, 0.02),
  belt: new THREE.BoxGeometry(0.54, 0.08, 0.3),
  gun: new THREE.BoxGeometry(0.1, 0.14, 0.42),
};

const mats = new Map();
export function mat(color) {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}

function part(geo, material, parent, x, y, z, shadow) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

export function makeHumanoid(o) {
  const shadow = !!o.shadows;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.86;
  root.add(body);
  const shirtMat = o.uniqueShirt ? new THREE.MeshLambertMaterial({ color: o.shirt }) : mat(o.shirt);
  const torso = part(G.torso, shirtMat, body, 0, 0, 0, shadow);
  const head = part(G.head, mat(o.skin), body, 0, 0.64, 0, shadow);
  if (o.hair) part(G.hair, mat(o.hair), head, 0, 0, 0, false);
  if (o.mask) part(G.mask, mat(o.mask), head, 0, 0, 0, false);
  const armMat = o.sleeves ? mat(o.sleeves) : shirtMat;
  const armL = part(G.arm, armMat, body, 0.34, 0.58, 0, shadow);
  const armR = part(G.arm, armMat, body, -0.34, 0.58, 0, shadow);
  const legL = part(G.leg, mat(o.pants), body, 0.13, 0.02, 0, shadow);
  const legR = part(G.leg, mat(o.pants), body, -0.13, 0.02, 0, shadow);
  let cape = null;
  if (o.cape) cape = part(G.cape, mat(o.cape), body, 0, 0.6, -0.17, shadow);
  if (o.emblem) part(G.emblem, mat(o.emblem), torso, 0, 0.42, 0.15, false);
  if (o.belt) part(G.belt, mat(o.belt), torso, 0, 0.04, 0, false);
  if (o.gun) part(G.gun, mat('#1d1d1d'), armR, 0, -0.6, 0.14, false);
  if (o.scale) root.scale.setScalar(o.scale);
  return { root, body, torso, head, armL, armR, legL, legR, cape, shirtMat };
}

// s: { pose, phase, amt, t, tilt, punchT, punchSide, capeX }
export function animateHumanoid(h, s) {
  const phase = s.phase || 0, amt = s.amt || 0, t = s.t || 0;
  const sw = Math.sin(phase);
  let la = 0, ra = 0, ll = 0, rl = 0, bx = 0, by = 0, bz = 0, sl = 0.06, sr = 0.06, bob = 0;
  switch (s.pose) {
    case 'air':
      ll = -0.8; rl = 0.3; la = -0.5; ra = 0.4; sl = sr = 0.45;
      break;
    case 'climb':
      la = -2.8 + Math.sin(phase) * 0.5; ra = -2.8 - Math.sin(phase) * 0.5;
      ll = -0.6 + Math.sin(phase) * 0.5; rl = -0.6 - Math.sin(phase) * 0.5;
      bx = 0.1;
      break;
    case 'fly':
      bx = s.tilt ?? 1.2; ra = -3.0; la = 0.2; ll = 0.1; rl = -0.05; sl = 0.12;
      break;
    case 'hover':
      bx = 0.12; la = 0.25 + Math.sin(t * 3) * 0.1; ra = 0.25 + Math.sin(t * 3 + 1) * 0.1;
      ll = Math.sin(t * 2) * 0.2; rl = -ll; sl = sr = 0.45;
      break;
    case 'carry':
      la = ra = -2.95; sl = sr = -0.15;
      ll = sw * 0.5 * amt; rl = -ll;
      break;
    case 'down':
      bx = -1.45; la = -2.4; ra = -2.1; ll = 0.15; rl = -0.1;
      break;
    case 'land':
      ll = -1.1; rl = 0.7; bx = 0.55; la = 0.5; ra = -0.6; bob = -0.32;
      break;
    case 'windup':
      ra = -2.6; la = -2.6; bx = -0.25; sl = sr = 0.3;
      break;
    default: // stand / walk / run
      ll = sw * 0.75 * amt; rl = -ll;
      la = -sw * 0.65 * amt; ra = -la;
      bx = 0.12 * Math.min(amt, 1.4);
      bob = Math.abs(Math.cos(phase)) * 0.06 * amt;
      if (amt < 0.05) { la = Math.sin(t * 2) * 0.04; ra = -la; }
  }
  if (s.punchT !== undefined && s.punchT < 1) {
    const e = Math.sin(Math.min(1, s.punchT) * Math.PI);
    if (s.punchSide === 'L') { la += (-1.6 - la) * e; sl += (0 - sl) * e; }
    else if (s.punchSide === 'B') { la += (-1.6 - la) * e; ra += (-1.6 - ra) * e; }
    else { ra += (-1.6 - ra) * e; sr += (0 - sr) * e; }
    if (s.punchSide !== 'B') by = (s.punchSide === 'L' ? -0.4 : 0.4) * e;
  }
  h.armL.rotation.set(la, 0, sl);
  h.armR.rotation.set(ra, 0, -sr);
  h.legL.rotation.x = ll;
  h.legR.rotation.x = rl;
  h.body.rotation.set(bx, by, bz);
  h.body.position.y = (s.pose === 'down' ? 0.25 : 0.86) + bob;
  if (h.cape) h.cape.rotation.x = s.capeX ?? 0.15;
}
