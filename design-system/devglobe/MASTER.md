# DevGlobe Design System

## Product Direction

DevGlobe is an operational developer-discovery tool built around a live global graph. Interfaces should feel precise, connected, and work-focused. Keep the globe or current task visually dominant; supporting UI stays compact and quiet.

## Foundations

Use the semantic custom properties in `styles/main.css`. Do not introduce raw colors, spacing values, radii, shadows, or font families when an existing token fits.

### Color

- Canvas: `--bg-primary`
- Raised surface: `--bg-secondary`
- Component surface: `--bg-card`
- Interactive surface: `--bg-hover`
- Primary, secondary, muted text: `--text-primary`, `--text-secondary`, `--text-muted`
- Primary action and selection: `--accent-blue`
- Focus: `--focus-ring`
- Success and GitHub: `--accent-github`
- Stack Overflow: `--accent-so`
- Danger: `--danger`
- Dividers and control borders: `--border`

Color must not be the only indicator of status. Maintain at least 4.5:1 contrast for body text and 3:1 for large text and controls.

### Typography

- Use Manrope for product UI, headings, and body copy.
- Use a system monospace stack only for code, identifiers, and machine-readable values.
- Use sentence case for headings, labels, and actions.
- Keep body copy at least 12px in dense metadata and 14px elsewhere.
- Keep readable prose below 80 characters per line.
- Do not use letter spacing below `0` or decorative all-caps labels.

### Shape, Spacing, and Elevation

- Spacing scale: `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-6`
- Small controls and indicators: `--radius-sm`
- Controls and standard components: `--radius`
- Dialogs and major panels: `--radius-lg`
- Avatars and true pills only: `--radius-pill`
- Standard controls: `--control-height`
- Use `--shadow` for floating controls and `--shadow-strong` for dialogs only.
- Do not place cards inside cards. Use dividers and spacing for hierarchy within panels.

## Components

### Buttons

- Use `.btn` as the shared base.
- Use icon-only buttons for familiar actions and provide `aria-label` and `title`.
- Use text or icon plus text for commands whose outcome is not obvious.
- Keep action names consistent through confirmation and success states.
- Disabled controls remain legible and use `cursor: not-allowed`.

### Panels and Dialogs

- Use the existing panel background variables for transparency and theming.
- Dialogs need a labelled heading, close button, focus management, Escape support, and contained overscroll.
- Empty and error states must explain the next useful action.

### Forms and Search

- Every control needs a visible label or accessible name.
- Use the correct input type, `name`, `autocomplete`, and `spellCheck` settings.
- Keep errors beside the relevant field and announce asynchronous updates with `aria-live="polite"`.
- Compound controls use `:focus-within`; individual controls use the global `:focus-visible` ring.

## Interaction

- Use semantic `button` elements for actions and links for navigation.
- Interactive targets are at least 40px and expand to 44px on touch layouts.
- Hover increases contrast. Focus is always visible.
- Animate only `transform` and `opacity` where practical.
- Respect `prefers-reduced-motion`; never require motion to understand a state change.
- Stateful filters, tabs, and selections should be deep-linkable when they represent a shareable view.

## Responsive Behavior

- Validate at 375px, 768px, 1024px, and 1440px.
- Fixed-format controls need stable dimensions and must not shift when labels or loading states change.
- Text-bearing flex children use `min-width: 0` and appropriate wrapping or truncation.
- Full-bleed surfaces account for safe-area insets.

## Agent Checklist

Before completing UI work:

1. Reuse existing components and semantic tokens.
2. Test keyboard navigation and visible focus.
3. Test dark and light themes.
4. Test 375px and 1440px viewports for overflow and overlap.
5. Honor reduced motion.
6. Run `npm run build`.
7. Capture screenshots of changed views and inspect them for clipping, layout shifts, and inconsistent controls.