import { contentBounds, type Sketch, type TextMeasurer } from "./editor";
import { expandBounds } from "./geometry";
import { forExport, renderSketch } from "./render";
import { svgElement, svgText } from "./svg";

// Space, in Sketch units, left around the content of an export.
const exportMargin = 20;

/**
 * The Sketch as a standalone SVG file, cropped to its content plus a margin, or `undefined` when it is empty. It is
 * rendered as on screen, but without any aids for editing. Labels are wrapped with `measure`, as in the editor.
 */
export function exportSvg(sketch: Sketch, measure: TextMeasurer): string | undefined {
  const content = contentBounds(sketch, measure);
  if (!content) return undefined;
  const { x, y, width, height } = expandBounds(content, exportMargin);
  return svgText(
    svgElement(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", width, height, viewBox: `${x} ${y} ${width} ${height}` },
      [renderSketch(sketch, measure, forExport)],
    ),
  );
}
