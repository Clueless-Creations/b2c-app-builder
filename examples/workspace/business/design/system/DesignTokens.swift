// source: DESIGN.md; design-token-hash: 158d186692209d33
import Foundation

enum DesignTokens {
  enum Color {
    static let background = "#f7f3ec"
    static let surface = "#fffdfa"
    static let surfaceElevated = "#ffffff"
    static let primary = "#0c7c59"
    static let accent = "#ff6f5c"
    static let text = "#161512"
    static let muted = "#686159"
    static let border = "#d8d0c3"
    static let success = "#16784c"
    static let warning = "#a05a00"
    static let danger = "#b3261e"
  }
  enum Font {
    static let displayFamily = "Georgia"
    static let displayWeight = "700"
    static let displaySize: Double = 32
    static let displayLineHeight: Double = 1.2
    static let displayTracking: Double = 0
    static let displayFallbacks = ["serif"]
    static let bodyFamily = "system-ui"
    static let bodyWeight = "400"
    static let bodySize: Double = 16
    static let bodyLineHeight: Double = 1.5
    static let bodyTracking: Double = 0
    static let bodyFallbacks = ["sans-serif"]
  }
  enum Radius {
    static let sm: Double = 4
    static let md: Double = 8
    static let lg: Double = 14
  }
  enum Space {
    static let xs: Double = 4
    static let sm: Double = 8
    static let md: Double = 16
    static let lg: Double = 24
    static let xl: Double = 40
  }
  enum Motion {
    static let durationFast: Double = 0.12
    static let durationBase: Double = 0.22
    static let durationSlow: Double = 0.36
    static let durationCelebrate: Double = 0.5
    static let reducedMotionDuration: Double = 0
    static let easing = "cubic-bezier(0.2, 0, 0, 1)"
    static let durationReveal: Double = 0.6
    static let durationCinematic: Double = 1.2
    static let easingEmphasis = "cubic-bezier(0.16, 1, 0.3, 1)"
    static let easingSpring = "cubic-bezier(0.34, 1.56, 0.64, 1)"
    static let stagger: Double = 0.06
  }
}
