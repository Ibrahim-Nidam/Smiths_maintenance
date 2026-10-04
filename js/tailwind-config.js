// Loaded right after the Tailwind CDN script so utility classes match the design tokens.
tailwind.config = {
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#FF6A00', hover: '#E85F00', text: '#B93A00', tint: '#FFF1E6' },
        alert: { DEFAULT: '#B42318', tint: '#FEF3F2' },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
};
