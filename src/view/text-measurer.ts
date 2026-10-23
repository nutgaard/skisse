import type { TextMeasurer } from "../engine";

// Rough average glyph width as a fraction of the font size, used if the browser has no 2D canvas.
const averageGlyphWidthRatio = 0.6;

export const canvasTextMeasurer = (fontFamily: string): TextMeasurer => {
  const context = document.createElement("canvas").getContext("2d");
  return (text, fontSize) => {
    if (!context) return text.length * fontSize * averageGlyphWidthRatio;
    context.font = `${fontSize}px ${fontFamily}`;
    return context.measureText(text).width;
  };
};
