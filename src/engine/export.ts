import { contentBounds, drawSketch, forExport } from "./drawing";
import type { Sketch } from "./editor";
import { svgElement, svgText } from "./svg";

// Space, in Sketch units, left around the content of an export.
const exportMargin = 20;

/**
 * The Sketch as a standalone SVG file, cropped to its content plus a margin, or `undefined` when it is empty. It is
 * drawn as on screen, but without any aids for editing.
 */
export function exportSvg(sketch: Sketch): string | undefined {
  const content = contentBounds(sketch);
  if (!content) return undefined;
  const x = content.x - exportMargin;
  const y = content.y - exportMargin;
  const width = content.width + exportMargin * 2;
  const height = content.height + exportMargin * 2;
  return svgText(
    svgElement(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", width, height, viewBox: `${x} ${y} ${width} ${height}` },
      [drawSketch(sketch, forExport)],
    ),
  );
}
