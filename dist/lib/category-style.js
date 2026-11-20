"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_ACCENTS = exports.LUCIDE_DOODLES = void 0;
exports.isYellowPages = isYellowPages;
exports.doodleFor = doodleFor;
exports.accentFor = accentFor;
const LucideIcons = __importStar(require("lucide-react"));
const categories_js_1 = require("../data/categories.js");
const SPECIAL = new Set(categories_js_1.categories.filter(c => c.special).map(c => c.name));
function isYellowPages(categories) {
    if (!categories || categories.length === 0)
        return false;
    return categories.some(c => SPECIAL.has(c));
}
exports.LUCIDE_DOODLES = {
    Baker: LucideIcons.Cake,
    Plumber: LucideIcons.Wrench,
    Electrician: LucideIcons.Zap,
    'Food & Restaurant': LucideIcons.UtensilsCrossed,
    'Hair & Beauty': LucideIcons.Scissors,
    'Building Materials': LucideIcons.Hammer,
    'Clothing & Fashion': LucideIcons.Shirt,
    Automotive: LucideIcons.Car,
    'Cleaning Services': LucideIcons.SprayCan,
    'Farming & Agriculture': LucideIcons.Sprout,
    'Health & Medical': LucideIcons.Stethoscope,
    'Education & Tutoring': LucideIcons.GraduationCap,
    'IT & Web': LucideIcons.Monitor,
    'Transport & Delivery': LucideIcons.Truck,
    'Real Estate': LucideIcons.Home,
    'Financial Services': LucideIcons.Banknote,
    'Legal Services': LucideIcons.Scale,
    Photography: LucideIcons.Camera,
    Electronics: LucideIcons.Smartphone,
    'Pet Services': LucideIcons.PawPrint,
    Mining: LucideIcons.Pickaxe,
    Utilities: LucideIcons.Droplets,
    Manufacturing: LucideIcons.Factory,
    Wholesale: LucideIcons.Package,
    'Security Services': LucideIcons.Shield,
    'Funeral Services': LucideIcons.Heart,
    'Fitness & Gym': LucideIcons.Dumbbell,
    Printing: LucideIcons.Printer,
    Jewelry: LucideIcons.Gem,
    Entertainment: LucideIcons.Music,
    'Hotel & Lodging': LucideIcons.BedDouble,
    'Travel & Tourism': LucideIcons.Plane,
    Brewery: LucideIcons.Beer,
    'Professional Services': LucideIcons.Briefcase,
    'Music Studio': LucideIcons.Music,
    Translation: LucideIcons.Languages,
    Nonprofit: LucideIcons.HandHeart,
    Daycare: LucideIcons.Baby,
    'Coworking Space': LucideIcons.Building2,
    Landscaping: LucideIcons.Trees,
    'Emergency Services': LucideIcons.Siren,
    'Government Services': LucideIcons.Landmark,
    Other: LucideIcons.Sparkles,
};
function doodleFor(categories) {
    if (!categories || categories.length === 0)
        return null;
    for (const cat of categories) {
        const icon = exports.LUCIDE_DOODLES[cat];
        if (icon)
            return { name: cat, icon };
    }
    return { name: 'Other', icon: exports.LUCIDE_DOODLES.Other };
}
exports.CATEGORY_ACCENTS = {
    Baker: '#D97706',
    Plumber: '#2563EB',
    Electrician: '#CA8A04',
    'Food & Restaurant': '#EA580C',
    'Hair & Beauty': '#DB2777',
    'Building Materials': '#A16207',
    'Clothing & Fashion': '#C026D3',
    Automotive: '#DC2626',
    'Cleaning Services': '#0284C7',
    'Farming & Agriculture': '#15803D',
    'Health & Medical': '#0D9488',
    'Education & Tutoring': '#4F46E5',
    'IT & Web': '#7C3AED',
    'Transport & Delivery': '#0E7490',
    'Real Estate': '#059669',
    'Financial Services': '#1E40AF',
    'Legal Services': '#334155',
    Photography: '#9333EA',
    Electronics: '#0891B2',
    'Pet Services': '#F97316',
    Mining: '#92400E',
    Utilities: '#0F766E',
    Manufacturing: '#52525B',
    Wholesale: '#B45309',
    'Security Services': '#1E293B',
    'Funeral Services': '#4B5563',
    'Fitness & Gym': '#E11D48',
    Printing: '#6D28D9',
    Jewelry: '#F59E0B',
    Entertainment: '#A855F7',
    'Hotel & Lodging': '#115E59',
    'Travel & Tourism': '#0EA5E9',
    Brewery: '#9A3412',
    'Professional Services': '#475569',
    'Music Studio': '#6B21A8',
    Translation: '#4338CA',
    Nonprofit: '#047857',
    Daycare: '#EC4899',
    'Coworking Space': '#3B82F6',
    Landscaping: '#16A34A',
    'Emergency Services': '#B91C1C',
    'Government Services': '#1E3A8A',
    Other: '#25D366',
};
function accentFor(categories) {
    if (categories) {
        for (const cat of categories) {
            const accent = exports.CATEGORY_ACCENTS[cat];
            if (accent)
                return accent;
        }
    }
    return exports.CATEGORY_ACCENTS.Other;
}
