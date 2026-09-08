// source: DESIGN.md; design-token-hash: 158d186692209d33
abstract final class DesignTokens {
  static const color = <String, String>{"background": "#f7f3ec", "surface": "#fffdfa", "surfaceElevated": "#ffffff", "primary": "#0c7c59", "accent": "#ff6f5c", "text": "#161512", "muted": "#686159", "border": "#d8d0c3", "success": "#16784c", "warning": "#a05a00", "danger": "#b3261e"};
  static const fontFamily = <String, String>{"display": "Georgia", "body": "system-ui"};
  static const fontWeight = <String, String>{"display": "700", "body": "400"};
  static const nativeSize = <String, double>{"display": 32.0, "body": 16.0};
  static const lineHeight = <String, double>{"display": 1.2, "body": 1.5};
  static const nativeTracking = <String, double>{"display": 0.0, "body": 0.0};
  static const fontFallbacks = <String, List<String>>{"display": ["serif"], "body": ["sans-serif"]};
  static const radius = <String, double>{"sm": 4.0, "md": 8.0, "lg": 14.0};
  static const space = <String, double>{"xs": 4.0, "sm": 8.0, "md": 16.0, "lg": 24.0, "xl": 40.0};
  static const motionMilliseconds = <String, int>{"durationFast": 120, "durationBase": 220, "durationSlow": 360, "durationCelebrate": 500, "reducedMotionDuration": 0, "durationReveal": 600, "durationCinematic": 1200, "stagger": 60};
  static const motionEasing = <String, String>{"easing": "cubic-bezier(0.2, 0, 0, 1)", "easingEmphasis": "cubic-bezier(0.16, 1, 0.3, 1)", "easingSpring": "cubic-bezier(0.34, 1.56, 0.64, 1)"};
}
