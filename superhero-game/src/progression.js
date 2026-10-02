import { XP_TABLE, POWERS } from './config.js';

export function xpFor(level) {
  if (level <= XP_TABLE.length) return XP_TABLE[level - 1];
  return XP_TABLE[XP_TABLE.length - 1] + (level - XP_TABLE.length) * 1500;
}

export class Progression {
  constructor(game) {
    this.game = game;
    this.level = 1;
    this.xp = 0;
  }

  get prevXP() { return xpFor(this.level); }
  get nextXP() { return xpFor(this.level + 1); }

  has(id) {
    const p = POWERS.find((p) => p.id === id);
    return !!p && this.level >= p.level;
  }

  get maxHP() { return 100 + (this.level - 1) * 30; }
  get damageMul() { return 1 + (this.level - 1) * 0.15; }
  get speedMul() { return 1 + Math.min(this.level - 1, 6) * 0.06; }
  get jumpMul() { return this.has('strength') ? 1.45 + (this.level - 2) * 0.05 : 1; }
  get climbMul() { return 1 + (this.level - 1) * 0.18; }

  addXP(n, label, pos) {
    n = Math.round(n);
    this.xp += n;
    if (pos) this.game.hud.float(`+${n} XP${label ? ' · ' + label : ''}`, pos, '#ffd84a');
    while (this.xp >= this.nextXP) this.levelUp();
  }

  levelUp() {
    this.level++;
    const g = this.game;
    g.player.hp = this.maxHP;
    const power = POWERS.find((p) => p.level === this.level);
    g.hud.levelUp(this.level, power);
    g.fx.levelUp(g.player.pos);
  }

  setLevel(level) {
    this.level = Math.max(1, level);
    this.xp = xpFor(this.level);
  }
}
