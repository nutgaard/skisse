import type { IdGenerator, TextMeasurer } from "./editor";

export const fixedWidthTextMeasurer =
  (charWidth = 10): TextMeasurer =>
  (text) =>
    text.length * charWidth;

export const sequentialIds = (prefix = "shape"): IdGenerator => {
  let next = 0;
  return () => `${prefix}-${++next}`;
};
