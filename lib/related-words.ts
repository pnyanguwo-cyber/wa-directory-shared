// ── Related-word families (S20) ────────────────────────────────────────────
// What else a searcher might mean or type: brands, synonyms, sibling trades.
// Zimbabwe-specific, so the common searches widen instantly and for free.
// Anything not covered here falls back to the Gemini expandSearchQuery
// helper in lib/gemini.ts (webhook's expandRelatedTerms).

const FAMILIES: Record<string, string[]> = {
  // Utilities / trades
  electricity: ['electrician', 'zesa', 'solar', 'generator'],
  electrician: ['electricity', 'solar', 'zesa'],
  zesa: ['electricity', 'electrician'],
  solar: ['electrician', 'inverter', 'borehole'],
  power: ['electricity', 'generator', 'zesa'],
  generator: ['power', 'solar'],
  plumbing: ['plumber', 'borehole', 'pipes'],
  plumber: ['plumbing', 'borehole'],
  borehole: ['drilling', 'plumber', 'water tanks'],
  drilling: ['borehole'],
  roofing: ['building materials', 'roof sheets', 'hardware'],
  // Building / hardware
  building: ['building materials', 'bricks', 'cement', 'contractor'],
  'building materials': ['cement', 'bricks', 'hardware'],
  cement: ['building materials', 'bricks', 'hardware'],
  bricks: ['building materials', 'cement'],
  hardware: ['building materials', 'tools', 'plumbing'],
  paint: ['hardware', 'building materials'],
  // Food / retail
  bread: ['bakery', 'scones', 'cake'],
  bakery: ['bread', 'cake', 'pastries'],
  cake: ['bakery', 'catering'],
  meat: ['butchery', 'butcher'],
  butchery: ['meat'],
  food: ['restaurant', 'takeaway', 'catering'],
  restaurant: ['takeaway', 'catering', 'food'],
  takeaway: ['restaurant', 'food'],
  grocery: ['supermarket', 'spaza shop', 'food'],
  // Phones / tech
  phone: ['mobile phones', 'phone accessories', 'airtime'],
  'mobile phones': ['phone accessories', 'airtime'],
  phone_accessories: ['mobile phones', 'airtime'],
  airtime: ['mobile phones', 'phone accessories'],
  computer: ['laptop repairs', 'accessories', 'printing'],
  laptop: ['computer', 'repairs'],
  // Services
  transport: ['logistics', 'haulage', 'taxis'],
  haulage: ['transport', 'logistics'],
  taxi: ['transport', 'car hire'],
  car: ['mechanic', 'car parts', 'tyres'],
  mechanic: ['car parts', 'tyres', 'car'],
  salon: ['hairdresser', 'barber', 'beauty'],
  barber: ['salon', 'hair'],
  hairdresser: ['salon', 'beauty', 'hair'],
  beauty: ['salon', 'hairdresser'],
  school: ['education', 'tuition'],
  clinic: ['pharmacy', 'hospital', 'doctor'],
  pharmacy: ['chemist', 'medicine', 'clinic'],
  hospital: ['clinic', 'pharmacy'],
  garden: ['landscaping', 'lawn', 'plants'],
  landscaping: ['garden', 'lawn'],
  security: ['guards', 'alarm', 'cctv'],
  printing: ['signage', 'branding', 't-shirts'],
  signage: ['printing', 'branding'],
  furniture: ['upholstery', 'carpenter', 'beds'],
  carpenter: ['furniture', 'woodwork'],
  farming: ['fertiliser', 'livestock', 'poultry'],
  poultry: ['farming', 'eggs'],
  water: ['borehole', 'tanks', 'plumbing'],
}

/** Related terms for a search term (lowercased), never including the term
 * itself. Empty array when nothing is curated — callers fall back to AI. */
export function curatedRelatedTerms(term: string): string[] {
  const t = (term || '').trim().toLowerCase()
  return (FAMILIES[t] || []).filter(w => w !== t)
}
