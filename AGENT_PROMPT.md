# Agent Prompt: Complete @wa-directory/shared Package Build

## Current State

The shared package at `C:/Users/cyberstream/Documents/wa-directory-shared` has been created with ~25 shared libraries copied from the webapp. TypeScript build fails with the following errors:

### Remaining TypeScript Errors (as of last check):

1. **`approved-data.ts`** - Imports `next/cache` and uses `@/lib/supabase-server` path alias
2. **`business-auth.ts`** - Imports `next/headers` and uses `@/lib/phone` path alias
3. **`category-style.ts`** - Needs `@types/react` for React namespace types (partial fix done)
4. **`listing-create.ts`** - Uses relative imports `../../data/...` instead of path aliases; has dynamic imports of chatbot-specific `@/lib/whatsapp` (lines 253, 274)
5. **`listing-pay.ts`** - Imports chatbot-specific modules (`@/lib/paynow`, `@/lib/payment-events`, `@/lib/whatsapp`) and `next/server`
6. **`site-content.ts`** - Uses `@/lib/site-design` and `@/types` path aliases; needs `.js` extensions for NodeNext
6. **`site-fonts.ts`** - Imports `next/font/google`
7. **`site-design.ts`** - Uses `@/types` path alias
8. **`org-auth.ts`** - Uses `@/lib/business-auth`, `@/lib/supabase-server`, `@/types`, `@/lib/utils`, `@/lib/org-auth` path aliases
9. **`portal.ts`** - Uses `@/lib/business-auth`, `@/lib/supabase-server`, `@/types`, `@/lib/stats-format`, `@/lib/org-auth` path aliases
10. **`ranking.ts`** - Uses `@/lib/supabase-server`, `@/types` path aliases
11. **`business-select.ts`** - Uses `@/lib/supabase-server`, `@/types` path aliases
12. **`image-storage.ts`** - Uses `@/lib/supabase-server` path alias
13. **`track.ts`** - Uses `window`/`navigator` globals (browser-only)

## Root Cause

The original webapp uses `@/*` path aliases resolved by Next.js. In the shared package with `moduleResolution: NodeNext`, these aliases don't work. Also, several "shared" libraries actually import **chatbot-specific** modules:
- `listing-create.ts` → `whatsapp.ts` (dynamic imports for Yellow Pages admin notifications)
- `listing-pay.ts` → `paynow.ts`, `payment-events.ts`, `whatsapp.ts` (payment flow)
- `listing-activation.ts` → `whatsapp.ts`, `bot-templates.ts`, `bot-settings.ts` (activation notifications)

## Required Fixes

### 1. Convert path aliases to relative imports with `.js` extensions
All `@/lib/xyz` → `./xyz.js`, `@/data/xyz` → `../data/xyz.js`, `@/types` → `../types/index.js`

### 2. Dependency Injection for Chatbot-Specific Modules
Refactor the three affected files to accept notification/sending functions as parameters:
- `listing-create.ts`: Add optional `notifyAdmin?`, `notifyUser?` callbacks
- `listing-pay.ts`: Add `sendWhatsApp?`, `initiateEcoCash?`, `logPaymentEvent?` callbacks
- `listing-activation.ts`: Add `sendWhatsApp?`, `renderTemplate?`, `getSettings?` callbacks

### 3. Handle Next.js Imports
- `approved-data.ts`: Remove `unstable_cache` (server-only), use simple in-memory cache or pass cache fn
- `business-auth.ts`: Remove `next/headers` cookies - pass cookie getter/setter functions
- `site-fonts.ts`: Move to webapp-only (not shared) or export font config objects only

### 4. Browser Globals in `track.ts`
Guard `window`/`navigator` with `typeof window !== 'undefined'` checks.

## Files That Should NOT Be in Shared Package
These are webapp-only:
- `site-fonts.ts` (uses `next/font/google`)
- `approved-data.ts` (uses `next/cache`)
- `business-auth.ts` (uses `next/headers`)
- Any file importing Next.js server APIs

## Verification
Run: `cd C:/Users/cyberstream/Documents/wa-directory-shared && npx tsc --noEmit`

Build should pass with zero errors.

## Key Files to Reference (originals in webapp)
- `C:/Users/cyberstream/Documents/wa.directory/lib/listing-create.ts` (12671 bytes)
- `C:/Users/cyberstream/Documents/wa.directory/lib/listing-pay.ts` (8508 bytes)
- `C:/Users/cyberstream/Documents/wa.directory/lib/listing-activation.ts` (check original)
- `C:/Users/cyberstream/Documents/wa.directory/lib/approved-data.ts`
- `C:/Users/cyberstream/Documents/wa.directory/lib/business-auth.ts`
- `C:/Users/cyberstream/Documents/wa.directory/lib/site-fonts.ts`