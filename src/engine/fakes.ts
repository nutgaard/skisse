import type { IdGenerator, TextMeasurer } from "./editor";

const charWidth = 10;

export const fixedWidthTextMeasurer: TextMeasurer = (text) => text.length * charWidth;

export const sequentialIds: IdGenerator = (sequence) => `shape-${sequence}`;
