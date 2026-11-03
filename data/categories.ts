export interface Category {
  name: string
  keywords: string[]
  icon: string
  hint?: string
  // Yellow Pages: public/special services (police, fire, government offices…).
  // Listings in these categories render with the yellow-pages treatment.
  special?: boolean
}

export const categories: Category[] = [
  {
    name: 'Baker',
    keywords: ['cakes', 'bread', 'pastry', 'baking', 'confectionery', 'doughnuts', 'biscuits', 'chingwa', 'makeke', 'mabhanzi', 'zviroto', 'bakery', 'cookies', 'muffins', 'loaf', 'scones', 'fresh bread'],
    icon: '🍞',
    hint: 'Cakes, bread, pastries, doughnuts, biscuits, muffins, scones',
  },
  {
    name: 'Plumber',
    keywords: ['plumbing', 'pipes', 'drain', 'water leak', 'toilet', 'tap', 'pombi', 'mvura', 'mabhubhu', 'drainage', 'sewer', 'water heater', 'pipe repair', 'blocked drain'],
    icon: '🔧',
    hint: 'Pipes, drains, water leaks, toilets, taps, boreholes, water heaters',
  },
  {
    name: 'Electrician',
    keywords: ['electrical', 'wiring', 'lights', 'power', 'socket', 'generator', 'magetsi', 'tambo', 'zvigadziriso', 'rewiring', 'installation', 'switch', 'fuse', 'circuit', 'electric repair'],
    icon: '⚡',
    hint: 'Wiring, lights, generators, solar, switches, circuits, installations',
  },
  {
    name: 'Food & Restaurant',
    keywords: ['restaurant', 'takeaway', 'meals', 'catering', 'fast food', 'pizza', 'chicken', 'sadza', 'nyama', 'huku', 'muriwo', 'chibage', 'madora', 'lunch', 'dinner', 'breakfast', 'snacks', 'food', 'eat', 'dining', 'menu', 'grocery', 'supermarket', 'tuckshop'],
    icon: '🍔',
    hint: 'Meals, takeaway, catering, fast food, pizza, chicken, sadza',
  },
  {
    name: 'Hair & Beauty',
    keywords: ['hair', 'braids', 'cut', 'salon', 'barber', 'nails', 'makeup', 'cosmetics', 'bvudzi', 'mabhurekisi', 'kugera', 'spa', 'massage', 'manicure', 'pedicure', 'waxing', 'skincare', 'beauty', 'facials'],
    icon: '💇',
    hint: 'Braids, cuts, salon, barber, nails, makeup, spa, skincare',
  },
  {
    name: 'Building Materials',
    keywords: ['construction', 'hardware', 'cement', 'bricks', 'timber', 'roofing', 'zvidhinha', 'simenti', 'matanda', 'denga', 'paint', 'tools', 'tiles', 'doors', 'windows', 'sand', 'gravel', 'iron sheets', 'building'],
    icon: '🏗️',
    hint: 'Cement, bricks, timber, roofing, paint, tools, tiles, doors',
  },
  {
    name: 'Clothing & Fashion',
    keywords: ['fashion', 'apparel', 'dresses', 'shoes', 'tailor', 'designer', 'mbatya', 'shangu', 'zvipfeko', 'outfits', 'fabric', 'sewing', 'traditional', 'african', 'clothes', 'uniforms'],
    icon: '👗',
    hint: 'Dresses, shoes, tailor, designer, fabric, sewing, uniforms',
  },
  {
    name: 'Automotive',
    keywords: ['car', 'mechanic', 'repair', 'tyres', 'garage', 'spare parts', 'mota', 'matai', 'injini', 'car wash', 'service', 'maintenance', 'vehicle', 'battery', 'auto', 'engine', 'panel beater'],
    icon: '🚗',
    hint: 'Car repair, tyres, garage, spare parts, car wash, engine service',
  },
  {
    name: 'Cleaning Services',
    keywords: ['cleaning', 'janitor', 'housekeeping', 'laundry', 'kutsvaira', 'kugeza', 'kuchenesa', 'maid', 'carpet cleaning', 'office cleaning', 'house cleaning', 'sanitize', 'disinfect'],
    icon: '🧹',
    hint: 'Housekeeping, laundry, office cleaning, carpet cleaning, maid service',
  },
  {
    name: 'Farming & Agriculture',
    keywords: ['agriculture', 'livestock', 'crops', 'gardening', 'farm', 'kurima', 'mombe', 'mbeu', 'pamba', 'seeds', 'fertilizer', 'irrigation', 'poultry', 'cattle', 'garden', 'vegetables'],
    icon: '🌾',
    hint: 'Crops, livestock, seeds, fertilizer, irrigation, poultry, vegetables',
  },
  {
    name: 'Health & Medical',
    keywords: ['doctor', 'clinic', 'pharmacy', 'dentist', 'hospital', 'chipatara', 'mushonga', 'chiremba', 'kurapa', 'pill', 'medicine', 'drugs', 'tablets', 'prescription', 'chemist', 'health', 'wellness', 'sick', 'surgery', 'specialist'],
    icon: '🏥',
    hint: 'Doctor, clinic, pharmacy, dentist, hospital, medicine, wellness',
  },
  {
    name: 'Education & Tutoring',
    keywords: ['tutor', 'lessons', 'training', 'school', 'teacher', 'chikoro', 'mudzidzisi', 'fundo', 'kudzidza', 'homework', 'exam prep', 'online classes', 'reading', 'math', 'science', 'university'],
    icon: '📚',
    hint: 'Tutor, lessons, training, school, homework, exam prep, online classes',
  },
  {
    name: 'IT & Web',
    keywords: ['software', 'web design', 'development', 'computer', 'graphic design', 'kombiyuta', 'nharembozha', 'app', 'tech', 'digital', 'programming', 'coding', 'design', 'it support', 'cyber', 'website'],
    icon: '💻',
    hint: 'Software, web design, computers, graphic design, coding, IT support',
  },
  {
    name: 'Transport & Delivery',
    keywords: ['delivery', 'logistics', 'truck', 'courier', 'shipping', 'bhazi', 'tekisi', 'kutakura', 'ride', 'taxi', 'moving', 'freight', 'transport'],
    icon: '🚚',
    hint: 'Delivery, logistics, truck, courier, taxi, moving, freight',
  },
  {
    name: 'Real Estate',
    keywords: ['property', 'real estate', 'housing', 'estate', 'imba', 'nzvimbo', 'roja', 'apartment', 'lease', 'valuation', 'mortgage', 'stand for sale', 'plots'],
    icon: '🏠',
    hint: 'Property, rent, housing, estate, apartment, lease',
  },
  {
    name: 'Financial Services',
    keywords: ['accounting', 'insurance', 'loans', 'banking', 'tax', 'mari', 'bhanga', 'inishuwarenzi', 'chikwereti', 'fintech', 'mobile money', 'ecocash', 'invest', 'savings', 'budget', 'finance'],
    icon: '💰',
    hint: 'Accounting, insurance, loans, banking, tax, mobile money, finance',
  },
  {
    name: 'Legal Services',
    keywords: ['lawyer', 'attorney', 'legal advice', 'notary', 'gweta', 'mutemo', 'court', 'divorce', 'contract', 'immigration', 'legal', 'conveyancing'],
    icon: '⚖️',
    hint: 'Lawyer, attorney, legal advice, notary, court, contracts, immigration',
  },
  {
    name: 'Photography',
    keywords: ['photos', 'videography', 'events', 'wedding', 'mifananidzo', 'kupururudza', 'photographer', 'shoot', 'camera', 'video', 'editing', 'album'],
    icon: '📷',
    hint: 'Photos, videography, events, wedding, camera, video, editing',
  },
  {
    name: 'Electronics',
    keywords: ['phones', 'laptops', 'gadgets', 'repair', 'tv', 'radio', 'computer', 'nharembozha', 'terevhizheni', 'devices', 'accessories', 'charger', 'cable', 'screen', 'battery', 'tablet', 'speaker'],
    icon: '📱',
    hint: 'Phones, laptops, gadgets, TV, radio, accessories, repair',
  },
  {
    name: 'Pet Services',
    keywords: ['vet', 'pet', 'grooming', 'dog', 'imbwa', 'katsi', 'mhuka', 'pet shop', 'animal', 'veterinary', 'pet food', 'puppy', 'cat'],
    icon: '🐾',
    hint: 'Vet, pet grooming, pet shop, animal care, pet food',
  },
  {
    name: 'Mining',
    keywords: ['mining', 'coal', 'metal ore', 'gold', 'iron', 'copper', 'chrome', 'extraction', 'mine', 'mineral', 'quarry', 'smelting'],
    icon: '⛏️',
    hint: 'Mining, coal, gold, iron, copper, chrome, extraction, quarry',
  },
  {
    name: 'Utilities',
    keywords: ['electricity', 'power generation', 'water supply', 'water treatment', 'utility', 'energy', 'distribution', 'power line', 'borehole'],
    icon: '💧',
    hint: 'Electricity, power generation, water supply, water treatment, borehole',
  },
  {
    name: 'Manufacturing',
    keywords: ['manufacturing', 'factory', 'production', 'processing', 'packaging', 'textile', 'fabric', 'furniture production', 'food processing', 'plant', 'assembly'],
    icon: '🏭',
    hint: 'Factory, production, processing, packaging, textile, assembly',
  },
  {
    name: 'Wholesale',
    keywords: ['wholesale', 'bulk', 'distributor', 'wholesale food', 'wholesale electronics', 'bulk supply', 'trade', 'wholesaler'],
    icon: '📦',
    hint: 'Wholesale, bulk supply, distributor, trade, wholesaler',
  },
  {
    name: 'Security Services',
    keywords: ['security', 'guards', 'surveillance', 'protection', 'armed response', 'cctv', 'security company', 'bodyguard', 'alarm', 'kuchengetedza'],
    icon: '🛡️',
    hint: 'Guards, surveillance, protection, CCTV, armed response, alarm',
  },
  {
    name: 'Funeral Services',
    keywords: ['funeral', 'burial', 'memorial', 'coffin', 'hearse', 'funeral services', 'burial services', 'cremation', 'kufirwa', 'rassure'],
    icon: '⚰️',
    hint: 'Funeral, burial, memorial, coffin, hearse, cremation',
  },
  {
    name: 'Fitness & Gym',
    keywords: ['gym', 'fitness', 'workout', 'exercise', 'trainer', 'bodybuilding', 'crossfit', 'aerobics', 'yoga', 'pilates', 'wellness', 'personal trainer'],
    icon: '🏋️',
    hint: 'Gym, fitness, workout, trainer, bodybuilding, yoga, aerobics',
  },
  {
    name: 'Printing',
    keywords: ['printing', 'print shop', 'publishing', 'banner', 'flyers', 'brochures', 'business cards', 't-shirt printing', 'branding', 'print', 'posters'],
    icon: '🖨️',
    hint: 'Printing, flyers, brochures, business cards, t-shirt printing, branding',
  },
  {
    name: 'Jewelry',
    keywords: ['jewelry', 'jewellery', 'rings', 'watches', 'gold', 'silver', 'ornaments', 'beads', 'custom jewelry', 'earrings', 'necklace', 'wedding rings'],
    icon: '💍',
    hint: 'Jewelry, rings, watches, gold, silver, beads, custom pieces',
  },
  {
    name: 'Entertainment',
    keywords: ['entertainment', 'movies', 'music', 'events', 'concerts', 'cinema', 'theatre', 'dj', 'party', 'amusement', 'event planning', 'weddings', 'corporate events', 'fairs', 'games'],
    icon: '🎬',
    hint: 'Movies, music, events, concerts, DJ, party, event planning',
  },
  {
    name: 'Hotel & Lodging',
    keywords: ['hotel', 'lodge', 'accommodation', 'lodging', 'guest house', 'motel', 'inn', 'bed and breakfast', 'backpackers', 'hostel', 'resort', 'airbnb'],
    icon: '🏨',
    hint: 'Hotel, lodge, accommodation, guest house, motel, resort, Airbnb',
  },
  {
    name: 'Travel & Tourism',
    keywords: ['travel', 'tourism', 'tour', 'safari', 'booking', 'flight', 'visa', 'holiday', 'adventure', 'excursions', 'travel agency', 'tours'],
    icon: '✈️',
    hint: 'Travel, tourism, tour, safari, booking, holiday, adventure',
  },
  {
    name: 'Brewery',
    keywords: ['brewery', 'beer', 'brewing', 'beverages', 'cider', 'stout', 'lager', 'malt', 'craft beer'],
    icon: '🍺',
    hint: 'Brewery, beer, brewing, beverages, cider, craft beer',
  },
  {
    name: 'Professional Services',
    keywords: ['consulting', 'business consulting', 'hr', 'recruiting', 'recruitment', 'staffing', 'architecture', 'engineering', 'strategy', 'management consulting', 'public relations', 'communications', 'audit'],
    icon: '👔',
    hint: 'Consulting, HR, recruiting, architecture, engineering, PR, audit',
  },
  {
    name: 'Music Studio',
    keywords: ['music studio', 'recording', 'mixing', 'mastering', 'production', 'sound', 'audio', 'music production', 'studio'],
    icon: '🎵',
    hint: 'Recording, mixing, mastering, production, sound, audio, studio',
  },
  {
    name: 'Translation',
    keywords: ['translation', 'translator', 'interpreting', 'interpretation', 'language services', 'document translation', 'shona', 'ndebele'],
    icon: '🌐',
    hint: 'Translation, interpreting, language services, Shona, Ndebele',
  },
  {
    name: 'Nonprofit',
    keywords: ['nonprofit', 'charity', 'ngo', 'community', 'donations', 'fundraising', 'volunteer', 'welfare', 'trust', 'foundation'],
    icon: '🤝',
    hint: 'Charity, NGO, community, donations, fundraising, volunteer',
  },
  {
    name: 'Daycare',
    keywords: ['daycare', 'childcare', 'creche', 'nursery', 'babysitting', 'after school care', 'kindergarten', 'kids care'],
    icon: '👶',
    hint: 'Daycare, childcare, creche, nursery, babysitting, kindergarten',
  },
  {
    name: 'Coworking Space',
    keywords: ['coworking', 'shared office', 'office space', 'meeting rooms', 'workspace', 'hot desk', 'serviced office'],
    icon: '🏢',
    hint: 'Coworking, shared office, office space, meeting rooms, hot desk',
  },
  {
    name: 'Landscaping',
    keywords: ['landscaping', 'garden design', 'lawn care', 'grounds maintenance', 'gardening', 'irrigation', 'turf', 'landscaper', 'garden service'],
    icon: '🌳',
    hint: 'Landscaping, garden design, lawn care, irrigation, gardening',
  },
  {
    name: 'Emergency Services',
    keywords: ['police', 'zrp', 'fire brigade', 'firefighter', 'fire fighter', 'ambulance', 'emergency', 'disaster', 'rescue', 'civil protection', 'emergency hotline', 'toll free', 'sos'],
    icon: '🚨',
    hint: 'Police, fire brigade, ambulance, emergency response, hotlines',
    special: true,
  },
  {
    name: 'Government Services',
    keywords: ['government', 'council', 'municipality', 'registrar', 'passport office', 'zimra', 'public office', 'civic', 'registry', 'home affairs', 'public service', 'utility office'],
    icon: '🏛️',
    hint: 'Council, municipality, registrar, passport, ZIMRA, public offices',
    special: true,
  },
  { name: 'Other', keywords: [], icon: '📋' },
]

export function matchCategory(input: string): string {
  const lower = input.toLowerCase().trim()
  if (!lower) return 'Other'

  for (const cat of categories) {
    if (cat.name.toLowerCase() === lower) return cat.name
  }

  for (const cat of categories) {
    if (cat.name.toLowerCase().includes(lower) || lower.includes(cat.name.toLowerCase())) return cat.name
  }

  let bestMatch = 'Other'
  let bestScore = 0
  for (const cat of categories) {
    for (const kw of cat.keywords) {
      const kwLower = kw.toLowerCase()
      if (kwLower.includes(lower) || lower.includes(kwLower)) {
        const score = kwLower.includes(lower)
          ? kwLower.length / Math.max(lower.length, 1)
          : lower.length / Math.max(kwLower.length, 1)
        if (score > bestScore) {
          bestScore = score
          bestMatch = cat.name
        }
      }
    }
  }
  return bestMatch
}
