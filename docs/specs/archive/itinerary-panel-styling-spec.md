# Implementation Spec — Itinerary Panel Styling Refactor

Date: 2026-02-03
Owner: Design Systems Engineer
Status: Ready for Implementer

## 1. Scope

### In Scope
- **Component**: `src/components/features/itinerary-day.tsx` (`ItineraryDayColumn`).
- **Styles**: Refactoring hardcoded `text-white`, `bg-white/...`, and `border-white/...` utilities to use semantic CSS variables defined in global theme.
- **Theme Support**: Ensuring high contrast and legibility in both Light (`--background: #f8fcfd`) and Dark (`--background: #011627`) modes.

### Excluded
- Logic changes to drag-and-drop or event handling.
- Refactoring `globe-itinerary.tsx` parent layout (unless strictly necessary for panel width/positioning).
- Changes to the "Add to Day" logic itself (only the button rendering).

## 2. Current State

- **Hardcoded Values**: The component currently uses `bg-white/10`, `text-white`, and `border-white/20`.
- **Light Mode Failure**: In Light Mode, the app background is `#f8fcfd` (near white). White text on a white transparent background is invisible or extremely low contrast.
- **Dark Mode Reliance**: The current styles assume a dark background (overlay style) which conflicts with the actual CSS variable theme system.
- **"Add Activity" Visibility**: The button uses `text-[var(--muted-foreground)]` but with a `border-white/10`, making it barely visible in light mode.

## 3. Desired Behavior

- **Card Styling**:
    - Background: `bg-[var(--card)]`
    - Text: `text-[var(--foreground)]` (Primary) and `text-[var(--muted-foreground)]` (Secondary).
    - Border: `border-[var(--border)]`.
- **Active States**:
    - Hover: `hover:bg-[var(--muted)]/10` or `hover:border-[var(--ring)]`.
    - Active Day: Distinct border or background accent using `var(--primary)` or `var(--accent)`.
- **"Add Activity" Button**:
    - Should look like a dashed "slot" that is clearly interactive.
    - Styles: `border-[var(--border)] border-dashed hover:bg-[var(--secondary)]/10 hover:text-[var(--secondary)]`.

## 4. Constraints (Non-Negotiable)

- **Semantic Tokens ONLY**: Do not use `white`, `zinc-900`, `gray-200` etc. Use only `var(--card)`, `var(--foreground)`, `var(--border)`, `var(--muted)`, etc.
- **Tailwind Classes**: Use the arbitrary value syntax `[var(--token)]` or the `@theme` mapped classes if available (e.g., `bg-card`, `text-foreground`).
- **Accessibility**: Text contrast must meet WCAG AA standards (4.5:1).
- **Files**: Modify `src/components/features/itinerary-day.tsx`.

## 5. Interfaces & Contracts

### CSS Variables (ReadOnly)
- `--card`: Background for the item/day container.
- `--foreground`: Main text color.
- `--muted-foreground`: Metadata text color.
- `--border`: Divider and container border color.
- `--princeton-orange`: Active/Highlight accent.

## 6. Testing Requirements

### Visual Verification
- **Light Mode**: Verify "Day 1" header is dark text on light background. verify "Add Activity" button is clearly visible dashed outline.
- **Dark Mode**: Verify "Day 1" header is light text on dark background.
- **Itinerary Items**: Verify the cards separate clearly from the background canvas.

### Unit Tests
- N/A (CSS visual changes primarily, unless snapshot tests exist. If snapshots exist, update them).

## 7. Out-of-Scope

- Redesigning the "Timeline" view (the horizontal strip in `globe-itinerary`). This spec affects the vertical "Day Column" only.
