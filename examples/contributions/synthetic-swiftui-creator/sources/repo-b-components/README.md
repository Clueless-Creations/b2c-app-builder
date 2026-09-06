SYNTHETIC FIXTURE: not a real creator's repository

# CardStack

A SwiftUI view that fans a stack of cards. Cards further back recede by offset
and scale. The top card carries no offset.

## Design note

Cards use soft layered shadows: two stacked shadows, one tight and one wide,
both blurred. The blur is what makes the stack read as physical paper. Do not
use flat shadows on cards; a zero-blur shadow reads as a printed border.

## Contents

- `Sources/CardStack/CardStack.swift`: the view and its two layout functions.
- `Tests/CardStackTests/CardStackTests.swift`: one XCTest over the layout math.
- `Assets/Fonts/Mystery-Regular.ttf`: a display font used in the demo app.

## License

MIT. See `LICENSE`.
