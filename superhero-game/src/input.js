// Unified input: keyboard + mouse, on-screen thumbstick/buttons for touch, and gamepads.
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyJ: 'punch', KeyQ: 'fire', KeyR: 'lightning', KeyF: 'fly', KeyE: 'interact',
  KeyC: 'descend', ControlLeft: 'descend',
};
// Standard gamepad mapping.
const PAD = { 0: 'jump', 2: 'punch', 1: 'interact', 3: 'fire', 5: 'lightning', 4: 'fly', 6: 'descend', 7: 'sprint', 10: 'sprint' };

const STICK_R = 55;
const MOUSE_SENS = 0.0024;
const TOUCH_SENS_X = 0.0065;
const TOUCH_SENS_Y = 0.005;

export class Input {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.held = new Map(); // action -> number of sources holding it
    this.down = new Set(); // actions pressed this frame
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.sprint = false;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookPtr = { id: null, x: 0, y: 0 };
    this.padPrev = {};
    this.touch = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
    if (this.touch) document.body.classList.add('touch');
    this.bindKeys();
    this.bindMouse();
    this.bindTouch();
  }

  press(a) {
    this.held.set(a, (this.held.get(a) || 0) + 1);
    this.down.add(a);
  }

  release(a) {
    const n = (this.held.get(a) || 0) - 1;
    if (n <= 0) this.held.delete(a);
    else this.held.set(a, n);
  }

  pressed(a) { return this.down.has(a); }
  isHeld(a) { return this.held.has(a); }

  bindKeys() {
    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!e.repeat) this.press(a);
    });
    addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.release(a);
    });
    addEventListener('blur', () => this.held.clear());
  }

  bindMouse() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (this.touch || !this.game.started) return;
      if (document.pointerLockElement !== c) {
        c.requestPointerLock?.();
        return;
      }
      if (e.button === 0) this.press('punch');
      if (e.button === 2) this.press('fire');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.held.has('punch')) this.release('punch');
      if (e.button === 2 && this.held.has('fire')) this.release('fire');
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // Browsers sometimes report a huge bogus delta right after pointer lock engages.
    let lockedAt = 0;
    document.addEventListener('pointerlockchange', () => { lockedAt = performance.now(); });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== c || performance.now() - lockedAt < 150) return;
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      this.look.dx += e.movementX * MOUSE_SENS;
      this.look.dy += e.movementY * MOUSE_SENS;
    });
  }

  bindTouch() {
    const layer = document.getElementById('touch');
    const base = document.getElementById('stick-base');
    const knob = document.getElementById('stick-knob');
    this.base = base;
    // Switch to touch UI the first time a finger touches the screen.
    addEventListener('touchstart', () => {
      if (!this.touch) {
        this.touch = true;
        document.body.classList.add('touch');
      }
    }, { passive: true });
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    for (const btn of layer.querySelectorAll('[data-act]')) {
      const act = btn.dataset.act;
      let id = null;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (id !== null) return;
        id = e.pointerId;
        btn.classList.add('active');
        this.press(act);
        try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      });
      const up = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        btn.classList.remove('active');
        this.release(act);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    }

    layer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.clientX < innerWidth * 0.45 && this.stick.id === null) {
        const s = this.stick;
        s.id = e.pointerId;
        s.ox = e.clientX;
        s.oy = e.clientY;
        s.x = s.y = 0;
        base.style.left = `${s.ox}px`;
        base.style.top = `${s.oy}px`;
        base.classList.add('active');
        knob.style.transform = 'translate(0px, 0px)';
      } else if (this.lookPtr.id === null) {
        this.lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY };
      } else return;
      try { layer.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    layer.addEventListener('pointermove', (e) => {
      const s = this.stick;
      if (e.pointerId === s.id) {
        let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
        const len = Math.hypot(dx, dy);
        if (len > STICK_R) {
          // Let the stick base follow the thumb so you never "run out" of stick.
          const over = len - STICK_R;
          s.ox += (dx / len) * over;
          s.oy += (dy / len) * over;
          base.style.left = `${s.ox}px`;
          base.style.top = `${s.oy}px`;
          dx = e.clientX - s.ox;
          dy = e.clientY - s.oy;
        }
        s.x = dx / STICK_R;
        s.y = -dy / STICK_R;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (e.pointerId === this.lookPtr.id) {
        this.look.dx += (e.clientX - this.lookPtr.x) * TOUCH_SENS_X;
        this.look.dy += (e.clientY - this.lookPtr.y) * TOUCH_SENS_Y;
        this.lookPtr.x = e.clientX;
        this.lookPtr.y = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === this.stick.id) {
        this.stick.id = null;
        this.stick.x = this.stick.y = 0;
        base.classList.remove('active');
        base.style.left = '';
        base.style.top = '';
        knob.style.transform = 'translate(0px, 0px)';
      } else if (e.pointerId === this.lookPtr.id) {
        this.lookPtr.id = null;
      }
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
  }

  update(dt) {
    let x = 0, y = 0;
    if (this.held.has('left')) x -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('up')) y += 1;
    if (this.held.has('down')) y -= 1;
    let sprint = this.held.has('sprint');
    if (x || y) {
      const l = Math.hypot(x, y);
      x /= l;
      y /= l;
    } else if (this.stick.id !== null) {
      const m = Math.hypot(this.stick.x, this.stick.y);
      if (m > 0.12) {
        const s = Math.min(1, (m - 0.12) / 0.83) / m;
        x = this.stick.x * s;
        y = this.stick.y * s;
        if (m > 0.97) sprint = true;
      }
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
      if (!x && !y && (lx || ly)) { x = lx; y = -ly; }
      this.look.dx += dz(gp.axes[2] || 0) * 3 * dt;
      this.look.dy += dz(gp.axes[3] || 0) * 2.2 * dt;
      for (const [i, act] of Object.entries(PAD)) {
        const b = gp.buttons[i];
        const now = !!b && (b.pressed || b.value > 0.5);
        const was = !!this.padPrev[i];
        if (now && !was) this.press(act);
        if (!now && was) this.release(act);
        this.padPrev[i] = now;
      }
    }
    this.move.x = x;
    this.move.y = y;
    this.sprint = sprint;
  }

  endFrame() {
    this.down.clear();
    this.look.dx = 0;
    this.look.dy = 0;
  }
}
