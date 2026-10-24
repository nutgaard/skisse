import type { IdGenerator, TextMeasurer } from "./editor";

// Every character is half as wide as the font size, so 10 wide at the medium font size.
const charWidthRatio = 0.5;

export const fixedWidthTextMeasurer: TextMeasurer = (text, fontSize) => text.length * fontSize * charWidthRatio;

export const sequentialIds: IdGenerator = (sequence) => `shape-${sequence}`;
