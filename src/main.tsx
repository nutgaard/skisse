import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Dependencies } from "./engine";
import { Editor } from "./view/Editor";
import { canvasTextMeasurer } from "./view/text-measurer";
import "./view/editor.css";

// Unique per page load, so Shape IDs never collide across sessions.
const idPrefix = crypto.randomUUID();

const deps: Dependencies = {
  measureText: canvasTextMeasurer("system-ui, sans-serif"),
  generateId: (sequence) => `${idPrefix}-${sequence}`,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Editor deps={deps} />
  </StrictMode>,
);
