# Specification: Unified User Navigation Architecture

## 1. Problem Statement
The current application features two separate navigation mechanisms:
1.  **User Dropdown** (triggered by Avatar): Contains Profile, Trips, Bookings, Dashboard.
2.  **Hamburger Menu** (Mobile/Desktop): Contains Trips, Experiences.

This creates redundancy (conflicting "My Trips" access points) and inconsistent user experience.

## 2. Proposed Solution
We will consolidate all navigation into a **Single Source of Truth**: the **User Menu**. 
The standalone Hamburger menu will be **removed**. The User Avatar will become the primary navigation anchor for all application routes when logged in.

## 3. Architecture

### 3.1 Data Source
Define a centralized configuration for navigation items to ensure consistency.

```typescript
// config/navigation.ts
export const NAV_ITEMS = [
  { label: 'My Trips', href: '/trips', icon: MapIcon },
  { label: 'My Experiences', href: '/experiences', icon: SparklesIcon }, // Unified entry for Host features
];
```

### 3.2 Responsive Component: `<UnifiedUserMenu />`
The component will adapt its presentation based on the device context, providing a premium feel.

#### Desktop View
*   **Trigger**: User Avatar.
*   **Pattern**: Floating **Popover/Dropdown** (existing behavior, refined).
*   **Content**: Compact list of links + Sign Out.

#### Mobile View
*   **Trigger**: User Avatar (Same).
*   **Pattern**: **Bottom Sheet** or **Full-Screen Overlay**.
    *   *Why?* Dropdowns are poor UX on mobile. A Sheet/Overlay feels native and offers larger touch targets.
*   **Content**:
    *   Large User Header (Avatar + Name + Email).
    *   Large Navigation Links with Icons.
    *   Prominent Sign Out button.

### 3.3 State Management
*   **Logged Out**: Show "Sign In" / "Get Started". No Menu. (If public pages exist later, we can re-introduce a lightweight generic menu, but for current App-state, keeping it minimal is cleaner).
*   **Logged In**: Show Avatar. Clicking it opens the unified menu.

## 4. Implementation Steps

1.  **Refactor `UserMenu`**:
    *   Import `NAV_ITEMS`.
    *   Implement the Responsive logic (CSS media queries or simple conditional rendering if using a Sheet component).
    *   *MVP Approach*: Stick to the Dropdown for now but style it to be wider/friendlier on mobile, OR strictly remove the generic Hamburger and force everything into the existing Dropdown structure, ensuring all links are present.
2.  **Update `Navbar`**:
    *   **REMOVE**: The `Menu01Icon` button and its associated `isMobileMenuOpen` state.
    *   **Simplify**: The Navbar becomes just `Logo <-> [Chat] [UserAvatar]`.

## 5. Visual Polish
*   Ensure the consolidated menu is visually distinct and handles the "Host" vs "Guest" link logic correctly (though currently everyone can see 'My Experiences').

## 6. Verification
*   Verify accessing "My Trips" works from the Avatar.
*   Verify "Sign Out" is easily accessible.
*   Verify mobile layout doesn't break when opening the menu.
