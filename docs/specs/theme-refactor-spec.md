# Technical Specification: Theme Standardization & Legacy Cleanup

## 1. Scope
- **Global CSS**: `src/app/globals.css`
- **Components**: All components currently using `var(--sunset-orange)` or hardcoded hex values for brand colors.
- **Goal**: Standardize on semantic tokens (`primary`, `secondary`, `accent`, `muted`) and strict brand tokens (`princeton-orange`, `blue-green`).

## 2. Current State
- `globals.css` defines new brand colors (`princeton-orange`) but maps legacy `sunset-orange` to them.
- Components improperly use the legacy variable name `sunset-orange` (15+ occurrences).
- Components use `bg-[var(--sunset-orange)]` directly instead of semantic `bg-primary`.
- Hardcoded styles like `w-8 h-8 rounded-full bg-[var(--sunset-orange)]` are copied across multiple files.

## 3. Desired Behavior
1. **Semantic Usage**: UI elements should use semantic tokens where possible (e.g., `bg-primary`, `text-primary`).
2. **Explicit Branding**: If specific brand color is needed, use the modern name `princeton-orange`, not the legacy `sunset-orange`.
3. **Legacy Removal**: Remove the `sunset-orange` variable mapping from `globals.css` to prevent future regressions (after refactor).

## 4. Constraints
- **Visual Parity**: The actual color values must NOT change (Princeton Orange #fb8500). Only the variable references change.
- **Dark Mode**: Semantic tokens usually handle dark mode better (via redefinition in `@media`). Direct brand colors must be checked for contrast.

## 5. Implementation Plan

### 5.1 CSS Refactor (`globals.css`)
1. Ensure `--primary` maps to `var(--princeton-orange)`.
2. Ensure `--secondary` maps to `var(--blue-green)`.
3. (Optional) Mark `--sunset-orange` as deprecated or move to a "Legacy" section at the bottom.

### 5.2 Component Refactor (Batch 1)
Replace `[var(--sunset-orange)]` with `primary` or `[var(--princeton-orange)]`:
- `booking-dialog.tsx`
- `booking-summary.tsx`
- `experience-card.tsx`
- `host-card.tsx`
- `host-profile-card.tsx`
- `payment-form.tsx`
- `ui/button.tsx` (Critical: Base component)

### 5.3 Pattern Refactor
- Where `rounded-full bg-[var(--sunset-orange)]` exists:
  - If it's a star/rating icon: Use `text-amber-500` or `text-accent`.
  - If it's an avatar/initial: Consider creating `<AvatarPlaceholder />` or standardizing classes.

## 6. Testing Requirements
### Visual Regression
- Check **Buttons** (Primary orange calls to action).
- Check **Experience Cards** (Rating stars, hover effects).
- Check **Booking Dialog** (Header, icons).
- Verify no "broken CSS variable" (transparent/black) results appearing.
