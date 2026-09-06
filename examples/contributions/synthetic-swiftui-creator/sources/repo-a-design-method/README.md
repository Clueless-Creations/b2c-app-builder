SYNTHETIC FIXTURE: not a real creator's repository

# Layered depth: a SwiftUI visual critique method

A three-heuristic method for judging depth in SwiftUI screens. It exists so the
contribution example has a method to adapt. No real creator wrote it.

## Heuristics

1. **Depth comes from layers, not shadows.** Stack surfaces with distinct tones
   and let the offset between layers carry the depth. Use flat shadows only: one
   shadow, zero blur, one point of offset. A blurred shadow hides the layer edge.
2. **One focal layer per screen.** Exactly one surface sits on top. Every other
   surface recedes by tone or scale. Two competing top layers read as clutter.
3. **Motion reveals depth.** Layers move at different rates during scroll. A
   layer that never moves relative to its neighbors reads as paint, not depth.

## Platform note

The scroll-rate heuristic requires iOS 17 scrollTransition. Earlier targets
need a manual offset driven by a scroll reader.

## Counterexample

A screen that puts a drop shadow on every card fails heuristic 1 and heuristic 2
at once: shadows replace layering, and no card is the focal layer.
