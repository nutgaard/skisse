import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "./view/Editor";
import { canvasTextMeasurer } from "./view/text-measurer";
import "./view/editor.css";

const deps = {
  measureText: canvasTextMeasurer("system-ui, sans-serif"),
  generateId: () => crypto.randomUUID(),
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Editor deps={deps} />
  </StrictMode>,
);
