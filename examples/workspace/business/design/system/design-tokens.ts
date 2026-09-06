// source: DESIGN.md; design-token-hash: 4c86cf0df4992ecd
export const designTokens = {
  "color": {
    "background": "#f7f3ec",
    "surface": "#fffdfa",
    "surfaceElevated": "#ffffff",
    "primary": "#0c7c59",
    "accent": "#ff6f5c",
    "text": "#161512",
    "muted": "#686159",
    "border": "#d8d0c3",
    "success": "#16784c",
    "warning": "#a05a00",
    "danger": "#b3261e"
  },
  "font": {
    "display": {
      "family": "Fraunces, Georgia, serif",
      "weight": "700"
    },
    "body": {
      "family": "Source Sans 3, Avenir Next, sans-serif",
      "weight": "400"
    }
  },
  "radius": {
    "sm": 4,
    "md": 8,
    "lg": 14
  },
  "space": {
    "xs": 4,
    "sm": 8,
    "md": 16,
    "lg": 24,
    "xl": 40
  },
  "motion": {
    "durationFast": 120,
    "durationBase": 220,
    "durationSlow": 360,
    "durationCelebrate": 500,
    "reducedMotionDuration": 0,
    "easing": [
      0.2,
      0,
      0,
      1
    ],
    "durationReveal": 600,
    "durationCinematic": 1200,
    "easingEmphasis": [
      0.16,
      1,
      0.3,
      1
    ],
    "easingSpring": [
      0.34,
      1.56,
      0.64,
      1
    ],
    "stagger": 60
  }
} as const;
