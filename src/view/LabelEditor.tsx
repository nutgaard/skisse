import { useEffect, useRef, type KeyboardEvent } from "react";
import { labelFontFamily, type Input, type KeyInput, type LabelView, type Viewport } from "../engine";

type LabelEditorProps = {
  readonly label: LabelView;
  readonly viewport: Viewport;
  readonly dispatch: (input: Input) => void;
};

// Escape and Enter finish editing, which the engine decides. Shift+Enter is left to the field, for a line break.
function finishesEditing(event: KeyboardEvent) {
  return event.key === "Escape" || (event.key === "Enter" && !event.shiftKey);
}

function keyDownInput(event: KeyboardEvent): KeyInput {
  return {
    type: "keyDown",
    key: event.key,
    modifiers: { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey },
  };
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

  const { area, alignment, lines, lineHeight, fontPixels, text } = label;
  // At least one line high, so the caret shows in an empty Label.
  const height = Math.max(1, lines.length) * lineHeight;
  const top = alignment === "center" ? area.y + (area.height - height) / 2 : area.y;
  const { zoom } = viewport;

  return (
    <textarea
      ref={field}
      className="label-editor"
      aria-label="Label"
      value={text}
      spellCheck={false}
      style={{
        left: (area.x - viewport.x) * zoom,
        top: (top - viewport.y) * zoom,
        width: area.width * zoom,
        height: height * zoom,
        fontFamily: labelFontFamily,
        fontSize: fontPixels * zoom,
        lineHeight: `${lineHeight * zoom}px`,
        textAlign: alignment === "center" ? "center" : "left",
      }}
      onChange={(event) => dispatch({ type: "changeLabelText", text: event.target.value })}
      onKeyDown={(event) => {
        if (!finishesEditing(event)) return;
        event.preventDefault();
        dispatch(keyDownInput(event));
      }}
      // Leaving the field, such as for the toolbar, finishes editing too. After Escape, Enter or a press on the Sketch,
      // editing has finished already, and committing again changes nothing.
      onBlur={() => dispatch({ type: "commitLabel" })}
    />
  );
}
