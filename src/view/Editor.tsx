import { useEffect, useId, useMemo, useReducer, useRef, type PointerEvent } from "react";
import {
  activeTool,
  canRedo,
  canUndo,
  createEditor,
  currentInteraction,
  exportSvg,
  gridSize,
  labelLayout,
  noModifiers,
  pansOnPress,
  pathData,
  rendering,
  resizeHandles,
  selection,
  shapes,
  sketch,
  symbolIcon,
  tools,
  update,
  viewport,
  type Dependencies,
  type EditorState,
  type FontSize,
  type Input,
  type KeyInput,
  type LabelAlignment,
  type PointerInput,
  type Size,
  type Sketch,
  type LabelView,
  type ToolInfo,
  type Viewport,
  type WheelInput,
} from "../engine";
import { useAutosave } from "./autosave";
import { downloadPng, downloadSvg } from "./download";
import { LabelEditor } from "./LabelEditor";
import { SvgElementView } from "./SvgElementView";

function modifiersOf(event: KeyboardEvent | PointerEvent | WheelEvent) {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
  };
}

function pointerInput(type: PointerInput["type"], event: PointerEvent): PointerInput {
  return {
    type,
    position: { x: event.clientX, y: event.clientY },
    button: event.button,
    modifiers: modifiersOf(event),
  };
}

function keyInput(type: KeyInput["type"], event: KeyboardEvent): KeyInput {
  return {
    type,
    key: event.key,
    modifiers: modifiersOf(event),
  };
}

// Pixels per line, for a wheel that scrolls by lines rather than pixels.
const lineHeight = 16;

function wheelInput(event: WheelEvent, screenSize: Size): WheelInput {
  const scale =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? lineHeight
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? screenSize.height
        : 1;
  return {
    type: "wheel",
    position: { x: event.clientX, y: event.clientY },
    delta: { x: event.deltaX * scale, y: event.deltaY * scale },
    modifiers: modifiersOf(event),
  };
}

// Safari reports a trackpad pinch as gesture events, with the scale since the pinch started. Other browsers report it
// as a wheel event with ctrl held.
type GestureEvent = UIEvent & { readonly scale: number; readonly clientX: number; readonly clientY: number };

const spaceReleased: KeyInput = { type: "keyUp", key: " ", modifiers: noModifiers };

// Size, in screen pixels, of the square drawn for each resize handle.
const handleSize = 8;

// Cmd/Ctrl+A is select all in the editor, so the browser must not also select the page's text.
function isSelectAll(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";
}

// Keys typed into a text field, such as when renaming a Sketch or editing a Label, are not editor shortcuts.
function isTyping(event: KeyboardEvent) {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
}

function isSpace(event: KeyboardEvent) {
  return event.key === " ";
}

// Space presses a button outside the editor's toolbar, such as in the Sketch list, when the keyboard moved focus to it.
// Otherwise it pans, even right after clicking such a button, and must not also press the button or scroll the page.
function spacePans(event: KeyboardEvent, toolbar: HTMLElement | null, keyboardFocused: EventTarget | null) {
  return (
    !(event.target instanceof HTMLButtonElement) ||
    event.target !== keyboardFocused ||
    (toolbar?.contains(event.target) ?? false)
  );
}

// Grid lines closer together than this, in screen pixels, are left out, leaving only every tenth line.
const minimumGridSpacing = 8;

/** The grid, drawn in screen pixels so its lines stay thin at any zoom, lined up with the Sketch's grid. */
function Grid({ viewport }: { readonly viewport: Viewport }) {
  const id = useId();
  const origin = { x: -viewport.x * viewport.zoom, y: -viewport.y * viewport.zoom };
  const levels = [
    { kind: "minor", step: gridSize * viewport.zoom },
    { kind: "major", step: gridSize * 10 * viewport.zoom },
  ].filter(({ step }) => step >= minimumGridSpacing);
  return (
    <>
      <defs>
        {levels.map(({ kind, step }) => (
          <pattern
            key={kind}
            id={`${id}-${kind}`}
            className={`grid-${kind}`}
            x={origin.x}
            y={origin.y}
            width={step}
            height={step}
            patternUnits="userSpaceOnUse"
          >
            <path d={`M 0 0.5 H ${step} M 0.5 0 V ${step}`} />
          </pattern>
        ))}
      </defs>
      {levels.map(({ kind }) => (
        <rect key={kind} width="100%" height="100%" fill={`url(#${id}-${kind})`} className="grid" />
      ))}
    </>
  );
}

// Size, in screen pixels, of a Symbol's picture on its toolbar button.
const iconSize = 18;

type ToolButtonProps = { readonly info: ToolInfo; readonly active: boolean; readonly onSelect: () => void };

function ToolButton({ info, active, onSelect }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={info.symbol ? info.name : undefined}
      title={`${info.name} (${info.shortcut.toUpperCase()})`}
      onClick={onSelect}
    >
      {info.symbol ? (
        <svg className="tool-icon" width={iconSize} height={iconSize} aria-hidden="true">
          <path d={pathData(symbolIcon(info.symbol, iconSize - 2))} transform="translate(1 1)" />
        </svg>
      ) : (
        info.name
      )}
    </button>
  );
}

const alignments: readonly { readonly alignment: LabelAlignment; readonly name: string }[] = [
  { alignment: "center", name: "Centre" },
  { alignment: "topLeft", name: "Top left" },
];

const fontSizes: readonly { readonly fontSize: FontSize; readonly name: string; readonly title: string }[] = [
  { fontSize: "small", name: "S", title: "Small text" },
  { fontSize: "medium", name: "M", title: "Medium text" },
  { fontSize: "large", name: "L", title: "Large text" },
];

// What the selected Shapes' Labels have in common, such as their font size, or `undefined` when they differ.
function shared<T>(state: EditorState, of: (label: LabelView) => T): T | undefined {
  const values = new Set(selection(state).flatMap((id) => {
    const label = labelLayout(state, id);
    return label ? [of(label)] : [];
  }));
  return values.size === 1 ? [...values][0] : undefined;
}

type LabelControlsProps = { readonly state: EditorState; readonly dispatch: (input: Input) => void };

// Shown while Shapes are selected. The buttons keep the focus where it is, so they change a Label being edited without
// finishing the editing.
function LabelControls({ state, dispatch }: LabelControlsProps) {
  if (selection(state).length === 0) return null;
  const alignment = shared(state, (label) => label.alignment);
  const fontSize = shared(state, (label) => label.fontSize);
  return (
    <div className="toolbar label-controls" role="toolbar" aria-label="Label">
      {alignments.map((option) => (
        <button
          key={option.alignment}
          type="button"
          aria-pressed={option.alignment === alignment}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => dispatch({ type: "setLabelAlignment", alignment: option.alignment })}
        >
          {option.name}
        </button>
      ))}
      <span className="toolbar-separator" />
      {fontSizes.map((option) => (
        <button
          key={option.fontSize}
          type="button"
          aria-pressed={option.fontSize === fontSize}
          aria-label={option.title}
          title={option.title}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => dispatch({ type: "changeStyle", style: { fontSize: option.fontSize } })}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}

type EditorProps = {
  readonly deps: Dependencies;
  /** The open Sketch's name, which exports are named after. */
  readonly name: string;
  /** The Sketch to open. A different Sketch needs a new Editor, so its undo history starts afresh. */
  readonly initialSketch: Sketch;
  readonly onSave: (sketch: Sketch) => void;
};

export function Editor({ deps, name, initialSketch, onSave }: EditorProps) {
  const [state, dispatch] = useReducer(update, undefined, () => createEditor(deps, initialSketch));
  const svgRef = useRef<SVGSVGElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const interaction = currentInteraction(state);
  const selected = new Set(selection(state));
  const view = viewport(state);
  const finishedSketch = sketch(state);
  const editedLabel = interaction.kind === "editingLabel" ? labelLayout(state, interaction.shapeId) : undefined;
  // Only a finished change to the Sketch changes the export, not every pointer move.
  const exportedSvg = useMemo(() => exportSvg(finishedSketch, deps.measureText), [finishedSketch, deps]);

  useAutosave(finishedSketch, onSave);

  const screenSize = (): Size => {
    const { width, height } = svgRef.current?.getBoundingClientRect() ?? { width: 0, height: 0 };
    return { width, height };
  };

  useEffect(() => {
    // Whether focus came from the keyboard is only known as it arrives: once a key is pressed, a clicked button also
    // counts as focused by keyboard.
    let keyboardFocused: EventTarget | null = null;
    const onFocusIn = (event: FocusEvent) => {
      keyboardFocused = event.target instanceof Element && event.target.matches(":focus-visible") ? event.target : null;
    };
    const pans = (event: KeyboardEvent) => spacePans(event, toolbarRef.current, keyboardFocused);
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event)) return;
      if (isSpace(event)) {
        if (!pans(event)) return;
        event.preventDefault();
      }
      if (isSelectAll(event)) event.preventDefault();
      dispatch(keyInput("keyDown", event));
    };
    // Releases still reach the editor, so a modifier let go while typing doesn't stay held.
    const onKeyUp = (event: KeyboardEvent) => {
      if (isSpace(event) && !isTyping(event) && pans(event)) event.preventDefault();
      dispatch(keyInput("keyUp", event));
    };
    // Keys let go while the window is in the background never reach it, so space must not stay held.
    const onBlur = () => dispatch(spaceReleased);
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Wheel and gesture listeners are added directly, as React's are passive and can't stop the browser zooming the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let pinchScale: number | undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Safari may also report its pinch as wheel events, which the gesture events already cover.
      if (pinchScale === undefined) dispatch(wheelInput(event, screenSize()));
    };
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      pinchScale = 1;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const { scale, clientX, clientY } = event as GestureEvent;
      dispatch({ type: "pinch", position: { x: clientX, y: clientY }, scale: scale / (pinchScale ?? 1) });
      pinchScale = scale;
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      pinchScale = undefined;
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("gesturestart", onGestureStart);
    svg.addEventListener("gesturechange", onGestureChange);
    svg.addEventListener("gestureend", onGestureEnd);
    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("gesturestart", onGestureStart);
      svg.removeEventListener("gesturechange", onGestureChange);
      svg.removeEventListener("gestureend", onGestureEnd);
    };
  }, []);

  // Only the first finger or the mouse drives the editor, so a second touch can't take over a gesture.
  const onPointer = (type: PointerInput["type"]) => (event: PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary) return;
    if (type === "pointerDown") event.currentTarget.setPointerCapture(event.pointerId);
    dispatch(pointerInput(type, event));
  };

  return (
    <>
      <svg
        ref={svgRef}
        className="sketch"
        data-pans={pansOnPress(state) || undefined}
        data-panning={interaction.kind === "panning" || undefined}
        onPointerDown={onPointer("pointerDown")}
        onPointerMove={onPointer("pointerMove")}
        onPointerUp={onPointer("pointerUp")}
        onPointerCancel={onPointer("pointerCancel")}
        onDoubleClick={(event) => dispatch({ type: "doubleClick", position: { x: event.clientX, y: event.clientY } })}
      >
        <Grid viewport={view} />
        <g transform={`scale(${view.zoom}) translate(${-view.x} ${-view.y})`}>
          <SvgElementView element={rendering(state)} />
          {shapes(state)
            .filter(({ id }) => selected.has(id))
            .map(({ id, bounds }) => (
              <rect key={id} data-selected={id} {...bounds} className="selection-outline" />
            ))}
          {resizeHandles(state).map(({ handle, position }) => (
            <rect
              key={handle}
              data-handle={handle}
              x={position.x - handleSize / view.zoom / 2}
              y={position.y - handleSize / view.zoom / 2}
              width={handleSize / view.zoom}
              height={handleSize / view.zoom}
              className="resize-handle"
            />
          ))}
          {interaction.kind === "marqueeSelecting" && <rect {...interaction.bounds} className="selection-box" />}
        </g>
      </svg>
      {editedLabel && <LabelEditor label={editedLabel} viewport={view} dispatch={dispatch} />}
      <LabelControls state={state} dispatch={dispatch} />
      <div ref={toolbarRef} className="toolbar" role="toolbar">
        {tools.map((info) => (
          <ToolButton
            key={info.tool}
            info={info}
            active={activeTool(state) === info.tool}
            onSelect={() => dispatch({ type: "selectTool", tool: info.tool })}
          />
        ))}
        <span className="toolbar-separator" />
        <button type="button" disabled={!canUndo(state)} onClick={() => dispatch({ type: "undo" })}>
          Undo
        </button>
        <button type="button" disabled={!canRedo(state)} onClick={() => dispatch({ type: "redo" })}>
          Redo
        </button>
        <span className="toolbar-separator" />
        <button type="button" onClick={() => dispatch({ type: "zoomToFit", screenSize: screenSize() })}>
          Zoom to fit
        </button>
        <button
          type="button"
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
          onClick={() => dispatch({ type: "resetZoom", screenSize: screenSize() })}
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <span className="toolbar-separator" />
        <button type="button" disabled={!exportedSvg} onClick={() => exportedSvg && downloadSvg(exportedSvg, name)}>
          Export SVG
        </button>
        <button
          type="button"
          disabled={!exportedSvg}
          onClick={() => exportedSvg && void downloadPng(exportedSvg, name)}
        >
          Export PNG
        </button>
      </div>
    </>
  );
}
