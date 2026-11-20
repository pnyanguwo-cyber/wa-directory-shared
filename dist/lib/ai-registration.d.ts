/**
 * AI-assisted business registration — shared extraction service.
 *
 * A business owner uploads a banner, flyer, poster, business card, menu or
 * logo. This module turns it into an editable, provenance-tracked draft. It
 * never creates a business: the owner reviews the prefilled form and submits
 * through the existing `/api/businesses/create` pipeline, so verification,
 * payment and activation rules stay authoritative.
 *
 * The WhatsApp bot imports the same functions from @wa-directory/shared.
 */
export declare const AI_REGISTRATION_MODEL: string;
export type FieldSource = 'uploaded_material' | 'existing_account' | 'user_answer' | 'system_derived';
export type FieldStatus = 'suggested' | 'missing';
export interface ExtractedField {
    value: string;
    confidence: number;
    source: FieldSource;
    evidence: string;
    needs_confirmation: boolean;
    status: FieldStatus;
}
export interface RegistrationFields {
    business_name: ExtractedField;
    legal_name: ExtractedField;
    category: ExtractedField;
    description: ExtractedField;
    phone: ExtractedField;
    whatsapp: ExtractedField;
    phone_is_whatsapp: ExtractedField;
    email: ExtractedField;
    website: ExtractedField;
    address: ExtractedField;
    city: ExtractedField;
    area: ExtractedField;
    opening_hours: ExtractedField;
    offerings: {
        value: string[];
        confidence: number;
        source: FieldSource;
        evidence: string;
    };
    socials: {
        value: Record<string, string>;
        confidence: number;
        source: FieldSource;
        evidence: string;
    };
    has_logo: {
        value: boolean;
        confidence: number;
        evidence: string;
    };
}
export interface RegistrationDraft {
    fields: RegistrationFields;
    missing_required_fields: string[];
    next_questions: string[];
    warnings: string[];
    model: string;
    analysed_at: string;
}
export declare function nextQuestionsFor(category: string, missing: string[]): string[];
export interface AnalyseMaterialResult {
    ok: true;
    draft: RegistrationDraft;
}
export type AnalyseMaterialOutcome = AnalyseMaterialResult | {
    ok: false;
    reason: 'no_key' | 'no_images' | 'model_failed';
};
/**
 * Analyses 1..n images as ONE registration draft (front/back of a business
 * card, banner + flyer). Conflicting values are reported, not silently merged.
 */
export declare function analyseBusinessMaterial(images: Uint8Array[], categories: string[]): Promise<AnalyseMaterialOutcome>;
export declare function missingRequiredFields(fields: RegistrationFields): string[];
/** The subset the web form can prefill without asking the owner to re-type. */
export interface RegistrationPrefill {
    name: string;
    description: string;
    phone: string;
    whatsapp_username: string;
    website: string;
    address: string;
    city: string;
    categories: string[];
    opening_hours: string;
    offerings: string[];
    phone_is_whatsapp: boolean;
}
export declare function toPrefill(draft: RegistrationDraft): RegistrationPrefill;
/**
 * Duplicate candidates. Shows possible matches; never merges, never claims
 * ownership and never blocks submission — the existing registration flow and
 * admin verification decide.
 */
export declare function findDuplicateCandidates(params: {
    name: string;
    phone: string;
    city?: string;
}): Promise<Array<{
    id: string;
    name: string;
    slug: string;
    city: string;
    phone: string;
}>>;
export declare function saveRegistrationDraft(params: {
    draft: RegistrationDraft;
    sourceImageUrls?: string[];
    duplicateCandidates?: unknown[];
    createdByBusinessId?: string | null;
    channel?: 'web' | 'whatsapp';
}): Promise<string | null>;
//# sourceMappingURL=ai-registration.d.ts.map