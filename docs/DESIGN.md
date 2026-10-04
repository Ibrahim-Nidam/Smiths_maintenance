# Design system

Direction: black and white, one action color (safety orange), one alert color (red). Top bar navigation. Comfortable density.

- Text is true black on white. Secondary text is gray `#71717A`. Borders are 1px `#E4E4E7`. No shadows, no gradients.
- Action color `#FF6A00` is used for primary buttons, the active nav underline, focus rings and the brand mark. Text on it is black (white text fails contrast on this orange). Orange text on white uses the darker `#B93A00`.
- Alert color `#B42318` is used only for things that need attention: down, RMA pending, low stock, errors, destructive actions.
- Normal states (operational, installed) are neutral gray badges, never colored.
- Fonts: IBM Plex Sans for the interface, IBM Plex Mono only for part numbers and serial numbers.
- Shape: 6px radius, 44px control height, 16px base text, 16 to 24px spacing inside panels.
- Reference page: open `#/styleguide` while signed in.

Component classes live in `css/app.css`; helpers in `js/components/ui.js`.
