# TUCK preliminary visual review

Date: 2026-09-04. Status: evolving candidate; **not acceptance**.

The native app is visibly authored, but its packing screen is less composed than the landing. The shared bag, garment drawings, cream ground, navy outlines, and Fraunces connect the surfaces. The main native task then becomes a stack of headings, controls, labels, and messages surrounding two visible items. I would not record `exceeds` for craft or cross-surface identity from these captures.

The next pass should improve the working composition and object state language. More decorative assets will not resolve these findings.

## Evidence and limits

I inspected these actual captures with `view_image`. They are local exploratory artifacts, not a source-bound final evidence bundle. Changes after capture require new inspection.

| Capture                                                    | Dimensions | SHA-256                                                            |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `/tmp/tuck-design-evidence/native-empty-exploratory.png`   | 942 × 2048 | `d1643886ccf92e3af023602ace3ff665864451c2e3ad42082ad2c3d7a29ad119` |
| `/tmp/tuck-design-evidence/native-packing-exploratory.png` | 942 × 2048 | `ab96dfdc1a49cf5474cc017a04754c922b9f6e3275a10d40bd4548d19de5e606` |
| `/tmp/tuck-design-evidence/landing-mobile-exploratory.png` | 390 × 844  | `934995209c6476cf03172c6588fee9b1d177c0ae33f432a4354b363c1c607019` |

Review basis: [DESIGN.md](../../DESIGN.md), [frozen TUCK rubric](rubrics/tuck-craft.json), [Consumer Craft Benchmarks](../../../../knowledge/design/consumer-craft-benchmarks.md), and [Premium Mobile Craft](../../../../knowledge/design/premium-mobile-craft.md). Native image pixels are not CSS pixels or measured point sizes.

The benchmark knowledge supplies relevant principles: Airbnb's content priority, Duolingo's coherent shape language, grug's mechanism spanning controls and states, Is This Seat Taken?'s readable in-world feedback, and Structured's stable hierarchy. This review does not claim a new live inspection of those products or a direct parity judgment against their complete experiences.

Stills cannot establish functionality, motion, keyboard behavior, VoiceOver, contrast ratios, or large-text quality. No browser or simulator actions were performed for this review. Editors, recovery, completion, and the rest of the landing are outside these three captures.

## 1. Give the native packing scene the screen

**Finding — high confidence; craft and coherence.** In the packing capture, navigation, trip metadata, the oversized trip title, progress copy, a second numerical count, a bar, a large segmented control, and the category heading occupy nearly the upper half. Only T-shirts and Trousers are fully visible. A large bag dock occupies the bottom, while the navy “Trip created” toast crosses the next row. The primary task competes with several equally emphatic explanations of that task.

**Repair.** Compact the trip header into a clear title, supporting trip detail, and one dominant progress expression. Keep the category quieter than the trip. Reduce the dock to the bag target and one short, state-specific instruction. Give the toast a deliberate presentation that does not cover a usable item. Reclaim vertical space before shrinking artwork or essential hit areas. Keep all packing, filtering, and editing operations available.

**Next capture should show:** a legible trip and remaining count, a useful area of objects, and the receiving bag together. Test with the toast present as well as absent. The user's eye should reach an item before a second headline. This applies Structured's hierarchy and the object-first composition described for Metaballs in the benchmark knowledge.

## 2. Design one packing-object language across both surfaces

**Finding — high confidence; originality, coherence, and cross-surface identity.** Native item drawings sit beside detached blank checkbox squares, then separate name, uppercase quantity, and “Edit” lines. T-shirts uses “BRING 4”; Trousers uses “ONE TO BRING.” The landing instead uses tiny quantity badges on the objects. The assets match, but the physical item and its state are expressed differently. At `0/13`, the native bag says “Your bag is taking shape,” which gives progress language before anything has been packed.

**Repair.** Give every item a consistent relationship between illustration, name, quantity, and packed indicator. Use one concise quantity grammar across native and web. Keep editing discoverable and accessible while making it subordinate to packing; do not require a hidden gesture. Tie the bag copy directly to zero, partial, and complete states. Carry the luggage-label character into these useful controls rather than adding further visual decoration.

**Next captures should show:** the same item unpacked and packed on both surfaces, with its quantity and state obvious without color alone. Compare zero and partial bags. This is the grug/Duolingo principle of an authored language extending into the working product, and the Seat principle of expression explaining consequence.

The empty native screen already carries the bag illustration at a useful expressive scale. Its huge wordmark, tagline, large headline, two explanatory lines, and uppercase footer repeat the premise; trim that repetition during the same hierarchy pass. Also settle the action-color rule: its broad orange CTA differs from the landing's navy CTA and the navy action token in DESIGN.md. A platform utility font difference is explicitly authored and is not itself a defect.

## 3. Make the mobile landing's packing relationship visible

**Finding — high confidence for the initial viewport; craft and cross-surface identity.** At 390 × 844, the hero presents a clear promise and primary CTA. The table begins at about y=493. Its instructions say to drag into the bag, but the receiving bag is outside the capture. Only the first row is fully shown, with small item labels and much smaller utility controls. The scene introduces a physical interaction before showing its destination.

**Repair.** Compose the first working view reached from the CTA so that an item and the bag can be understood together. Reduce intervening table chrome or reposition the target; preserve the marketing hierarchy and readable labels. Do not solve this by shrinking all objects and text until the whole page fits the first viewport. Keep the tap alternative explicit.

**Next captures should show:** the initial mobile viewport and the actual post-CTA working viewport, each at 390 pixels. Check the destination while an item is being manipulated. This capture alone does not prove that the CTA's current scroll behavior fails; it identifies a first-view composition risk to inspect and resolve.

These are repair priorities for the evolving implementation. A new independent review must inspect the revised native and landing surfaces together and judge each required rubric facet against current evidence.
