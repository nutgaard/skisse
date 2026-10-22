# Shapes form a containment tree, and Arrows belong to the innermost common Container

Architecture diagrams nest heavily (VPC → cluster → service), so containment is a real parent–child relationship in the data model, not visual overlap. A Shape joins the innermost Container its centre is inside when a drag ends, and deleting a Container deletes its children. An Arrow belongs to the innermost Container holding both its ends, so moving a VPC moves the Arrows inside it. A bound end counts as wherever its Shape is, and a floating end counts as the innermost Container its point lies in. An Arrow that crosses a boundary belongs to the outer level and just follows its Bindings. Ownership is re-evaluated after every move. Children are always drawn above their Container, z-order only reorders siblings, and Arrows are drawn above the Shapes at their own level.

## Considered Options

- **Visual overlap only**: simplest, but moving a Container leaves its contents behind, which makes architecture sketching tedious.
- **Explicit grouping only**: doesn't express "inside", and doesn't drive Label placement for Containers.

## Consequences

Deleting Shapes behaves differently from deleting Arrows on purpose: a deleted Container takes its children with it, but a deleted Shape leaves its bound Arrows floating.
