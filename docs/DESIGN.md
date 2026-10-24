# Design system

Direction: neutral slate surfaces, one steel-blue accent, semantic status colors. Top bar navigation, drawer nav on phones. Light and dark mode with equal contrast. No emojis, no gradients, no pill shapes.

## Color

- Accent `#1c66a8` (dark mode `#4f9bdd`) is used for primary buttons, the active nav underline, focus rings, links and the brand mark. White text sits on it in light mode; dark mode uses near-black text on the lighter accent.
- Alert color `#b3261e` is used only for things that need attention: down, errors, destructive actions.
- Status colors: success `#16794a`, warning `#96620a`, danger `#b3261e`. Normal states (operational, installed) are neutral badges, never colored.
- Page background `#f4f6f9` light / `#0d1117` dark. Panels are `#ffffff` light / `#161b22` dark. Text: `#10151c` / `#e6edf3` primary, `#5b6675` / `#9aa7b4` secondary, `#7d8794` / `#767f8b` muted.
- All body text and status colors are checked to at least 4.5:1 contrast in both modes.

## Typography

- Fonts: IBM Plex Sans for the interface, IBM Plex Mono only for part numbers, serial numbers and codes. Mono identifiers are never bold (normal weight), bold is reserved for labels and names.
- 16px base text (also applied to inputs on phones so iOS does not zoom), 13px secondary text, 12px captions.

## Shape and depth

- 5px radius on every element: buttons, inputs, badges, panels, modals, toasts. No pill shapes.
- Flat look: 1px borders do the separating. Shadows are reserved for the modal, toast and top bar.
- Controls are 36px high (32px for compact buttons), 44px minimum touch target on phones.

## Layout

- Utility classes in `css/app.css` (`.row`, `.stack`, `.grid-1-1`, `.grid-3-1`, `.panel`, `.stats`, `.badge-*`, ...) replace framework utilities.
- Breakpoints: 1000px (dense pages), 900px (nav collapses to a drawer), 640px (tables tighten, modal becomes a bottom sheet), 420px (stat cards stack).
- Tables stay horizontally scrollable (`.table-wrap`) rather than reflowing.

## Theme

- `js/components/theme-toggle.js` writes `data-theme="dark"` on `<html>`; every color comes from CSS custom properties, so one token set drives both modes.
- `prefers-reduced-motion` disables transitions.

Reference page: open `#/styleguide` while signed in.

Component classes live in `css/app.css`; helpers in `js/components/ui.js`.
