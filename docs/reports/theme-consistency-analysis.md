# Analysis: Theme Consistency & Color Usage

## 1. Executive Summary
The codebase suffers from fragmented color usage, mixing legacy variable names (`--sunset-orange`) with new brand names (`--princeton-orange`) and raw utility values. This leads to visual inconsistencies, especially in dark mode where legacy variables often lack proper overrides or contrast checks.

## 2. Findings

### 2.1 Legacy Variable Proliferation (`--sunset-orange`)
- **Issue**: The variable `--sunset-orange` is used directly in **15+ components**, including buttons, filters, booking widgets, and profile cards.
- **Source**: `globals.css` maps it: `--sunset-orange: var(--princeton-orange);`.
- **Impact**: While it fundamentally resolves to the correct orange, using the legacy name bypasses the semantic abstraction layer (`--primary`, `--accent`) intended for theming.

### 2.2 Hardcoded Button Styles
- **Issue**: User noted `w-8 h-8 rounded-full bg-[var(--sunset-orange)]`.
- **Locations Identified**:
  - `booking-summary.tsx`
  - `user-menu.tsx`
  - `experience-card.tsx`
  - `host-profile-card.tsx`
- **Problem**: These inline styles are repetitive and hardcoded. They should use a shared component or utility class (e.g., `Avatar` or `Badge`) that uses semantic colors (`bg-[var(--primary)]`).

### 2.3 Booking Dialog Anomalies
- **Observation**: The User reported colors seem "off" on the Booking Dialog.
- **Cause**: The dialog likely mixes `bg-white` (hardcoded) with text colors that rely on CSS variables which might change in Dark Mode, or conversely, uses brand colors that vibrate against the background without proper semantic tokens.
  - *Example*: `text-amber-500` is used for stars, which is a Tailwind utility, not a CSS variable like `--amber-flame`.

### 2.4 Semantic vs. Raw Value Mismatch
- **Proper Pattern**: `bg-[var(--background)]`, `text-[var(--foreground)]` (Used in layout).
- **Anti-Pattern**: `bg-[var(--sunset-orange)]` (Used in components).
- **Recommendation**: Components should point to `--primary`, `--secondary`, `--accent`, or `--muted`. `globals.css` should then map those semantics to the brand palette (e.g., `--primary: var(--princeton-orange)`).

## 3. Recommendations

### 3.1 Refactor Strategy
1. **Consolidate Legacy Variables**: Replace all instances of `var(--sunset-orange)` with `var(--primary)` or `var(--princeton-orange)` (if it's a brand-specific use).
2. **Standardize Hardcoded Circles**: Extract the "rounded-full flex-center" pattern into a reusable UI component (`CircleIcon` or similar).
3. **Audit Dark Mode**: Ensure brand colors like Princeton Orange have appropriate contrast ratios on dark backgrounds.

### 3.2 Specific Fixes (Spec Required)
- Update `globals.css` to deprecate `sunset-orange` (comment out to find breakages or keep as alias but do not use).
- Refactor circular icons in `booking-summary.tsx` and others to use `bg-[var(--primary)]`.
