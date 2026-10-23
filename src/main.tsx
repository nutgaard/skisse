import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Dependencies } from "./engine";
import { browserSketchStore } from "./store/browser-sketch-store";
import { openOnStart } from "./store/open-sketch";
import { App } from "./view/App";
import { canvasTextMeasurer } from "./view/text-measurer";
import "./view/editor.css";

// Unique per page load, so Shape IDs never collide across sessions.
const idPrefix = crypto.randomUUID();

const deps: Dependencies = {
  measureText: canvasTextMeasurer("system-ui, sans-serif"),
  generateId: (sequence) => `${idPrefix}-${sequence}`,
};

const store = browserSketchStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App deps={deps} store={store} openAtStart={openOnStart(store)} />
  </StrictMode>,
);
