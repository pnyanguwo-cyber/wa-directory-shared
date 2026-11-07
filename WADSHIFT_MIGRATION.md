# WADSHIFT Migration: Separating Chatbot from Webapp

## Overview

This document captures the migration steps performed to separate the WhatsApp chatbot from the Next.js web application into independent repositories, connected via a shared npm package (`@wa-directory/shared`).

## Completed Steps

### 1. Analysis & Planning
- Analyzed the monolithic `wa.directory` codebase
- Identified 23 shared libraries that could be extracted
- Identified 20+ chatbot-specific modules
- Created implementation plan with dependency injection strategy

### 2. Created Shared Package Structure

**Location:** `C:/Users/cyberstream/Documents/wa-directory-shared/`

#### Package Configuration
- Created `package.json` with:
  - Name: `@wa-directory/shared`
  - Exports map for `lib/*`, `data/*`, `types/*`
  - Dependencies: `@supabase/supabase-js`, `lucide-react`, `next`, `react`, `sharp`

#### TypeScript Configuration
- Created `tsconfig.json` with:
  - `target: ES2022`
  - `module: NodeNext`
  - `moduleResolution: NodeNext`
  - Added `DOM` lib for browser globals

### 3. Fixed Cross-Dependencies with Dependency Injection

Several "shared" files actually imported chatbot-specific modules. Fixed via:

| File | Chatbot Imports Removed | Adapters Added |
|------|------------------------|----------------|
| `listing-create.ts` | `whatsapp.ts`, `paynow.ts`, `payment-events.ts` | `ChatbotAdapters` |
| `listing-pay.ts` | `paynow.ts`, `payment-events.ts`, `whatsapp.ts` | `PaymentAdapters` |
| `site-generation.ts` | `ai-cache.ts`, `gemini.ts` | `SiteContentGenerator` |
| `site-content.ts` | AI cache/gemini imports | `SiteGeneratorAdapters` |
| `approved-data.ts` | `next/cache` | `CacheAdapter` with in-memory fallback |
| `business-auth.ts` | `next/headers` (cookies) | `CookieAdapterLike` |
| `org-auth.ts` | Updated imports to use new `CookieAdapterLike` |
| `portal.ts` | Updated imports, added optional cookie param |

### 4. Converted Path Aliases to Relative Imports

All `@/lib/xyz` → `./xyz.js` with `.js` extensions for NodeNext compatibility.

Example:
```typescript
// Before
import { getSupabase } from '@/lib/supabase-server'

// After
import { getSupabase } from './supabase-server.js'
```

### 5. Removed Next.js-Specific Files

- Removed `site-fonts.ts` (uses `next/font/google`) - stays in webapp

### 6. Added Type Exports

- Exported `StatsEventType` from `types/index.ts` for use by `track.ts`

### 7. Created Entry Point

**`index.ts`** - Re-exports all public APIs:
```typescript
export * from './lib/listing-create'
export * from './lib/listing-pay'
// ... etc
export * from './types/index'
```

### 8. Built Successfully

```bash
npm run build  # ✅ TypeScript compiles with 0 errors
```

### 9. Published to GitHub

- Repository: `https://github.com/pnyanguwo-cyber/wa-directory-shared` (Private)
- All 36 files committed with proper structure

### 10. Updated Webapp to Use Shared Package

**File:** `wa.directory/package.json`
```json
{
  "dependencies": {
    "@wa-directory/shared": "file:../wa-directory-shared"
  }
}
```

**Result:** TypeScript check passes ✅

---

## What's Next (Remaining Steps)

### Phase 2: Extract Chatbot to Separate Repository

**Goal:** Create `wa-directory-bot` repository containing the webhook handler

#### Tasks:
1. [ ] Copy bot-specific modules from `wa.directory/lib/` to `wa-directory-bot/src/lib/`:
   - `whatsapp.ts` (16,366 lines)
   - `bot-templates.ts` (32,865 lines)
   - `chat-session.ts` (10,678 lines)
   - `intent-pivot.ts`
   - `gemini.ts`
   - `bot-sense.ts`
   - `order-intake.ts`
   - `orders.ts`
   - `needs.ts`
   - `paynow.ts`
   - `payment-events.ts`
   - `listing-intake.ts`
   - `listing-activation.ts`
   - `listing-ai.ts`
   - `pay-lookup.ts`
   - `radar.ts`
   - `casts.ts`
   - `bot-contacts.ts`
   - `bot-log.ts`
   - `bot-settings.ts`
   - `ai-cache.ts`
   - `admin-verify.ts`
   - `emergency.ts`
   - `session-sync.ts`
   - `pay-simulation.ts`

2. [ ] Create `wa-directory-bot/src/index.ts` - Vercel function entry point
3. [ ] Structure as:
   ```
   wa-directory-bot/
   ├── src/
   │   ├── flows/          # search, registration, payment, orders, needs, admin, media
   │   ├── session/        # ChatSession CRUD
   │   ├── templates/      # Message rendering
   │   ├── integrations/   # whatsapp, ecocash, gemini
   │   └── shared/         # Re-exports from @wa-directory/shared
   └── package.json
   ```

4. [ ] Add `@wa-directory/shared` as dependency

### Phase 3: Clean Up Webapp

1. [ ] Remove all bot-specific files from `wa.directory/lib/`
2. [ ] Update all imports to use `@wa-directory/shared/*`
3. [ ] Remove unused dependencies
4. [ ] Verify webapp build still passes

### Phase 4: Operational Improvements

1. [ ] Set up CI/CD for `wa-directory-shared` (GitHub Actions → GitHub Packages)
2. [ ] Set up CI/CD for `wa.directory` (GitHub Actions → Vercel)
3. [ ] Set up CI/CD for `wa-directory-bot` (GitHub Actions → Vercel Functions)
4. [ ] Add Sentry/Rollbar for error tracking
5. [ ] Add structured logging (Pino/Winston)

---

## Key Design Decisions

1. **Dependency Injection:** Chatbot-specific functions passed as adapters to shared libraries, keeping the shared package free of chatbot dependencies

2. **Browser API Guards:** `track.ts` guards `window`/`navigator` with `typeof window !== 'undefined'`

3. **Optional Adapters:** All adapter parameters are optional, with sensible fallbacks

4. **Type Safety:** Full TypeScript support with `.d.ts` declaration files exported

5. **Private Repository:** Shared package kept private due to sensitive code (Supabase service role, WhatsApp API keys, payment integration)