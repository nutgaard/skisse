# Build our own canvas engine instead of extending tldraw or Excalidraw

Skisse exists largely because of shortcomings in tldraw and Excalidraw for architecture diagrams: no database-cylinder symbol, poor arrow connections in tldraw, and limited box labels in Excalidraw. These are core engine concerns (symbols, Bindings, Labels), not surface features, so we write the editor engine ourselves instead of fighting someone else's.

## Considered Options

- **tldraw SDK with custom shapes and bindings**: good extension API, but needs a license key outside development (the hobby license adds a watermark), and we'd have to replace the arrow behaviour we dislike.
- **Excalidraw as a library**: MIT-licensed, but its element types are effectively a closed set, so custom Symbols like a cylinder are impractical.

## Consequences

We own undo/redo, hit-testing, selection, zoom/pan and text layout, which costs weeks before reaching parity on basics. Scope is kept tight (single user, no multiplayer, no pages) to compensate.
