import {
  type AllergenCode,
  type AllergenStatus,
  type DietTag,
  type ItemTag,
  type LocalizedText,
  type MemberRole,
} from '@radd/shared';

/**
 * The demo restaurant "Beit Tayta", exactly as docs/SEED_DATA.md describes it. The allergen data
 * is invented for testing, not real-world guidance, and some dishes are deliberately left
 * unconfirmed: later safety tests and AI evals depend on those statuses, so change them only
 * together with SEED_DATA.md. Arabic copy the spec does not give (option and ingredient names,
 * FAQ answers) was written for the seed and is on the owner's native-speaker review list.
 */

// ── Organisation and people ─────────────────────────────────────────────────────────────────

export const SEED_ORGANIZATION = {
  name: 'Beit Tayta SAL',
  slug: 'beit-tayta',
  plan: 'pro',
} as const;

export interface SeedUser {
  key: string;
  name: string;
  email: string;
  password: string;
  /** Absent for the super admin, who belongs to no restaurant. */
  role?: MemberRole;
  /** Written straight into `member.pin_hash` (SEED_DATA "Staff … PIN 1234"). */
  pin?: string;
}

/** The four restaurant accounts (SEED_DATA "Organization and users"). */
export const SEED_MEMBERS: readonly (SeedUser & { role: MemberRole })[] = [
  {
    key: 'owner',
    name: 'Mona Haddad',
    email: 'owner@beit-tayta.test',
    password: 'DemoOwner!2026',
    role: 'owner',
  },
  {
    key: 'manager',
    name: 'Ziad Khoury',
    email: 'manager@beit-tayta.test',
    password: 'DemoManager!2026',
    role: 'manager',
  },
  {
    key: 'staff',
    name: 'Rita Nassar',
    email: 'staff@beit-tayta.test',
    password: 'DemoStaff!2026',
    role: 'staff',
    pin: '1234',
  },
  {
    key: 'kitchen',
    name: 'Hassan Karam',
    email: 'kitchen@beit-tayta.test',
    password: 'DemoKitchen!2026',
    role: 'kitchen',
  },
];

/**
 * The local super admin (SEED_DATA: "local only", allowlisted in `SUPER_ADMIN_EMAILS`). SEED_DATA
 * gives no password; this one follows the pattern of the others (ADR-033). Only seeded when
 * APP_ENV is `local` or `test`.
 */
export const SEED_SUPER_ADMIN: SeedUser = {
  key: 'super-admin',
  name: 'Radd Admin',
  email: 'admin@radd.test',
  password: 'DemoAdmin!2026',
};

// ── Restaurant settings ─────────────────────────────────────────────────────────────────────

export const SEED_RESTAURANT = {
  slug: 'beit-tayta',
  name: { ar: 'بيت تيتا', en: 'Beit Tayta' },
  city: 'Mar Mikhael, Beirut',
  defaultLocale: 'en',
  enabledLocales: ['en', 'ar', 'fr'],
  baseCurrency: 'USD',
  showSecondaryCurrency: true,
  lbpRate: 89_500,
  lbpRoundingStep: 5_000,
  lbpRoundingMode: 'nearest',
  taxRateBps: 1_100,
  taxInclusive: true,
  taxAppliesToService: true,
  serviceChargeBps: 1_000,
  serviceChargeLabel: { ar: 'خدمة', en: 'Service' },
  orderingMode: 'diner_with_approval',
  groupOrderingEnabled: true,
  aiAssistantEnabled: true,
  aiSettings: {
    assistantName: { ar: 'مساعِدة تيتا', en: "Tayta's helper" },
    tone: 'friendly',
    upsell: true,
    showDisclaimerAlways: true,
  },
  // Daily 12:00–24:00; a close before the open means past midnight (DATA_MODEL `opening_hours`).
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '12:00', close: '00:00' })),
  theme: { preset: 'zaatar' },
} as const;

export const SEED_FAQ: readonly { key: string; question: LocalizedText; answer: LocalizedText }[] =
  [
    {
      key: 'parking',
      question: { en: 'Parking?', ar: 'هل يوجد موقف للسيارات؟' },
      answer: {
        en: 'Valet available after 7 pm ($5).',
        ar: 'خدمة صفّ السيارات متوفّرة بعد الساعة 7 مساءً (5$).',
      },
    },
    {
      key: 'wifi',
      question: { en: 'Wi-Fi?', ar: 'هل يوجد واي فاي؟' },
      answer: { en: 'Ask your server for the password.', ar: 'اطلب كلمة السر من النادل.' },
    },
    {
      key: 'reservations',
      question: { en: 'Reservations?', ar: 'هل يمكن الحجز؟' },
      answer: {
        en: 'Message us on WhatsApp +961 70 000 000.',
        ar: 'راسلونا على واتساب ‎+961 70 000 000.',
      },
    },
    {
      key: 'pets',
      question: { en: 'Pets?', ar: 'هل يُسمح بالحيوانات الأليفة؟' },
      answer: { en: 'Welcome on the terrace.', ar: 'أهلاً بها على التراس.' },
    },
  ];

export const SEED_AREAS = [
  {
    key: 'indoor',
    name: { en: 'Indoor', ar: 'الصالة' },
    tables: [1, 2, 3, 4, 5, 6, 7, 8],
    seats: 4,
  },
  { key: 'terrace', name: { en: 'Terrace', ar: 'التراس' }, tables: [9, 10, 11, 12], seats: 6 },
] as const;

export type StationKey = 'cold' | 'grill' | 'bakery' | 'bar';

export const SEED_STATIONS: readonly { key: StationKey; name: LocalizedText }[] = [
  { key: 'cold', name: { en: 'Cold', ar: 'المطبخ البارد' } },
  { key: 'grill', name: { en: 'Grill', ar: 'المشاوي' } },
  { key: 'bakery', name: { en: 'Bakery', ar: 'الفرن' } },
  { key: 'bar', name: { en: 'Bar', ar: 'البار' } },
];

// ── Modifier groups (SEED_DATA "Modifier groups") ───────────────────────────────────────────

export type GroupKey = 'G1' | 'G2' | 'G3' | 'G4' | 'G5';

export interface SeedOption {
  key: string;
  name: LocalizedText;
  priceDeltaMinor: number;
  isDefault?: boolean;
  addsAllergens: AllergenCode[];
  /**
   * Whether the owner confirmed the option's allergen impact. SEED_DATA states it for G1, G3 and
   * G4; for G2 and G5 it says nothing, and an impact nobody confirmed is not confirmed (ADR-033).
   */
  impactConfirmed: boolean;
}

export interface SeedGroup {
  key: GroupKey;
  name: LocalizedText;
  minSelect: number;
  maxSelect: number;
  options: SeedOption[];
}

export const SEED_GROUPS: readonly SeedGroup[] = [
  {
    key: 'G1',
    name: { en: 'Add protein', ar: 'أضف بروتين' },
    minSelect: 0,
    maxSelect: 1,
    options: [
      {
        key: 'chicken',
        name: { en: 'Chicken', ar: 'دجاج' },
        priceDeltaMinor: 300,
        addsAllergens: [],
        impactConfirmed: true,
      },
      {
        key: 'halloumi',
        name: { en: 'Halloumi', ar: 'حلّوم' },
        priceDeltaMinor: 250,
        addsAllergens: ['milk'],
        impactConfirmed: true,
      },
    ],
  },
  {
    key: 'G2',
    name: { en: 'Side', ar: 'الطبق الجانبي' },
    minSelect: 1,
    maxSelect: 1,
    options: [
      {
        key: 'fries',
        name: { en: 'Fries', ar: 'بطاطا مقلية' },
        priceDeltaMinor: 0,
        isDefault: true,
        addsAllergens: [],
        impactConfirmed: false,
      },
      {
        key: 'salad',
        name: { en: 'Salad', ar: 'سلطة' },
        priceDeltaMinor: 0,
        addsAllergens: [],
        impactConfirmed: false,
      },
    ],
  },
  {
    key: 'G3',
    name: { en: 'Extra toum', ar: 'ثوم إضافي' },
    minSelect: 0,
    maxSelect: 1,
    options: [
      {
        key: 'extra-garlic-sauce',
        name: { en: 'Extra garlic sauce', ar: 'صلصة ثوم إضافية' },
        priceDeltaMinor: 100,
        addsAllergens: ['eggs'],
        // SEED_DATA: "adds eggs, NOT confirmed" (chat eval "Extra toum — does it have egg?").
        impactConfirmed: false,
      },
    ],
  },
  {
    key: 'G4',
    name: { en: 'Bread', ar: 'خبز' },
    minSelect: 0,
    maxSelect: 1,
    options: [
      {
        key: 'extra-bread-basket',
        name: { en: 'Extra bread basket', ar: 'سلّة خبز إضافية' },
        priceDeltaMinor: 100,
        addsAllergens: ['gluten'],
        impactConfirmed: true,
      },
    ],
  },
  {
    key: 'G5',
    name: { en: 'Sugar', ar: 'السكر' },
    minSelect: 1,
    maxSelect: 1,
    options: [
      {
        key: 'no-sugar',
        name: { en: 'No sugar', ar: 'سادة' },
        priceDeltaMinor: 0,
        addsAllergens: [],
        impactConfirmed: false,
      },
      {
        key: 'medium',
        name: { en: 'Medium', ar: 'وسط' },
        priceDeltaMinor: 0,
        isDefault: true,
        addsAllergens: [],
        impactConfirmed: false,
      },
      {
        key: 'sweet',
        name: { en: 'Sweet', ar: 'حلوة' },
        priceDeltaMinor: 0,
        addsAllergens: [],
        impactConfirmed: false,
      },
    ],
  },
];

// ── Categories and dishes (SEED_DATA "Dishes") ──────────────────────────────────────────────

export type CategoryKey =
  'cold-mezze' | 'hot-mezze' | 'salads' | 'grills' | 'manakish' | 'desserts' | 'drinks';

/** Each category's dishes go to one station; SEED_DATA names the stations, not the routing. */
export const SEED_CATEGORIES: readonly {
  key: CategoryKey;
  name: LocalizedText;
  station: StationKey;
}[] = [
  { key: 'cold-mezze', name: { en: 'Cold mezze', ar: 'مازة باردة' }, station: 'cold' },
  { key: 'hot-mezze', name: { en: 'Hot mezze', ar: 'مازة سخنة' }, station: 'grill' },
  { key: 'salads', name: { en: 'Salads', ar: 'سلطات' }, station: 'cold' },
  { key: 'grills', name: { en: 'Grills', ar: 'مشاوي' }, station: 'grill' },
  { key: 'manakish', name: { en: 'Manakish', ar: 'مناقيش' }, station: 'bakery' },
  { key: 'desserts', name: { en: 'Desserts', ar: 'حلويات' }, station: 'bakery' },
  { key: 'drinks', name: { en: 'Drinks', ar: 'مشروبات' }, station: 'bar' },
];

/** English → Arabic for every ingredient the dishes list. */
const INGREDIENT_AR = {
  chickpeas: 'حمّص حب',
  tahini: 'طحينة',
  lemon: 'حامض',
  garlic: 'ثوم',
  'olive oil': 'زيت زيتون',
  'grilled eggplant': 'باذنجان مشوي',
  'strained yogurt': 'لبنة',
  mint: 'نعناع',
  'vine leaves': 'ورق عنب',
  rice: 'رز',
  tomato: 'بندورة',
  parsley: 'بقدونس',
  'red pepper': 'فليفلة حمراء',
  walnuts: 'جوز',
  breadcrumbs: 'بقسماط',
  'pomegranate molasses': 'دبس رمّان',
  potatoes: 'بطاطا',
  coriander: 'كزبرة',
  chilli: 'فلفل حار',
  bulgur: 'برغل',
  'minced beef': 'لحم بقر مفروم',
  onion: 'بصل',
  'pine nuts': 'صنوبر',
  'fava beans': 'فول',
  herbs: 'أعشاب',
  'tahini sauce': 'طرطور',
  'spiced beef sausage': 'سجق لحم بقر متبّل',
  halloumi: 'حلّوم',
  yogurt: 'لبن',
  'fried bread': 'خبز مقلي',
  butter: 'زبدة',
  lettuce: 'خس',
  cucumber: 'خيار',
  radish: 'فجل',
  purslane: 'بقلة',
  sumac: 'سمّاق',
  chicken: 'دجاج',
  'yogurt marinade': 'تتبيلة لبن',
  toum: 'توم',
  fries: 'بطاطا مقلية',
  pickles: 'كبيس',
  'minced beef & lamb': 'لحم بقر وغنم مفروم',
  'grilled tomato': 'بندورة مشوية',
  taouk: 'طاووق',
  kafta: 'كفتة',
  'lamb cubes': 'لحم غنم مكعّبات',
  'white fish': 'سمك أبيض',
  dough: 'عجين',
  zaatar: 'زعتر',
  sesame: 'سمسم',
  'akkawi cheese': 'جبنة عكّاوي',
  'minced meat': 'لحمة مفرومة',
  semolina: 'سميد',
  "ka'ak bread": 'كعك',
  syrup: 'قطر',
  pistachio: 'فستق حلبي',
  milk: 'حليب',
  starch: 'نشاء',
  'orange blossom': 'ماء الزهر',
  pancake: 'عجينة قطايف',
  'ashta cream': 'قشطة',
  sugar: 'سكر',
  'date & grape molasses': 'دبس تمر وعنب',
  'rose water': 'ماء الورد',
  raisins: 'زبيب',
  water: 'ماء',
  salt: 'ملح',
  'anise spirit': 'عرق بالينسون',
  coffee: 'قهوة',
  cardamom: 'هال',
} as const;

export type IngredientName = keyof typeof INGREDIENT_AR;

export function ingredientName(en: IngredientName): LocalizedText {
  return { en, ar: INGREDIENT_AR[en] };
}

export interface SeedDish {
  key: string;
  category: CategoryKey;
  name: LocalizedText;
  priceMinor: number;
  /** Portions; when present the diner must pick one and `priceMinor` is ignored (DATA_MODEL). */
  variants?: { key: string; name: LocalizedText; priceMinor: number; isDefault: boolean }[];
  dietTags: DietTag[];
  itemTags: ItemTag[];
  spiceLevel?: number;
  ingredients: { name: IngredientName; removable?: boolean }[];
  groups: GroupKey[];
  /**
   * Statuses SEED_DATA lists. Every other allergen is `free` on a confirmed dish and `unknown` on
   * an unconfirmed one ("all allergens not listed are free when the dish is confirmed").
   */
  allergens: Partial<Record<AllergenCode, AllergenStatus>>;
  /** Owner notes shown to diners next to one allergen. */
  allergenNotes?: Partial<Record<AllergenCode, LocalizedText>>;
  /** Whether the owner pressed "Confirm allergens" (all 14 rows or none, ALLERGEN_SAFETY §3). */
  confirmed: boolean;
}

const i = (name: IngredientName, removable = false) => ({ name, removable });

export const SEED_DISHES: readonly SeedDish[] = [
  // Cold mezze
  {
    key: 'hummus',
    category: 'cold-mezze',
    name: { en: 'Hummus', ar: 'حمّص' },
    priceMinor: 500,
    dietTags: ['vegan'],
    itemTags: ['popular'],
    ingredients: [i('chickpeas'), i('tahini'), i('lemon'), i('garlic'), i('olive oil')],
    groups: ['G4'],
    allergens: { sesame: 'contains' },
    confirmed: true,
  },
  {
    key: 'moutabal',
    category: 'cold-mezze',
    name: { en: 'Moutabal', ar: 'متبّل' },
    priceMinor: 550,
    dietTags: ['vegan'],
    itemTags: [],
    ingredients: [i('grilled eggplant'), i('tahini'), i('lemon'), i('garlic')],
    groups: ['G4'],
    allergens: { sesame: 'contains' },
    confirmed: true,
  },
  {
    key: 'labneh',
    category: 'cold-mezze',
    name: { en: 'Labneh with garlic', ar: 'لبنة بالثوم' },
    priceMinor: 450,
    dietTags: ['vegetarian'],
    itemTags: [],
    ingredients: [i('strained yogurt'), i('garlic'), i('mint'), i('olive oil')],
    groups: ['G4'],
    allergens: { milk: 'contains' },
    confirmed: true,
  },
  {
    key: 'vine-leaves',
    category: 'cold-mezze',
    name: { en: 'Vine leaves', ar: 'ورق عنب' },
    priceMinor: 600,
    dietTags: ['vegan'],
    itemTags: [],
    ingredients: [i('vine leaves'), i('rice'), i('tomato'), i('parsley'), i('lemon')],
    groups: [],
    allergens: {},
    confirmed: false,
  },
  {
    key: 'muhammara',
    category: 'cold-mezze',
    name: { en: 'Muhammara', ar: 'محمّرة' },
    priceMinor: 600,
    dietTags: ['vegan'],
    itemTags: ['chef_pick'],
    spiceLevel: 1,
    ingredients: [i('red pepper'), i('walnuts'), i('breadcrumbs'), i('pomegranate molasses')],
    groups: ['G4'],
    allergens: { tree_nuts: 'contains', gluten: 'contains', sesame: 'may_contain' },
    confirmed: true,
  },
  // Hot mezze
  {
    key: 'batata-harra',
    category: 'hot-mezze',
    name: { en: 'Batata harra', ar: 'بطاطا حرّة' },
    priceMinor: 500,
    dietTags: ['vegan'],
    itemTags: [],
    spiceLevel: 2,
    ingredients: [i('potatoes'), i('garlic'), i('coriander'), i('chilli')],
    groups: [],
    allergens: { gluten: 'may_contain' },
    allergenNotes: { gluten: { en: 'Shared fryer', ar: 'مقلاة مشتركة' } },
    confirmed: true,
  },
  {
    key: 'fried-kibbeh',
    category: 'hot-mezze',
    name: { en: 'Fried kibbeh (4)', ar: 'كبّة مقلية' },
    priceMinor: 700,
    dietTags: [],
    itemTags: ['popular'],
    ingredients: [i('bulgur'), i('minced beef'), i('onion'), i('pine nuts')],
    groups: [],
    allergens: { gluten: 'contains', tree_nuts: 'contains' },
    confirmed: true,
  },
  {
    key: 'falafel',
    category: 'hot-mezze',
    name: { en: 'Falafel (6)', ar: 'فلافل' },
    priceMinor: 550,
    dietTags: ['vegan'],
    itemTags: [],
    ingredients: [i('chickpeas'), i('fava beans'), i('herbs'), i('tahini sauce')],
    groups: [],
    allergens: { sesame: 'contains', gluten: 'may_contain' },
    confirmed: true,
  },
  {
    key: 'sujuk',
    category: 'hot-mezze',
    name: { en: 'Sujuk', ar: 'سجق' },
    priceMinor: 800,
    dietTags: [],
    itemTags: [],
    spiceLevel: 2,
    ingredients: [i('spiced beef sausage'), i('tomato'), i('garlic')],
    groups: [],
    allergens: {},
    confirmed: false,
  },
  {
    key: 'grilled-halloumi',
    category: 'hot-mezze',
    name: { en: 'Grilled halloumi', ar: 'حلّوم مشوي' },
    priceMinor: 650,
    dietTags: ['vegetarian'],
    itemTags: [],
    ingredients: [i('halloumi'), i('tomato'), i('mint')],
    groups: [],
    allergens: { milk: 'contains' },
    confirmed: true,
  },
  {
    key: 'fatteh-hummus',
    category: 'hot-mezze',
    name: { en: 'Fatteh hummus', ar: 'فتّة حمّص' },
    priceMinor: 700,
    dietTags: ['vegetarian'],
    itemTags: ['signature'],
    ingredients: [
      i('chickpeas'),
      i('yogurt'),
      i('tahini'),
      i('fried bread'),
      i('pine nuts'),
      i('butter'),
    ],
    groups: [],
    allergens: { gluten: 'contains', milk: 'contains', tree_nuts: 'contains', sesame: 'contains' },
    confirmed: true,
  },
  // Salads
  {
    key: 'fattoush',
    category: 'salads',
    name: { en: 'Fattoush', ar: 'فتّوش' },
    priceMinor: 650,
    dietTags: ['vegan'],
    itemTags: ['popular'],
    ingredients: [
      i('lettuce'),
      i('tomato'),
      i('cucumber'),
      i('radish'),
      i('purslane'),
      i('sumac'),
      // Removable (chat eval: "fattoush without bread" may be proposed, never as gluten-free).
      i('fried bread', true),
      i('pomegranate molasses'),
    ],
    groups: ['G1'],
    allergens: { gluten: 'contains' },
    confirmed: true,
  },
  {
    key: 'tabbouleh',
    category: 'salads',
    name: { en: 'Tabbouleh', ar: 'تبّولة' },
    priceMinor: 650,
    dietTags: ['vegan'],
    itemTags: [],
    ingredients: [i('parsley'), i('bulgur'), i('tomato'), i('onion'), i('lemon'), i('olive oil')],
    groups: ['G1'],
    allergens: { gluten: 'contains' },
    confirmed: true,
  },
  // Grills
  {
    key: 'shish-taouk',
    category: 'grills',
    name: { en: 'Shish taouk plate', ar: 'صحن شيش طاووق' },
    priceMinor: 1200,
    dietTags: [],
    itemTags: ['popular'],
    ingredients: [i('chicken'), i('yogurt marinade'), i('toum'), i('fries'), i('pickles')],
    groups: ['G2', 'G3'],
    // Statuses set but NOT confirmed: diners see "Not confirmed — ask staff" for every allergen.
    allergens: { milk: 'contains', eggs: 'unknown' },
    confirmed: false,
  },
  {
    key: 'kafta',
    category: 'grills',
    name: { en: 'Kafta plate', ar: 'صحن كفتة' },
    priceMinor: 1300,
    dietTags: [],
    itemTags: [],
    ingredients: [i('minced beef & lamb'), i('parsley'), i('onion'), i('grilled tomato')],
    groups: ['G2'],
    // `unknown` chosen explicitly, then confirmed: diners still see "Not confirmed" for mustard.
    allergens: { mustard: 'unknown' },
    confirmed: true,
  },
  {
    key: 'mixed-grill',
    category: 'grills',
    name: { en: 'Mixed grill', ar: 'مشاوي مشكّلة' },
    priceMinor: 1800,
    variants: [
      {
        key: 'for-one',
        name: { en: 'For one', ar: 'لشخص واحد' },
        priceMinor: 1800,
        isDefault: true,
      },
      { key: 'for-two', name: { en: 'For two', ar: 'لشخصين' }, priceMinor: 3400, isDefault: false },
    ],
    dietTags: [],
    itemTags: ['signature'],
    ingredients: [i('taouk'), i('kafta'), i('lamb cubes'), i('fries'), i('toum')],
    groups: ['G2', 'G3'],
    allergens: { milk: 'may_contain' },
    confirmed: true,
  },
  {
    key: 'spicy-fish',
    category: 'grills',
    name: { en: 'Spicy fish', ar: 'سمكة حرّة' },
    priceMinor: 2200,
    dietTags: [],
    itemTags: ['chef_pick'],
    spiceLevel: 2,
    ingredients: [i('white fish'), i('tahini'), i('chilli'), i('coriander'), i('pine nuts')],
    groups: [],
    allergens: { fish: 'contains', sesame: 'contains', tree_nuts: 'contains' },
    confirmed: true,
  },
  // Manakish
  {
    key: 'zaatar-manoushe',
    category: 'manakish',
    name: { en: 'Zaatar manoushe', ar: 'منقوشة زعتر' },
    priceMinor: 250,
    dietTags: ['vegan'],
    itemTags: [],
    ingredients: [i('dough'), i('zaatar'), i('sesame'), i('olive oil')],
    groups: [],
    allergens: { gluten: 'contains', sesame: 'contains' },
    confirmed: true,
  },
  {
    key: 'cheese-manoushe',
    category: 'manakish',
    name: { en: 'Cheese manoushe', ar: 'منقوشة جبنة' },
    priceMinor: 400,
    dietTags: ['vegetarian'],
    itemTags: [],
    ingredients: [i('dough'), i('akkawi cheese')],
    groups: [],
    allergens: { gluten: 'contains', milk: 'contains', sesame: 'may_contain' },
    confirmed: true,
  },
  {
    key: 'lahm-bi-ajeen',
    category: 'manakish',
    name: { en: 'Lahm bi ajeen', ar: 'لحم بعجين' },
    priceMinor: 450,
    dietTags: [],
    itemTags: [],
    ingredients: [i('dough'), i('minced meat'), i('tomato'), i('onion')],
    groups: [],
    allergens: {},
    confirmed: false,
  },
  // Desserts
  {
    key: 'knefeh',
    category: 'desserts',
    name: { en: 'Knefeh', ar: 'كنافة' },
    priceMinor: 600,
    dietTags: ['vegetarian'],
    itemTags: ['popular'],
    ingredients: [i('semolina'), i('akkawi cheese'), i("ka'ak bread"), i('syrup'), i('pistachio')],
    groups: [],
    allergens: { gluten: 'contains', milk: 'contains', tree_nuts: 'contains', sesame: 'contains' },
    confirmed: true,
  },
  {
    key: 'mouhalabieh',
    category: 'desserts',
    name: { en: 'Mouhalabieh', ar: 'مهلّبية' },
    priceMinor: 450,
    dietTags: ['vegetarian'],
    itemTags: [],
    ingredients: [i('milk'), i('starch'), i('orange blossom'), i('pistachio')],
    groups: [],
    allergens: { milk: 'contains', tree_nuts: 'contains' },
    confirmed: true,
  },
  {
    key: 'atayef',
    category: 'desserts',
    name: { en: 'Atayef with ashta', ar: 'قطايف بالقشطة' },
    priceMinor: 600,
    dietTags: ['vegetarian'],
    itemTags: ['seasonal'],
    ingredients: [i('pancake'), i('ashta cream'), i('syrup'), i('pistachio')],
    groups: [],
    allergens: { gluten: 'contains', milk: 'contains', tree_nuts: 'contains' },
    confirmed: true,
  },
  // Drinks
  {
    key: 'lemonade',
    category: 'drinks',
    name: { en: 'Lemonade with mint', ar: 'ليموناضة بالنعنع' },
    priceMinor: 400,
    dietTags: ['vegan'],
    itemTags: [],
    ingredients: [i('lemon'), i('mint'), i('sugar')],
    groups: [],
    allergens: {},
    confirmed: true,
  },
  {
    key: 'jallab',
    category: 'drinks',
    name: { en: 'Jallab', ar: 'جلّاب' },
    priceMinor: 450,
    dietTags: ['vegan'],
    itemTags: [],
    ingredients: [i('date & grape molasses'), i('rose water'), i('pine nuts'), i('raisins')],
    groups: [],
    allergens: { tree_nuts: 'contains', sulphites: 'may_contain' },
    confirmed: true,
  },
  {
    key: 'ayran',
    category: 'drinks',
    name: { en: 'Ayran', ar: 'عيران' },
    priceMinor: 250,
    dietTags: ['vegetarian'],
    itemTags: [],
    ingredients: [i('yogurt'), i('water'), i('salt')],
    groups: [],
    allergens: { milk: 'contains' },
    confirmed: true,
  },
  {
    key: 'arak',
    category: 'drinks',
    name: { en: 'Arak (glass)', ar: 'كاس عرق' },
    priceMinor: 600,
    dietTags: ['alcohol'],
    itemTags: [],
    ingredients: [i('anise spirit')],
    groups: [],
    allergens: { sulphites: 'unknown' },
    confirmed: true,
  },
  {
    key: 'lebanese-coffee',
    category: 'drinks',
    name: { en: 'Lebanese coffee', ar: 'قهوة لبنانية' },
    priceMinor: 200,
    dietTags: ['vegan'],
    itemTags: [],
    ingredients: [i('coffee'), i('cardamom')],
    groups: ['G5'],
    allergens: {},
    confirmed: true,
  },
];

// ── Demo sessions (`--with-session`, SEED_DATA "Demo session") ──────────────────────────────

export interface SeedParticipant {
  key: string;
  displayName: string;
  color: string;
  locale: 'en' | 'ar';
  host?: boolean;
}

export interface SeedSessionItem {
  key: string;
  /** Who added it, and so who pays unless `sharedBy` lists sharers. */
  participant: string;
  dish: string;
  variant?: string;
  quantity: number;
  /** `G<n>/<option key>` */
  options?: string[];
  /** Equal weights of 1 (GROUP_ORDERING §5.2); the owner is one of them. */
  sharedBy?: string[];
}

export interface SeedSession {
  key: string;
  table: number;
  participants: SeedParticipant[];
  round: { status: 'accepted' | 'pending_approval'; submittedBy: string };
  items: SeedSessionItem[];
}

/**
 * Table 5 is the worked example of GROUP_ORDERING §7.5 (subtotal $49.50, so the P5 billing engine
 * can be checked against it) with round 1 accepted; table 9 waits for staff approval. Colours come
 * from the participant palette (UX_SPEC).
 */
export const SEED_SESSIONS: readonly SeedSession[] = [
  {
    key: 'table-5',
    table: 5,
    participants: [
      { key: 'rami', displayName: 'Rami', color: '#E4572E', locale: 'ar', host: true },
      { key: 'nour', displayName: 'Nour', color: '#17BEBB', locale: 'en' },
      { key: 'karim', displayName: 'Karim', color: '#FFC914', locale: 'en' },
    ],
    round: { status: 'accepted', submittedBy: 'rami' },
    items: [
      {
        key: 'rami-taouk',
        participant: 'rami',
        dish: 'shish-taouk',
        quantity: 1,
        options: ['G2/fries'],
      },
      { key: 'nour-fattoush', participant: 'nour', dish: 'fattoush', quantity: 1 },
      { key: 'nour-lemonade', participant: 'nour', dish: 'lemonade', quantity: 2 },
      {
        key: 'karim-mixed-grill',
        participant: 'karim',
        dish: 'mixed-grill',
        variant: 'for-one',
        quantity: 1,
        options: ['G2/fries'],
      },
      {
        key: 'shared-hummus',
        participant: 'rami',
        dish: 'hummus',
        quantity: 1,
        sharedBy: ['rami', 'nour', 'karim'],
      },
    ],
  },
  {
    key: 'table-9',
    table: 9,
    participants: [
      { key: 'lina', displayName: 'Lina', color: '#76B041', locale: 'en', host: true },
      { key: 'omar', displayName: 'Omar', color: '#2E86AB', locale: 'ar' },
    ],
    round: { status: 'pending_approval', submittedBy: 'lina' },
    items: [
      { key: 'lina-falafel', participant: 'lina', dish: 'falafel', quantity: 1 },
      { key: 'omar-kafta', participant: 'omar', dish: 'kafta', quantity: 1, options: ['G2/salad'] },
      { key: 'omar-ayran', participant: 'omar', dish: 'ayran', quantity: 1 },
    ],
  },
];
