/**
 * An SVG element as data, with the attribute names SVG itself uses. The view shows it on screen and the export writes
 * it out as text, so both draw the same thing. A string child is text content.
 */
export type SvgElement = {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string | number>>;
  readonly children: readonly (SvgElement | string)[];
};

export function svgElement(
  tag: string,
  attributes: SvgElement["attributes"],
  children: SvgElement["children"] = [],
): SvgElement {
  return { tag, attributes, children };
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (character) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[character]};`);
}

/** The element as SVG text. */
export function svgText(element: SvgElement | string): string {
  if (typeof element === "string") return escapeXml(element);
  const { tag, attributes, children } = element;
  const attributeText = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeXml(String(value))}"`)
    .join("");
  return children.length === 0
    ? `<${tag}${attributeText}/>`
    : `<${tag}${attributeText}>${children.map(svgText).join("")}</${tag}>`;
}
