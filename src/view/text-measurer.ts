import type { TextMeasurer } from "../engine";

export const canvasTextMeasurer = (fontFamily: string): TextMeasurer => {
  const context = document.createElement("canvas").getContext("2d");
  return (text, fontSize) => {
    if (!context) return text.length * fontSize * 0.6;
    context.font = `${fontSize}px ${fontFamily}`;
    return context.measureText(text).width;
  };
};
