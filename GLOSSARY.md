# Skisse

A single-user, in-browser drawing tool for sketching technical diagrams, especially software architectures.

## Language

### Sketches and shapes

**Sketch**:
One drawing document, opened, edited and saved as a whole.
_Avoid_: Drawing, board, canvas, document, page

**Shape**:
A single element placed on a Sketch, such as a box, a database cylinder, a text or an Arrow.
_Avoid_: Element, object, item, node

**Symbol**:
A kind of Shape, defined by its outline and where its Label sits, such as rectangle, cylinder or cloud. Every Shape except an Arrow is an instance of a Symbol.
_Avoid_: Shape type, template, stencil, icon

**Container**:
A Shape whose Symbol allows it to hold other Shapes, its **children**. Children move and are deleted with their Container.
_Avoid_: Group, frame, boundary, parent box

**Label**:
The text belonging to a Shape or an Arrow, edited in place and moved with its owner.
_Avoid_: Caption, text box, title

### Connections

**Arrow**:
A line connecting two points on a Sketch, each end optionally bound to a Shape, with a configurable head at each end (including none).
_Avoid_: Connector, edge, link, line

**Binding**:
The attachment of an Arrow end to a Shape, so the end follows the Shape when it moves. An Arrow end without a Binding is **floating**.
_Avoid_: Connection, attachment, link

**Routing**:
How an Arrow's path runs between its ends: **straight**, **elbow** (right-angle segments) or **curved**.
_Avoid_: Path style, line type

**Port**:
A preferred attachment point on a Shape (the midpoint of each side) that Arrow ends snap to.
_Avoid_: Anchor, handle, connection point
