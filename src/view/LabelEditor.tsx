import { useEffect, useRef, type KeyboardEvent } from "react";
import { labelFontFamily, type Input, type LabelView, type Viewport } from "../engine";
import { keyInput } from "./inputs";

type LabelEditorProps = {
  readonly label: LabelView;
  readonly viewport: Viewport;
  readonly dispatch: (input: Input) => void;
};

// Escape and Enter go to the engine, which finishes editing on them, instead of into the field. Shift+Enter is left
// to the field, for a line break.
function finishesEditing(event: KeyboardEvent) {
  return event.key === "Escape" || (event.key === "Enter" && !event.shiftKey);
}

/**
 * The text field for editing a Label in place, laid over the Label on the Sketch in the same font and size, so its
 * text wraps where the Label will. The engine leaves the Label out of the Sketch meanwhile, and grows the Shape as
 * the text gets longer.
 */
export function LabelEditor({ label, viewport, dispatch }: LabelEditorProps) {
  const field = useRef<HTMLTextAreaElement>(null);

  // Starts with all of the text selected, so typing replaces it.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const { textBlock, alignment, lineHeight, fontPixels, text } = label;
  const { zoom } = viewport;

  return (
    <textarea
      ref={field}
      className="label-editor"
      aria-label="Label"
      value={text}
      spellCheck={false}
      // Laid out in Sketch units and then scaled, as the Sketch is, so the text wraps just as it was measured at any
      // zoom. Text set in a font size scaled by the zoom would be measured differently.
      style={{
        left: (textBlock.x - viewport.x) * zoom,
        top: (textBlock.y - viewport.y) * zoom,
        width: textBlock.width,
        height: textBlock.height,
        transform: `scale(${zoom})`,
        fontFamily: labelFontFamily,
        fontSize: fontPixels,
        lineHeight: `${lineHeight}px`,
        textAlign: alignment.horizontal,
      }}
      onChange={(event) => dispatch({ type: "changeLabelText", text: event.target.value })}
      onKeyDown={(event) => {
        if (!finishesEditing(event)) return;
        event.preventDefault();
        dispatch(keyInput("keyDown", event));
      }}
      // Leaving the field, such as for the toolbar, finishes editing too. After Escape, Enter or a press on the Sketch,
      // editing has finished already, and committing again changes nothing. Leaving the window, such as for another
      // tab, keeps it open, and the field gets the focus back on return.
      onBlur={() => {
        if (document.hasFocus()) dispatch({ type: "commitLabel" });
      }}
    />
  );
}
