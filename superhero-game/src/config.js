// City layout: an N x N grid of blocks separated by roads, centred on the origin.
export const CITY = { N: 8, BLOCK: 40, ROAD: 12 };
export const PITCH = CITY.BLOCK + CITY.ROAD;
export const CITY_W = CITY.N * CITY.BLOCK + (CITY.N + 1) * CITY.ROAD;
export const HALF = CITY_W / 2;
export const roadCenter = (i) => -HALF + CITY.ROAD / 2 + i * PITCH;
export const blockMin = (i) => roadCenter(i) + CITY.ROAD / 2;
export const blockCenter = (i) => blockMin(i) + CITY.BLOCK / 2;

export const GRAVITY = 28;
export const START = { x: 2, z: 10 };

export const PARK = { bi: 3, bj: 4 };

// Gang hideouts. Lower tiers are closer to the start.
export const ZONES = [
  { name: 'Rust Yard', bi: 5, bj: 3, tier: 1 },
  { name: 'Neon Alley', bi: 2, bj: 1, tier: 2 },
  { name: 'Dockside Den', bi: 6, bj: 6, tier: 3 },
  { name: 'Iron Fortress', bi: 0, bj: 7, tier: 4 },
];

export const POWERS = [
  { id: 'punch', level: 1, name: 'Punch', icon: '👊', key: 'LMB/J', desc: 'Basic combo' },
  { id: 'strength', level: 2, name: 'Super Strength', icon: '💪', key: 'E', desc: 'Smash buildings, lift & throw cars' },
  { id: 'fire', level: 3, name: 'Fireball', icon: '🔥', key: 'Q/RMB', desc: 'Hurl explosive fireballs' },
  { id: 'lightning', level: 4, name: 'Chain Lightning', icon: '⚡', key: 'R', desc: 'Lightning that jumps between enemies' },
  { id: 'flight', level: 5, name: 'Flight', icon: '🦸', key: 'F', desc: 'Take to the skies (or double-jump)' },
];

// Total XP required to reach level (index + 1).
export const XP_TABLE = [0, 100, 260, 500, 850, 1300, 1900, 2700, 3700, 5000];
