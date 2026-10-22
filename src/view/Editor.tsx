import { useReducer, type PointerEvent } from "react";
import { createEditor, shapes, update, type Dependencies, type Input, type Tool } from "../engine";

const tools: readonly { readonly tool: Tool; readonly label: string }[] = [
  { tool: "select", label: "Select" },
  { tool: "rectangle", label: "Rectangle" },
];

const modifiersOf = (event: PointerEvent) => ({
  shift: event.shiftKey,
  alt: event.altKey,
  ctrl: event.ctrlKey,
  meta: event.metaKey,
});

const positionOf = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });

export const Editor = ({ deps }: { readonly deps: Dependencies }) => {
  const [state, dispatch] = useReducer(update, deps, createEditor);
  const send = (input: Input) => dispatch(input);

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    send({ type: "pointerDown", position: positionOf(event), button: event.button, modifiers: modifiersOf(event) });
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) =>
    send({ type: "pointerMove", position: positionOf(event), modifiers: modifiersOf(event) });
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) =>
    send({ type: "pointerUp", position: positionOf(event), button: event.button, modifiers: modifiersOf(event) });

  return (
    <>
      <svg
        className="sketch"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {shapes(state).map(({ id, symbol, bounds }) => (
          <rect key={id} data-symbol={symbol} {...bounds} className="shape" />
        ))}
      </svg>
      <div className="toolbar" role="toolbar">
        {tools.map(({ tool, label }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={state.tool === tool}
            onClick={() => send({ type: "selectTool", tool })}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
};
