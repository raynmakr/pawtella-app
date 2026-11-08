// Deterministic mock depot inventory for development: ~25 realistic pet-store items, a few at zero
// stock, and one "newly discovered" SKU per day (so the sourcing queue and digest have something to
// show). Quantities drift a little by date so transitions in/out of stock are exercised.

const BASE = [
  ['MOCK-FOOD-001', '062786010014', 'Acana Grasslands Dog Food 11.4kg', 'Dog Food', 'Acana', 10999, 7850, 6],
  ['MOCK-FOOD-002', '062786020013', 'Orijen Original Cat Food 5.4kg', 'Cat Food', 'Orijen', 8499, 6120, 4],
  ['MOCK-FOOD-003', '030111000019', 'Blue Buffalo Wilderness Chicken 10.9kg', 'Dog Food', 'Blue Buffalo', 8999, 6400, 0],
  ['MOCK-FOOD-004', '017800149020', 'Purina Pro Plan Sensitive Skin 15kg', 'Dog Food', 'Purina', 9499, 7010, 3],
  ['MOCK-FOOD-005', '073657003618', 'Royal Canin Indoor Adult Cat 4kg', 'Cat Food', 'Royal Canin', 5299, 3840, 9],
  ['MOCK-WET-001', '017800127745', 'Fancy Feast Classic Pate Variety 24 Pack', 'Cat Food', 'Purina', 2999, 2150, 14],
  ['MOCK-WET-002', '030111041005', 'Blue Buffalo Homestyle Beef Can 354g', 'Dog Food', 'Blue Buffalo', 399, 260, 36],
  ['MOCK-TREAT-001', '840243106998', 'Greenies Regular Dental Treats 36ct', 'Dog Treats', 'Greenies', 4499, 3100, 11],
  ['MOCK-TREAT-002', '029695312008', "Zuke's Mini Naturals Peanut Butter 454g", 'Dog Treats', "Zuke's", 1999, 1320, 0],
  ['MOCK-TREAT-003', '048464012000', 'Temptations Tasty Chicken Cat Treats 180g', 'Cat Treats', 'Temptations', 649, 410, 22],
  ['MOCK-LITTER-001', '041785010235', "World's Best Cat Litter Multi-Cat 12.7kg", 'Cat Litter', "World's Best", 4999, 3600, 7],
  ['MOCK-LITTER-002', '029695390036', 'Arm & Hammer Clump & Seal 12.7kg', 'Cat Litter', 'Arm & Hammer', 3299, 2350, 5],
  ['MOCK-LITTER-003', '023100126104', "Dr. Elsey's Ultra Litter 18kg", 'Cat Litter', "Dr. Elsey's", 3699, 2680, 0],
  ['MOCK-TOY-001', '660048000266', 'KONG Classic Large', 'Dog Toys', 'KONG', 1899, 1140, 13],
  ['MOCK-TOY-002', '655199029174', 'Chuckit! Ultra Ball Medium 2pk', 'Dog Toys', 'Chuckit!', 1299, 780, 20],
  ['MOCK-TOY-003', '077234027500', 'SmartyKat Skitter Critters 3pk', 'Cat Toys', 'SmartyKat', 799, 460, 17],
  ['MOCK-GEAR-001', '022808910046', 'PetSafe Easy Walk Harness Medium', 'Dog Gear', 'PetSafe', 3999, 2650, 4],
  ['MOCK-GEAR-002', null, 'Pawtella Rope Leash 6ft Coral', 'Dog Gear', 'Pawtella', 2499, 1200, 9],
  ['MOCK-GEAR-003', '814115010166', 'Catit Flower Fountain 3L', 'Cat Gear', 'Catit', 4499, 3020, 1],
  ['MOCK-GEAR-004', '022517502006', 'Sherpa Original Deluxe Carrier Medium', 'Travel', 'Sherpa', 8999, 5800, 0],
  ['MOCK-HEALTH-001', '815010011385', 'Zesty Paws Hip & Joint Bites 90ct', 'Health', 'Zesty Paws', 3999, 2710, 8],
  ['MOCK-HEALTH-002', '850000001032', 'Advantage II Flea Treatment Large Dog', 'Health', 'Bayer', 7499, 5500, 3],
  ['MOCK-GROOM-001', '045663310240', 'FURminator deShedding Tool Large', 'Grooming', 'FURminator', 5499, 3670, 5],
  ['MOCK-GROOM-002', '736990004437', 'Earthbath Oatmeal & Aloe Shampoo 472ml', 'Grooming', 'Earthbath', 1799, 1090, 12],
  ['MOCK-GROOM-003', '013227102019', 'Safari Professional Nail Trimmer', 'Grooming', 'Safari', 1499, 830, 7],
];

const NEW_ITEM_POOL = [
  ['Stella & Chewy\'s Freeze-Dried Beef Patties 25oz', 'Dog Food', "Stella & Chewy's", 6999, 4900],
  ['Tiki Cat Luau Variety 12 Pack', 'Cat Food', 'Tiki Cat', 3499, 2500],
  ['West Paw Zogoflex Toppl Large', 'Dog Toys', 'West Paw', 2999, 1800],
  ['Petlibro Automatic Feeder 4L', 'Cat Gear', 'Petlibro', 11999, 8200],
  ['Hill\'s Science Diet Puppy Small Bites 7kg', 'Dog Food', "Hill's", 7499, 5300],
  ['Yeowww! Catnip Banana', 'Cat Toys', 'Yeowww!', 999, 550],
  ['Ruffwear Front Range Harness Medium', 'Dog Gear', 'Ruffwear', 7999, 5200],
];

/** Day number since epoch in UTC; the seed for "today's" variations. */
export function dayNumber(date = new Date()) {
  return Math.floor(new Date(date).getTime() / 86_400_000);
}

export function mockItems(date = new Date()) {
  const day = dayNumber(date);
  const updatedAt = new Date(day * 86_400_000);
  const items = BASE.map(([sku, barcode, name, category, brand, priceCents, costCents, qty], i) => {
    // small deterministic drift: every third item wobbles by -1..+1 depending on the day
    const drift = i % 3 === 0 ? ((day + i) % 3) - 1 : 0;
    return {
      sku,
      barcode: barcode || undefined,
      name,
      category,
      brand,
      priceCents,
      costCents,
      qtyOnHand: Math.max(0, qty + (qty === 0 ? 0 : drift)),
      updatedAt,
    };
  });
  const n = NEW_ITEM_POOL[day % NEW_ITEM_POOL.length];
  items.push({
    sku: `MOCK-NEW-${String(day).slice(-5)}`,
    name: n[0],
    category: n[1],
    brand: n[2],
    priceCents: n[3],
    costCents: n[4],
    qtyOnHand: day % 2 === 0 ? 0 : 3,
    updatedAt,
  });
  return items;
}

export function createMockSource() {
  return {
    name: 'mock',
    isMock: true,
    async listItems() {
      return mockItems();
    },
  };
}
