"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPendingFeatureRequests = listPendingFeatureRequests;
exports.countPendingFeatureRequests = countPendingFeatureRequests;
exports.approveFeatureRequestById = approveFeatureRequestById;
exports.connectFeatureRequestToCategory = connectFeatureRequestToCategory;
exports.rejectFeatureRequestById = rejectFeatureRequestById;
exports.renderFeatureRequestList = renderFeatureRequestList;
const supabase_server_js_1 = require("./supabase-server.js");
const whatsapp_js_1 = require("./whatsapp.js");
const site_url_js_1 = require("./site-url.js");
const approved_data_js_1 = require("./approved-data.js");
const learned_js_1 = require("./learned.js");
async function listPendingFeatureRequests(limit = 20) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('feature_requests')
            .select('id, type, name, city, business_id, status, created_at, businesses(name, phone, slug)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(limit);
        return (data || []).map((r) => ({
            ...r,
            business_name: r.businesses?.name || 'unattached',
            business_phone: r.businesses?.phone || null,
            business_slug: r.businesses?.slug || null,
        }));
    }
    catch {
        return [];
    }
}
async function countPendingFeatureRequests() {
    try {
        const { count } = await (0, supabase_server_js_1.getSupabase)()
            .from('feature_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');
        return count || 0;
    }
    catch {
        return 0;
    }
}
async function loadRequest(id) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('feature_requests')
        .select('id, type, name, city, business_id, status, created_at')
        .eq('id', id)
        .maybeSingle();
    return data || null;
}
const TYPE_LABEL = {
    category: 'category',
    city: 'city / town',
    area: 'area',
};
/** Tell the owner what an admin decided. Best effort: never blocks the admin. */
async function notifyOwner(req, line) {
    if (!req.business_id)
        return;
    try {
        const { data: biz } = await (0, supabase_server_js_1.getSupabase)()
            .from('businesses')
            .select('phone, slug')
            .eq('id', req.business_id)
            .maybeSingle();
        if (!biz?.phone)
            return;
        const profile = biz.slug ? `${site_url_js_1.SITE_URL}/business/${biz.slug}` : site_url_js_1.SITE_URL;
        await (0, whatsapp_js_1.sendWhatsAppMessage)(biz.phone, `${line}\n\nYour listing: ${profile}`).catch(() => { });
    }
    catch {
        // best effort
    }
}
/**
 * Approve a request, optionally under a corrected name. Mirrors the web
 * action so the two entry points cannot drift: categories/areas/cities are
 * upserted, the business's array is rewritten, the request is closed.
 */
async function approveFeatureRequestById(id, correctedName) {
    const req = await loadRequest(id);
    if (!req)
        return { ok: false, error: 'Request not found.' };
    if (req.status !== 'pending')
        return { ok: false, error: `Already ${req.status}.` };
    const finalName = (correctedName || '').trim() || req.name;
    const supabase = (0, supabase_server_js_1.getSupabase)();
    if (req.type === 'category') {
        await supabase.from('categories').upsert({ name: finalName, active: true }, { onConflict: 'name' });
    }
    else if (req.type === 'area') {
        await supabase.from('areas').upsert({ city: req.city || '', name: finalName, active: true }, { onConflict: 'city,name' });
    }
    else if (req.type === 'city') {
        await supabase.from('cities').upsert({ name: finalName, active: true }, { onConflict: 'name' });
    }
    if (req.business_id) {
        const { data: biz } = await supabase
            .from('businesses')
            .select('category, areas, city, requested_category')
            .eq('id', req.business_id)
            .maybeSingle();
        if (biz) {
            if (req.type === 'city') {
                await supabase.from('businesses').update({ city: finalName }).eq('id', req.business_id);
            }
            else {
                const arrCol = req.type === 'category' ? 'category' : 'areas';
                const arr = req.type === 'category' ? (biz.category || []) : (biz.areas || []);
                let next = arr.map((n) => (n === req.name ? finalName : n));
                // A category held as 'Other' because nobody had approved the owner's
                // words: this approval IS that decision, so the placeholder goes.
                const provisional = (biz.requested_category || '').trim().toLowerCase();
                const replacesPlaceholder = req.type === 'category' && !!provisional && provisional === req.name.toLowerCase();
                if (replacesPlaceholder) {
                    next = next.filter((n) => n !== 'Other');
                    if (!next.includes(finalName))
                        next = [finalName, ...next];
                }
                await supabase
                    .from('businesses')
                    .update(replacesPlaceholder ? { [arrCol]: next, requested_category: '' } : { [arrCol]: next })
                    .eq('id', req.business_id);
            }
        }
    }
    await supabase
        .from('feature_requests')
        .update({ status: 'approved', corrected_name: finalName === req.name ? '' : finalName })
        .eq('id', req.id);
    await notifyOwner(req, `✅ Approved: *${finalName}* is now a valid ${TYPE_LABEL[req.type]} on WA Directory.`);
    return { ok: true, name: finalName, type: req.type };
}
/**
 * "Connect to" for a requested category: the owner's wording is not a new
 * category at all, it is another name for one we already have. Approving it as
 * a new category splits the directory ("Hardware" and "Hardware & Tools" are
 * the same shelf); connecting it files the listing under the existing category
 * AND records the wording as a learned alias, so the next person who types it
 * is matched automatically instead of raising another request.
 */
async function connectFeatureRequestToCategory(id, targetName) {
    const req = await loadRequest(id);
    if (!req)
        return { ok: false, error: 'Request not found.' };
    if (req.type !== 'category') {
        return { ok: false, error: `*${req.name}* is a ${TYPE_LABEL[req.type]} request - only categories can be connected.` };
    }
    if (req.status !== 'pending')
        return { ok: false, error: `Already ${req.status}.` };
    const target = (targetName || '').trim();
    if (!target)
        return { ok: false, error: 'Which existing category should it connect to?' };
    const approved = await (0, approved_data_js_1.getApprovedCategories)();
    const match = approved.find(c => c.name.toLowerCase() === target.toLowerCase());
    if (!match) {
        const close = approved
            .map(c => c.name)
            .filter(n => n.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(n.toLowerCase()))
            .slice(0, 5);
        return {
            ok: false,
            error: `*${target}* is not an approved category, so there is nothing to connect to.` +
                (close.length ? `\nClosest: ${close.join(', ')}` : '') +
                `\nUse *approve req* to create it instead.`,
        };
    }
    const canonical = match.name;
    const supabase = (0, supabase_server_js_1.getSupabase)();
    if (req.business_id) {
        const { data: biz } = await supabase
            .from('businesses')
            .select('category, requested_category')
            .eq('id', req.business_id)
            .maybeSingle();
        if (biz) {
            const current = biz.category || [];
            let next = current.map(n => (n === req.name ? canonical : n));
            const provisional = (biz.requested_category || '').trim().toLowerCase();
            const replacesPlaceholder = !!provisional && provisional === req.name.toLowerCase();
            if (replacesPlaceholder || current.length === 0) {
                next = next.filter(n => n !== 'Other');
                if (!next.some(n => n.toLowerCase() === canonical.toLowerCase()))
                    next = [canonical, ...next];
            }
            if (!next.some(n => n.toLowerCase() === canonical.toLowerCase()))
                next.push(canonical);
            await supabase
                .from('businesses')
                .update(replacesPlaceholder ? { category: next, requested_category: '' } : { category: next })
                .eq('id', req.business_id);
        }
    }
    // Remember the wording for every future listing, even if this request was
    // never attached to a business.
    const learned = await (0, learned_js_1.learnMapping)('category', req.name, canonical);
    await supabase
        .from('feature_requests')
        .update({ status: 'approved', corrected_name: canonical })
        .eq('id', req.id);
    await notifyOwner(req, `✅ Thanks! We've filed *${req.name}* under the existing *${canonical}* category on WA Directory, so buyers searching either word will find you.`);
    return { ok: true, name: canonical, alias: req.name };
}
async function rejectFeatureRequestById(id) {
    const req = await loadRequest(id);
    if (!req)
        return { ok: false, error: 'Request not found.' };
    if (req.status !== 'pending')
        return { ok: false, error: `Already ${req.status}.` };
    const supabase = (0, supabase_server_js_1.getSupabase)();
    if (req.business_id) {
        const { data: biz } = await supabase
            .from('businesses')
            .select('category, areas, city, requested_category')
            .eq('id', req.business_id)
            .maybeSingle();
        if (biz) {
            if (req.type === 'city') {
                await supabase.from('businesses').update({ city: '' }).eq('id', req.business_id);
            }
            else {
                const arrCol = req.type === 'category' ? 'category' : 'areas';
                const arr = req.type === 'category' ? (biz.category || []) : (biz.areas || []);
                const next = arr.filter((n) => n !== req.name);
                const provisional = (biz.requested_category || '').trim().toLowerCase();
                const clearsPlaceholder = req.type === 'category' && !!provisional && provisional === req.name.toLowerCase();
                await supabase
                    .from('businesses')
                    .update(clearsPlaceholder ? { [arrCol]: next, requested_category: '' } : { [arrCol]: next })
                    .eq('id', req.business_id);
            }
        }
    }
    await supabase.from('feature_requests').update({ status: 'rejected' }).eq('id', req.id);
    await notifyOwner(req, `Hi! We couldn't approve *"${req.name}"* as your ${TYPE_LABEL[req.type]}.\n\n` +
        'Please review your listing, or suggest a correction by contacting us.');
    return { ok: true, name: req.name, type: req.type };
}
/** The WhatsApp list an admin reads before approving. */
function renderFeatureRequestList(rows, total) {
    const lines = [`🗂 *Category & location requests* (${total})`, ''];
    rows.forEach((r, i) => {
        const where = r.type === 'area' && r.city ? ` · ${r.city}` : '';
        lines.push(`${i + 1}. [${r.type}] *${r.name}*${where}`);
        lines.push(`   ${r.business_name}`);
    });
    lines.push('', 'Reply *approve req 1* · *approve req 1 <correct name>* · *reject req 1*', 'Same as an existing category? *connect req 1 <existing category>* keeps the directory tidy.');
    return lines.join('\n');
}
