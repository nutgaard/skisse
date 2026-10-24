import { useEffect, useId, useMemo, useReducer, useRef, type PointerEvent } from "react";
import {
  activeTool,
  arrowEndHandles,
  arrows,
  canRedo,
  canUndo,
  createEditor,
  currentInteraction,
  exportSvg,
  gridSize,
  labelLayout,
  middleSegmentHandle,
  noModifiers,
  pansOnPress,
  pathData,
  rendering,
  resizeHandles,
  selection,
  selectionAlignment,
  selectionRouting,
  selectionStyle,
  shapes,
  sketch,
  symbolIcon,
  tools,
  update,
  viewport,
  visiblePorts,
  type Dependencies,
  type KeyInput,
  type PointerInput,
  type Size,
  type Sketch,
  type ToolInfo,
  type Viewport,
  type WheelInput,
} from "../engine";
import { useAutosave } from "./autosave";
import { downloadPng, downloadSvg } from "./download";
import { keyInput, modifiersOf } from "./inputs";
import { LabelEditor } from "./LabelEditor";
import { StylePanel } from "./StylePanel";
import { SvgElementView } from "./SvgElementView";

function pointerInput(type: PointerInput["type"], event: PointerEvent): PointerInput {
  return {
    type,
    position: { x: event.clientX, y: event.clientY },
    button: event.button,
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

// Radius, in screen pixels, of the circle drawn for each Port, and for the Port an Arrow end would snap to.
const portRadius = 4;
const snapPortRadius = 6;

// Cmd/Ctrl+A is select all in the editor, so the browser must not also select the page's text.
function isSelectAll(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";
}

// Cmd/Ctrl + [ and ] move the selection one step back or forward in the editor, so the browser must not also go back or
// forward a page.
function isStepReorder(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && (event.key === "[" || event.key === "]");
}

// Keys typed into a text field, such as when renaming a Sketch or editing a Label, are not editor shortcuts.
function isTyping(event: KeyboardEvent) {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
}

function isSpace(event: KeyboardEvent) {
  return event.key === " ";
}

// Enter edits the selected Shape's Label. Its text field opens and takes focus while the key is still down, so the
// browser must not also type the Enter into it. A focused button outside the Sketch still gets pressed by Enter.
function editsLabel(event: KeyboardEvent) {
  return event.key === "Enter" && !(event.target instanceof HTMLButtonElement);
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
  // The Sketch and the text field laid over it while a Label is edited, which scroll and pinch alike.
  const sketchAreaRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const interaction = currentInteraction(state);
  const selected = new Set(selection(state));
  const view = viewport(state);
  const finishedSketch = sketch(state);
  const ports = visiblePorts(state);
  const segmentHandle = middleSegmentHandle(state);
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
      if (isSelectAll(event) || isStepReorder(event) || editsLabel(event)) event.preventDefault();
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
    const sketchArea = sketchAreaRef.current;
    if (!sketchArea) return;
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
    sketchArea.addEventListener("wheel", onWheel, { passive: false });
    sketchArea.addEventListener("gesturestart", onGestureStart);
    sketchArea.addEventListener("gesturechange", onGestureChange);
    sketchArea.addEventListener("gestureend", onGestureEnd);
    return () => {
      sketchArea.removeEventListener("wheel", onWheel);
      sketchArea.removeEventListener("gesturestart", onGestureStart);
      sketchArea.removeEventListener("gesturechange", onGestureChange);
      sketchArea.removeEventListener("gestureend", onGestureEnd);
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
      <div ref={sketchAreaRef}>
        <svg
          ref={svgRef}
          className="sketch"
          data-pans={pansOnPress(state) || undefined}
          data-panning={interaction.kind === "panning" || undefined}
          onPointerDown={onPointer("pointerDown")}
          onPointerMove={onPointer("pointerMove")}
          onPointerUp={onPointer("pointerUp")}
          onPointerCancel={onPointer("pointerCancel")}
          onPointerLeave={() => dispatch({ type: "pointerLeave" })}
          onDoubleClick={(event) =>
            dispatch({ type: "doubleClick", position: { x: event.clientX, y: event.clientY } })
          }
        >
          <Grid viewport={view} />
          <g transform={`scale(${view.zoom}) translate(${-view.x} ${-view.y})`}>
            <SvgElementView element={rendering(state)} />
            {shapes(state)
              .filter(({ id }) => selected.has(id))
              .map(({ id, bounds }) => (
                <rect key={id} data-selected={id} {...bounds} className="selection-outline" />
              ))}
            {arrows(state)
              .filter(({ id }) => selected.has(id))
              .map(({ id, path }) => (
                <polyline
                  key={id}
                  data-selected={id}
                  points={path.map(({ x, y }) => `${x},${y}`).join(" ")}
                  className="arrow-selection"
                />
              ))}
            {ports?.ports.map((port, index) => (
              <circle
                key={index}
                cx={port.x}
                cy={port.y}
                r={(index === ports.snapsTo ? snapPortRadius : portRadius) / view.zoom}
                data-snaps={index === ports.snapsTo || undefined}
                className="port"
              />
            ))}
            {arrowEndHandles(state).map(({ end, position }) => (
              <circle
                key={end}
                data-arrow-end={end}
                cx={position.x}
                cy={position.y}
                r={handleSize / view.zoom / 2}
                className="arrow-end-handle"
              />
            ))}
            {segmentHandle && (
              <rect
                data-segment-axis={segmentHandle.axis}
                x={segmentHandle.position.x - handleSize / view.zoom / 2}
                y={segmentHandle.position.y - handleSize / view.zoom / 2}
                width={handleSize / view.zoom}
                height={handleSize / view.zoom}
                rx={handleSize / view.zoom / 4}
                className="segment-handle"
              />
            )}
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
      </div>
      <StylePanel
        style={selectionStyle(state)}
        alignment={selectionAlignment(state)}
        routing={selectionRouting(state)}
        dispatch={dispatch}
      />
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
