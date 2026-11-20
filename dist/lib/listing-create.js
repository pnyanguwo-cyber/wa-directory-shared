"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createListing = createListing;
exports.autoRequestUnapprovedFeatures = autoRequestUnapprovedFeatures;
exports.adminRequestNotice = adminRequestNotice;
const supabase_server_js_1 = require("./supabase-server.js");
const zimbabwe_locations_js_1 = require("../data/zimbabwe-locations.js");
const categories_js_1 = require("../data/categories.js");
const approved_data_js_1 = require("./approved-data.js");
const phone_js_1 = require("./phone.js");
const business_id_js_1 = require("./business-id.js");
const username_js_1 = require("./username.js");
const site_generation_js_1 = require("./site-generation.js");
const site_url_js_1 = require("./site-url.js");
const utils_js_1 = require("./utils.js");
const SPECIAL_CATEGORIES = new Set(categories_js_1.categories.filter(c => c.special).map(c => c.name));
const WA_MSG = 'Hi%2C%20I%20found%20you%20on%20WA%20Directory';
async function createListing(body, adapters) {
    const { name } = body;
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
        return { error: 'A business name between 2 and 80 characters is required.' };
    }
    if (!Array.isArray(body.categories) || body.categories.length === 0 || body.categories.length > 4 ||
        !body.categories.every((c) => typeof c === 'string')) {
        return { error: 'Select at least one category.' };
    }
    if (!body.phone || typeof body.phone !== 'string') {
        return { error: 'A WhatsApp phone number is required.' };
    }
    const code = typeof body.countryCode === 'string' && body.countryCode.startsWith('+') ? body.countryCode : '+263';
    const isVoice = body.phoneType === 'voice';
    const fullPhone = isVoice ? (0, phone_js_1.normalizeVoicePhone)(body.phone) : (0, phone_js_1.toFullPhone)(code, body.phone);
    if (fullPhone.length < (isVoice ? 3 : 10) || fullPhone.length > 15) {
        return { error: 'That phone number looks invalid for the selected country code.' };
    }
    const validCityNames = new Set(zimbabwe_locations_js_1.zimbabweCities.map(c => c.name));
    const rawCityInput = typeof body.city === 'string' ? body.city : '';
    const isRemote = body.isRemote === true || rawCityInput === 'remote' || rawCityInput === '*';
    // Unknown towns are kept as "pending" locations (admin reviews them) instead
    // of being silently dropped — same treatment the web form gives custom names.
    const trimmedCity = rawCityInput.trim();
    const isPendingCity = !isRemote && trimmedCity.length > 0 &&
        (body.pendingCity === true || !validCityNames.has(trimmedCity));
    const cleanCity = rawCityInput
        ? (isRemote ? '' : validCityNames.has(trimmedCity) ? trimmedCity : isPendingCity ? trimmedCity : '')
        : '';
    const voicePhoneInput = typeof body.voicePhone === 'string' ? body.voicePhone.trim() : '';
    const cleanVoicePhone = voicePhoneInput && !isVoice ? (0, phone_js_1.normalizeVoicePhone)(voicePhoneInput) : null;
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const { data: catRows } = await supabase
        .from('categories')
        .select('name')
        .eq('active', true);
    const approvedCategories = new Set((catRows || []).map((r) => r.name));
    const cleanCategories = (0, utils_js_1.dedupeCategories)(body.categories)
        .filter(c => approvedCategories.has(c));
    if (cleanCategories.length === 0) {
        return { error: 'Selected categories are not on the approved list.' };
    }
    const cleanSocials = (Array.isArray(body.socials) ? body.socials : [])
        .filter((s) => typeof s === 'string')
        .map((s) => s.trim().replace(/\s+/g, ' ').replace(/[`*_]/g, '').slice(0, 100))
        .filter(Boolean)
        .slice(0, 3);
    let cleanAreas = [];
    if (Array.isArray(body.areas)) {
        cleanAreas = [...new Set(body.areas)]
            .filter((a) => typeof a === 'string' && a.trim().length > 0)
            .map(a => a.trim())
            .slice(0, 8);
    }
    if (typeof body.city === 'string' && (body.city === '*' || body.city === 'remote'))
        cleanAreas = [];
    if (isRemote && !cleanCity && typeof body.city === 'string' && body.city === '*')
        cleanAreas = [];
    const location = isRemote && !cleanCity
        ? 'Zimbabwe'
        : [cleanAreas.join(', '), cleanCity, 'Zimbabwe'].filter(Boolean).join(', ');
    const price = typeof body.priceRange === 'string' ? body.priceRange.trim() : '';
    const normalizedPrice = price ? (price.startsWith('$') ? price : `$${price}`) : null;
    const editToken = crypto.randomUUID();
    let businessId = (0, business_id_js_1.generateBusinessId)();
    for (let i = 0; i < 5; i++) {
        const { data: existing } = await supabase
            .from('businesses')
            .select('id')
            .eq('business_id', businessId)
            .maybeSingle();
        if (!existing)
            break;
        businessId = (0, business_id_js_1.generateBusinessId)();
    }
    let normalizedUsername = body.requestedUsername
        ? (0, username_js_1.normalizeUsername)(body.requestedUsername)
        : (0, username_js_1.suggestUsername)(name.trim());
    for (let i = 0; i < 10; i++) {
        const { data: existing } = await supabase
            .from('businesses')
            .select('id')
            .eq('username', normalizedUsername)
            .maybeSingle();
        if (!existing)
            break;
        normalizedUsername = normalizedUsername.replace(/_\d+$/, '') + '_' + (i + 2);
    }
    let inserted = null;
    let lastError = null;
    function generateSlug(name) {
        const base = (0, utils_js_1.slugify)(name, 50) || 'business';
        return `${base}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const generateSite = body.generateSite !== false;
    const isYellowPages = cleanCategories.some(c => SPECIAL_CATEGORIES.has(c));
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
        const slug = generateSlug(name);
        const { data, error } = await supabase
            .from('businesses')
            .insert({
            name: name.trim(),
            slug,
            business_id: businessId,
            username: normalizedUsername,
            whatsapp_username: typeof body.whatsappUsername === 'string' ? body.whatsappUsername.trim() : '',
            bio: (typeof body.bio === 'string' && body.bio.trim()) ||
                `Professional ${typeof body.description === 'string' ? body.description.trim() : ''} services.`.replace('Professional  ', 'Professional '),
            category: cleanCategories,
            location,
            country_code: code,
            city: cleanCity,
            area: cleanAreas.length === 0 ? '' : cleanAreas[0],
            areas: cleanAreas,
            is_remote: isRemote,
            phone: fullPhone,
            phone_type: isVoice ? 'voice' : 'whatsapp',
            whatsapp_link: isVoice ? null : `https://wa.me/${fullPhone}?text=${WA_MSG}`,
            voice_phone: cleanVoicePhone,
            requested_category: typeof body.requestedCategory === 'string' && body.requestedCategory.trim()
                ? body.requestedCategory.trim().slice(0, 60)
                : null,
            catalog_link: typeof body.catalogLink === 'string' && body.catalogLink.trim() ? body.catalogLink.trim() : null,
            logo_url: typeof body.logoUrl === 'string' && body.logoUrl.trim() ? body.logoUrl.trim() : null,
            price_range: normalizedPrice,
            website: typeof body.website === 'string' && body.website.trim() ? body.website.trim() : null,
            socials: cleanSocials,
            address: typeof body.address === 'string' ? body.address.trim() : '',
            lat: typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null,
            lng: typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null,
            address_verified: body.addressVerified === true,
            show_location: body.showLocation !== false,
            edit_token: editToken,
            generate_site: generateSite === true,
            site_contact_email: typeof body.siteContactEmail === 'string' && body.siteContactEmail.trim() ? body.siteContactEmail.trim() : '',
            verified: false,
            rating: 0,
            review_count: 0,
            payment_status: isYellowPages ? 'active' : 'pending',
        })
            .select('id, slug')
            .single();
        if (!error)
            inserted = data;
        else
            lastError = error.message;
    }
    if (!inserted) {
        return { error: lastError || 'Could not create the listing. Please try again.' };
    }
    if (generateSite) {
        try {
            const content = await (0, site_generation_js_1.generateSiteContent)({
                businessName: name.trim(),
                category: cleanCategories[0] || '',
                bio: typeof body.bio === 'string' ? body.bio.trim() : '',
                city: cleanCity,
            });
            await supabase
                .from('businesses')
                .update({ site_hero: content.hero, site_services: content.services })
                .eq('id', inserted.id);
        }
        catch {
            // Non-blocking: the site falls back to template copy when generation fails.
        }
    }
    const siteUrl = site_url_js_1.SITE_URL;
    const editLink = `${siteUrl}/edit?token=${editToken}`;
    const payLink = `${siteUrl}/pay`;
    const notify = body.notify !== false;
    if (notify && adapters) {
        if (isYellowPages && process.env.ADMIN_WHATSAPP) {
            await adapters.sendWhatsAppMessage(process.env.ADMIN_WHATSAPP, [
                '🚨 *YELLOW PAGES SUBMISSION: VERIFY FAST*',
                '',
                'A public-service listing was just submitted and needs priority verification.',
                '',
                `Name: ${name.trim()}`,
                `Category: ${cleanCategories.join(', ')}`,
                `Location: ${location}`,
                `Phone: ${fullPhone}`,
                '',
                `Profile: ${siteUrl}/business/${inserted.slug || inserted.id}`,
                `Review: ${siteUrl}/admin`,
                '',
                'Verify ASAP so it appears in the Emergency & Essential Services strip and /yellow-pages.',
            ].join('\n'));
        }
        if (isYellowPages) {
            const statusText = 'received: public-service listings get priority review';
            if (adapters.sendWhatsAppTemplate && process.env.WHATSAPP_TEMPLATE_SUBMITTED) {
                await adapters.sendWhatsAppTemplate(fullPhone, process.env.WHATSAPP_TEMPLATE_SUBMITTED, [name.trim(), statusText, editLink]);
            }
            else {
                await adapters.sendWhatsAppMessage(fullPhone, [
                    `✅ *LISTING RECEIVED: ${name.trim()}*`,
                    '',
                    `Your listing on WA Directory is ${statusText}.`,
                    '',
                    'Verification status: ⏳ Pending review',
                    'Public-service listings are prioritized by our team.',
                    '',
                    'Edit your listing anytime with your private link:',
                    editLink,
                    '',
                    'Keep this link safe: anyone with it can edit your listing.',
                ].join('\n'));
            }
        }
        else {
            await adapters.sendWhatsAppMessage(fullPhone, [
                `✅ *LISTING CREATED: ${name.trim()}*`,
                '',
                `Business ID: ${businessId}`,
                `Username: @${normalizedUsername}`,
                '',
                `Pay USD 1 via EcoCash to go live.`,
                `Anyone can pay for you at: ${payLink}`,
                '',
                'Your listing will appear once admin confirms the payment.',
                '',
                'Edit your listing anytime with your private link:',
                editLink,
            ].join('\n'));
        }
    }
    return {
        id: inserted.id,
        slug: inserted.slug || '',
        name: name.trim(),
        businessId,
        username: normalizedUsername,
        editToken,
        categories: cleanCategories,
        city: cleanCity,
        isYellowPages,
        pendingPayment: !isYellowPages,
    };
}
/** After a listing is created, push admin-review requests for any location or
 * category value that is not on the approved lists — the chatbot equivalent of
 * the web form's feature requests. When a business is later verified, these
 * requests are auto-approved and the location lands in the cities/areas
 * tables for future users. Returns human-readable labels of what was newly
 * requested (empty when everything was already approved). */
async function autoRequestUnapprovedFeatures(businessId, input) {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const created = [];
    const push = async (type, name, city, label) => {
        const clean = name.trim().slice(0, 60);
        if (!clean)
            return;
        const { data: existing } = await supabase
            .from('feature_requests')
            .select('id, status')
            .eq('business_id', businessId)
            .eq('type', type)
            .ilike('name', clean)
            .maybeSingle();
        if (existing)
            return;
        const { error } = await supabase
            .from('feature_requests')
            .insert({ type, name: clean, city, business_id: businessId, status: 'pending' });
        if (!error)
            created.push(label);
    };
    const city = (input.city || '').trim();
    const areas = (input.areas || []).map(a => (a || '').trim()).filter(Boolean);
    if (city) {
        const approvedCities = await (0, approved_data_js_1.getApprovedCities)();
        if (!approvedCities.some(c => c.name.toLowerCase() === city.toLowerCase())) {
            await push('city', city, '', `city: ${city}`);
        }
        const approvedAreas = await (0, approved_data_js_1.getApprovedAreas)();
        const knownInCity = new Set(approvedAreas.filter(a => a.city.toLowerCase() === city.toLowerCase()).map(a => a.name.toLowerCase()));
        for (const area of areas) {
            if (!knownInCity.has(area.toLowerCase()))
                await push('area', area, city, `area: ${area} (${city})`);
        }
    }
    else {
        for (const area of areas)
            await push('area', area, city, `area: ${area}`);
    }
    const approvedCats = await (0, approved_data_js_1.getApprovedCategories)();
    for (const category of input.categories || []) {
        const c = (category || '').trim();
        if (c && !approvedCats.some(x => x.name.toLowerCase() === c.toLowerCase())) {
            await push('category', c, '', `category: ${c}`);
        }
    }
    // The owner's own wording is a category request in its own right: the AI
    // guess on the listing is only a suggestion until an admin approves it.
    const requested = (input.requestedCategory || '').trim();
    if (requested && !approvedCats.some(x => x.name.toLowerCase() === requested.toLowerCase())) {
        await push('category', requested, '', `category: ${requested}`);
    }
    return created;
}
/** Admin WhatsApp notice for newly auto-created requests (null when none). */
function adminRequestNotice(businessName, businessCode, labels) {
    if (!labels.length)
        return null;
    return [
        '🆕 *New location/category request*',
        '',
        `Business: ${businessName} (${businessCode})`,
        ...labels.map(l => `• ${l}`),
        '',
        `Review: ${site_url_js_1.SITE_URL}/admin`,
    ].join('\n');
}
