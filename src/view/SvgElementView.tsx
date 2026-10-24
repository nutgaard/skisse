import { createElement } from "react";
import type { SvgElement } from "../engine";

// React names SVG attributes in camelCase, such as `strokeWidth` for `stroke-width` and `xmlSpace` for `xml:space`,
// except for data and aria ones.
function reactName(name: string) {
  return name.startsWith("data-") || name.startsWith("aria-")
    ? name
    : name.replace(/[-:](\w)/g, (_, letter: string) => letter.toUpperCase());
}

/** An element the engine rendered, shown as React SVG. */
export function SvgElementView({ element }: { readonly element: SvgElement }) {
  const { tag, attributes, children } = element;
  return createElement(
    tag,
    Object.fromEntries(Object.entries(attributes).map(([name, value]) => [reactName(name), value])),
    // Elements carry no IDs, but they are drawn afresh from the engine's state and keep no state of their own.
    ...children.map((child, index) =>
      typeof child === "string" ? child : <SvgElementView key={index} element={child} />,
    ),
  );
}
