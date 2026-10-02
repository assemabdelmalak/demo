import * as THREE from 'three';
import { POWERS, CITY, CITY_W, HALF, blockMin, ZONES, PARK } from './config.js';

const V = new THREE.Vector3();
const MAP_EXT = CITY_W + 60;

function setText(el, v) {
  if (el._v !== v) { el._v = v; el.textContent = v; }
}
function setStyle(el, k, v) {
  const key = '_s' + k;
  if (el[key] !== v) { el[key] = v; el.style[k] = v; }
}

export class HUD {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = {
      lvl: $('lvl-num'), hp: $('hp-fill'), hpText: $('hp-text'), xp: $('xp-fill'), xpText: $('xp-text'),
      toast: $('toast'), toastTitle: $('toast-title'), toastSub: $('toast-sub'), notice: $('notice'),
      prompt: $('prompt'), speech: $('speech'), floaters: $('floaters'), flash: $('damage-flash'),
      objective: $('objective'), powers: $('powers'), mini: $('minimap'),
    };
    this.btn = {
      fire: $('btn-fire'), lightning: $('btn-lightning'), flight: $('btn-fly'),
      interact: $('btn-interact'), descend: $('btn-descend'), jump: $('btn-jump'),
    };
    this.mctx = this.el.mini.getContext('2d');
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = this.mapCanvas.height = 600;
    this.toastQ = [];
    this.toastT = 0;
    this.noticeT = 0;
    this.floats = [];
    this.speechPed = null;
    this.speechT = 0;
    this.flashV = 0;
    this.objT = 0;
    this.powerEls = {};
    for (const p of POWERS) {
      const d = document.createElement('div');
      d.className = 'power';
      d.title = `${p.name} — ${p.desc}`;
      d.innerHTML = `<div class="ico">${p.icon}</div><div class="key">${p.key}</div><div class="cd"></div><div class="lock">LV ${p.level}</div>`;
      this.el.powers.appendChild(d);
      this.powerEls[p.id] = { el: d, cd: d.querySelector('.cd') };
    }
  }

  // ---- Messages ----------------------------------------------------------

  toast(title, sub, dur = 2.8) {
    this.toastQ.push({ title, sub, dur });
  }

  notice(text, dur = 2) {
    setText(this.el.notice, text);
    this.el.notice.classList.add('show');
    this.noticeT = dur;
  }

  locked(id) {
    const p = POWERS.find((p) => p.id === id);
    if (p) this.notice(`🔒 ${p.name} unlocks at Level ${p.level}`);
  }

  levelUp(level, power) {
    if (power) {
      this.toast(`LEVEL ${level}!`, `New power: ${power.icon} ${power.name} — ${power.desc}`, 4);
      const pe = this.powerEls[power.id];
      if (pe) pe.el.classList.add('new');
      const b = this.btn[power.id === 'flight' ? 'flight' : power.id];
      if (b) b.classList.add('new');
    } else {
      this.toast(`LEVEL ${level}!`, 'Health, strength and speed increased', 3);
    }
  }

  float(text, pos, color = '#ffd84a') {
    if (this.floats.length > 14) {
      const old = this.floats.shift();
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.color = color;
    this.el.floaters.appendChild(el);
    this.floats.push({ el, pos: pos.clone(), t: 0 });
  }

  speech(ped, text, dur) {
    this.speechPed = ped;
    this.speechT = dur;
    setText(this.el.speech, text);
  }

  hurt() { this.flashV = 1; }

  project(pos, out) {
    V.copy(pos).project(this.game.camera);
    out.x = (V.x * 0.5 + 0.5) * innerWidth;
    out.y = (-V.y * 0.5 + 0.5) * innerHeight;
    out.visible = V.z < 1;
    return out;
  }

  // ---- Per frame -----------------------------------------------------------

  update(dt) {
    const g = this.game, pl = g.player, pr = g.prog, el = this.el;
    setText(el.lvl, String(pr.level));
    setStyle(el.hp, 'width', `${Math.max(0, (pl.hp / pl.maxHp) * 100).toFixed(1)}%`);
    setText(el.hpText, `${Math.ceil(pl.hp)} / ${pl.maxHp}`);
    const xpPct = ((pr.xp - pr.prevXP) / (pr.nextXP - pr.prevXP)) * 100;
    setStyle(el.xp, 'width', `${Math.min(100, xpPct).toFixed(1)}%`);
    setText(el.xpText, `${pr.xp - pr.prevXP} / ${pr.nextXP - pr.prevXP} XP`);

    // Ability bar + touch buttons.
    const cds = { punch: pl.punchCd / 0.42, fire: pl.fireCd / 0.45, lightning: pl.boltCd / 1.1, strength: 0, flight: 0 };
    for (const p of POWERS) {
      const pe = this.powerEls[p.id];
      const unlocked = pr.level >= p.level;
      pe.el.classList.toggle('locked', !unlocked);
      pe.el.classList.toggle('on', p.id === 'flight' && pl.state === 'fly');
      setStyle(pe.cd, 'height', `${Math.max(0, Math.min(1, cds[p.id] || 0)) * 100}%`);
    }
    setStyle(this.btn.fire, 'display', pr.has('fire') ? '' : 'none');
    setStyle(this.btn.lightning, 'display', pr.has('lightning') ? '' : 'none');
    setStyle(this.btn.flight, 'display', pr.has('flight') ? '' : 'none');
    this.btn.flight.classList.toggle('on', pl.state === 'fly');
    setStyle(this.btn.descend, 'display', pl.state === 'fly' || pl.state === 'climb' ? '' : 'none');
    setText(this.btn.jump, pl.state === 'fly' ? 'UP' : 'JUMP');
    const label = g.started ? pl.contextLabel() : null;
    setStyle(this.btn.interact, 'display', label ? '' : 'none');
    if (label) setText(this.btn.interact, label.toUpperCase());
    if (label && !g.input.touch) {
      setStyle(el.prompt, 'display', 'block');
      if (el.prompt._label !== label) {
        el.prompt._label = label;
        el.prompt.innerHTML = `<kbd>E</kbd>${label}`;
      }
    } else setStyle(el.prompt, 'display', 'none');

    // Toasts.
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) el.toast.classList.remove('show');
    } else if (this.toastQ.length && !el.toast.classList.contains('show')) {
      const t = this.toastQ.shift();
      setText(el.toastTitle, t.title);
      setText(el.toastSub, t.sub || '');
      el.toast.classList.add('show');
      this.toastT = t.dur;
    }
    if (this.noticeT > 0) {
      this.noticeT -= dt;
      if (this.noticeT <= 0) el.notice.classList.remove('show');
    }

    // Speech bubble.
    const sp = { x: 0, y: 0, visible: false };
    if (this.speechT > 0 && this.speechPed) {
      this.speechT -= dt;
      const p = this.speechPed.pos;
      this.project(V.set(p.x, p.y + 2.3, p.z), sp);
      const show = sp.visible && this.speechT > 0 && this.speechPed.state === 'talk';
      setStyle(el.speech, 'display', show ? 'block' : 'none');
      if (show) el.speech.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%)`;
    } else setStyle(el.speech, 'display', 'none');

    // Floating text.
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      f.pos.y += dt * 1.6;
      if (f.t > 1.4) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      this.project(f.pos, sp);
      f.el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%)`;
      f.el.style.opacity = sp.visible ? String(Math.min(1, (1.4 - f.t) * 2)) : '0';
    }

    this.flashV = Math.max(0, this.flashV - dt * 2.5);
    setStyle(el.flash, 'opacity', this.flashV.toFixed(2));

    this.objT -= dt;
    if (this.objT <= 0) {
      this.objT = 0.5;
      const z = g.enemies.zones.filter((z) => !z.liberated).sort((a, b) => a.tier - b.tier)[0];
      if (z) {
        const d = Math.round(Math.hypot(z.center.x - pl.pos.x, z.center.z - pl.pos.z));
        setText(el.objective, `🎯 Liberate ${z.name} · Threat LV${z.tier} · ${d}m`);
      } else setText(el.objective, '🏙️ The city is safe… for now. Explore & smash!');
    }

    this.drawMinimap();
  }

  drawStaticMap() {
    const c = this.mapCanvas.getContext('2d');
    const S = this.mapCanvas.width, k = S / MAP_EXT, o = MAP_EXT / 2;
    const X = (x) => (x + o) * k;
    c.fillStyle = '#5d7a4a';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#34383d';
    c.fillRect(X(-HALF), X(-HALF), CITY_W * k, CITY_W * k);
    for (let bi = 0; bi < CITY.N; bi++) {
      for (let bj = 0; bj < CITY.N; bj++) {
        const zone = ZONES.some((z) => z.bi === bi && z.bj === bj);
        const park = PARK.bi === bi && PARK.bj === bj;
        c.fillStyle = zone ? '#5b4038' : park ? '#4f8f3e' : '#8a8984';
        c.fillRect(X(blockMin(bi)), X(blockMin(bj)), CITY.BLOCK * k, CITY.BLOCK * k);
      }
    }
    c.fillStyle = '#d9d4c9';
    for (const b of this.game.world.buildings) {
      if (!b.solid) continue;
      c.fillRect(X(b.minX), X(b.minZ), (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
    }
    this.game.world.mapDirty = false;
  }

  drawMinimap() {
    const g = this.game, ctx = this.mctx, W = this.el.mini.width;
    if (g.world.mapDirty) this.drawStaticMap();
    const p = g.player.pos, yaw = g.cam.yaw, k = (W / 150) * 0.6;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#5d7a4a';
    ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    ctx.rotate(yaw);
    ctx.translate(-p.x * k, -p.z * k);
    ctx.drawImage(this.mapCanvas, (-MAP_EXT / 2) * k, (-MAP_EXT / 2) * k, MAP_EXT * k, MAP_EXT * k);
    for (const z of g.enemies.zones) {
      ctx.beginPath();
      ctx.arc(z.center.x * k, z.center.z * k, z.radius * k, 0, Math.PI * 2);
      ctx.fillStyle = z.liberated ? 'rgba(61,220,132,0.35)' : 'rgba(255,59,59,0.35)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = z.liberated ? '#3ddc84' : '#ff3b3b';
      ctx.stroke();
    }
    ctx.fillStyle = '#ff2d2d';
    for (const e of g.enemies.list) {
      if (e.dead) continue;
      const s = e.boss ? 9 : 5;
      ctx.fillRect(e.pos.x * k - s / 2, e.pos.z * k - s / 2, s, s);
    }
    ctx.save();
    ctx.translate(p.x * k, p.z * k);
    ctx.rotate(Math.PI - g.player.facing);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // Edge markers pointing to off-map hideouts.
    const cy = Math.cos(yaw), sy = Math.sin(yaw), R = W / 2 - 10;
    for (const z of g.enemies.zones) {
      if (z.liberated) continue;
      const rx = (z.center.x - p.x) * k, rz = (z.center.z - p.z) * k;
      let sx = rx * cy - rz * sy, sY = rx * sy + rz * cy;
      const len = Math.hypot(sx, sY);
      if (len < R) continue;
      sx = (sx / len) * R;
      sY = (sY / len) * R;
      ctx.beginPath();
      ctx.arc(W / 2 + sx, W / 2 + sY, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3b3b';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(z.tier), W / 2 + sx, W / 2 + sY + 1);
    }
  }
}
