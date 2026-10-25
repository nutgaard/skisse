import { arrowheads, routings, type ArrowEnd } from "./arrow";
import type { Shape, ShapeId, Sketch } from "./editor";
import { axes } from "./elbow";
import { shapeGeometry } from "./shape-geometry";
import { isArrow } from "./shape-kind";
import { fills, fontSizes, palette, strokePatterns, strokeWidths } from "./style";
import { symbolDefinition, symbolIds } from "./symbols";
import { horizontalAlignments, verticalAlignments } from "./symbols/symbol";
import { maximumZoom, minimumZoom, type Viewport } from "./viewport";

// Marks a file as a Skisse Sketch, so any other JSON is never taken for one.
const format = "skisse/sketch";

// The top-level object of a JSON file.
type JsonFile = Readonly<Record<string, unknown>>;

/** Turns a JSON file in one format version into one in the next. */
export type Migration = (file: JsonFile) => JsonFile;

// The migration from each format version to the next, oldest first. The first version is 1, and the current one comes
// after the last migration. A change to the format adds a migration here, so files written before it still import.
const migrations: readonly Migration[] = [];

function latestVersion(chain: readonly Migration[]): number {
  return chain.length + 1;
}

/** A Sketch read from a JSON file, and the zoom and pan it was exported at, if the file has them. */
export type ImportedSketch = { readonly sketch: Sketch; readonly viewport: Viewport | undefined };

/** What importing a JSON file gives: the Sketch in it, or why it can't be imported, to show to the user. */
export type JsonImport = ImportedSketch | { readonly error: string };

/**
 * The Sketch, shown at `viewport`, as the text of a JSON file, marked with the format version it is written in. The
 * zoom and pan let the Sketch open as it was when imported, but are not part of the Sketch.
 */
export function exportJson(sketch: Sketch, viewport: Viewport): string {
  return JSON.stringify({ format, version: latestVersion(migrations), viewport, shapes: sketch.shapes }, undefined, 2);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// What is wrong with a value read from a file: the field inside it that is wrong, if any, and what is wrong with that.
type Problem = { readonly field: readonly string[]; readonly message: string };

// Gives what is wrong with a value read from a file, or `undefined` when nothing is.
type Check = (value: unknown) => Problem | undefined;

function wrong(message: string): Problem {
  return { field: [], message };
}

// The problem as one with the field `name` of the value it is in.
function inField(name: string, problem: Problem | undefined): Problem | undefined {
  return problem && { ...problem, field: [name, ...problem.field] };
}

function firstProblem<T>(items: readonly T[], check: (item: T) => Problem | undefined): Problem | undefined {
  return items.reduce<Problem | undefined>((found, item) => found ?? check(item), undefined);
}

function quoted(value: unknown): string {
  return JSON.stringify(value);
}

// Checks that a value is there and passes `test`, or else is wrong as `message` says for it.
function checkThat(test: (value: unknown) => boolean, message: (value: unknown) => string): Check {
  return (value) => {
    if (value === undefined) return wrong("is missing");
    return test(value) ? undefined : wrong(message(value));
  };
}

// Lets a value be left out, but checks it when it is there.
function optional(check: Check): Check {
  return (value) => (value === undefined ? undefined : check(value));
}

const string = checkThat(
  (value) => typeof value === "string",
  () => "should be text",
);

// The furthest from 0 a number in a Sketch can be, far beyond any real one. A larger one, or one so large it reads as
// infinite, could overflow when the editor adds numbers up, and an infinite one can't be written back to JSON.
const furthestFromZero = 1e9;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Math.abs(value) <= furthestFromZero;
}

const number = checkThat(isNumber, (value) =>
  typeof value === "number"
    ? `should be a number from ${-furthestFromZero} to ${furthestFromZero}`
    : "should be a number",
);

// A number above 0, such as the width or height of a Shape.
const positive = checkThat(
  (value) => isNumber(value) && value > 0,
  (value) => (typeof value === "number" ? `should be above 0 and at most ${furthestFromZero}` : "should be a number"),
);

function between(min: number, max: number): Check {
  return checkThat(
    (value) => isNumber(value) && value >= min && value <= max,
    () => `should be a number from ${min} to ${max}`,
  );
}

function oneOf(values: readonly unknown[]): Check {
  return checkThat(
    (value) => values.includes(value),
    (value) => `${quoted(value)} should be one of ${values.map(quoted).join(", ")}`,
  );
}

// An object with a value for each of `fields` that passes its check. Other fields are left as they are.
function object(fields: Readonly<Record<string, Check>>): Check {
  return (value) => {
    if (value === undefined) return wrong("is missing");
    if (!isObject(value)) return wrong("should be an object");
    return firstProblem(Object.entries(fields), ([name, check]) => inField(name, check(value[name])));
  };
}

// An object that is one of several kinds, told apart by its `kind`, and checked as that kind is.
function kinds(checks: Readonly<Record<string, Check>>): Check {
  const kind = object({ kind: oneOf(Object.keys(checks)) });
  return (value) => kind(value) ?? checks[(value as { kind: string }).kind]?.(value);
}

const symbol = checkThat(
  (value) => (symbolIds as readonly unknown[]).includes(value),
  (value) => (typeof value === "string" ? `${quoted(value)} isn't a known Symbol` : "should be text"),
);

const point = object({ x: number, y: number });

const style = object({
  strokeColor: oneOf(palette),
  fill: oneOf(fills),
  strokePattern: oneOf(strokePatterns),
  strokeWidth: oneOf(strokeWidths),
  fontSize: oneOf(fontSizes),
});

// What every Shape has. A Shape at the top level has no parent in JSON.
const shapeFields = { id: string, parent: optional(string), z: number, style };

// The Symbol comes first, as a Shape from an unknown one is likely to lack what it would have too.
const symbolShape = object({
  symbol,
  ...shapeFields,
  bounds: object({ x: number, y: number, width: positive, height: positive }),
  label: object({
    text: string,
    alignment: object({ horizontal: oneOf(horizontalAlignments), vertical: oneOf(verticalAlignments) }),
  }),
});

const arrowEnd = kinds({
  port: object({ shape: string, port: number }),
  outline: object({ shape: string, at: point }),
  floating: object({ at: point }),
});

const arrow = object({
  ...shapeFields,
  routing: oneOf(routings),
  start: arrowEnd,
  end: arrowEnd,
  heads: object({ start: oneOf(arrowheads), end: oneOf(arrowheads) }),
  label: object({ text: string, along: between(0, 1) }),
  elbowOffset: optional(object({ axis: oneOf(axes), by: number })),
});

// Left out of files written before Sketches were exported with their zoom and pan.
const zoomAndPan = optional(object({ x: number, y: number, zoom: between(minimumZoom, maximumZoom) }));

// An Arrow is told apart by its Routing, as `isArrow` does.
const shape: Check = (value) => (isObject(value) && "routing" in value ? arrow(value) : symbolShape(value));

type Shapes = Sketch["shapes"];

function shapeIn(shapes: Shapes, id: ShapeId): Shape | undefined {
  return Object.hasOwn(shapes, id) ? shapes[id] : undefined;
}

// Whether a chain of parents from `id` reaches `ancestor`, taking at most `steps` steps, so a loop ends.
function reaches(shapes: Shapes, id: ShapeId | undefined, ancestor: ShapeId, steps: number): boolean {
  if (id === undefined || steps < 0) return false;
  return id === ancestor || reaches(shapes, shapeIn(shapes, id)?.parent, ancestor, steps - 1);
}

function parentMisfit(shapes: Shapes, shape: Shape): Problem | undefined {
  const { parent } = shape;
  if (parent === undefined) return undefined;
  const container = shapeIn(shapes, parent);
  const message =
    container === undefined
      ? `${quoted(parent)} isn't a Shape in the file`
      : isArrow(container) || !symbolDefinition(container.symbol).canBeContainer
        ? `${quoted(parent)} isn't a Container`
        : reaches(shapes, parent, shape.id, Object.keys(shapes).length)
          ? `${quoted(parent)} is inside it`
          : undefined;
  return message === undefined ? undefined : inField("parent", wrong(message));
}

// What is wrong with the Shape an Arrow end is bound to, if it is bound at all.
function bindingMisfit(shapes: Shapes, end: ArrowEnd): Problem | undefined {
  if (end.kind === "floating") return undefined;
  const bound = shapeIn(shapes, end.shape);
  if (bound === undefined) return inField("shape", wrong(`${quoted(end.shape)} isn't a Shape in the file`));
  if (isArrow(bound)) return inField("shape", wrong(`${quoted(end.shape)} is an Arrow, and Arrows can't be bound to`));
  if (end.kind === "outline") return undefined;
  const ports = shapeGeometry(bound.symbol, bound.bounds).ports.length;
  if (Number.isInteger(end.port) && end.port >= 0 && end.port < ports) return undefined;
  const port = `the number of one of the Ports of ${quoted(end.shape)}, from 0 to ${ports - 1}`;
  return inField("port", wrong(`${end.port} should be ${port}`));
}

function endMisfit(shapes: Shapes, shape: Shape): Problem | undefined {
  if (!isArrow(shape)) return undefined;
  return inField("start", bindingMisfit(shapes, shape.start)) ?? inField("end", bindingMisfit(shapes, shape.end));
}

// What is wrong with how a Shape, listed under `id`, fits with the others: what it refers to must be there.
function misfit(shapes: Shapes, id: ShapeId, shape: Shape): Problem | undefined {
  if (shape.id !== id) {
    return inField("id", wrong(`${quoted(shape.id)} should be ${quoted(id)}, the ID it is listed under`));
  }
  return parentMisfit(shapes, shape) ?? endMisfit(shapes, shape);
}

function problemText({ field, message }: Problem): string {
  return `${field.length === 0 ? "it" : field.join(".")} ${message}`;
}

function shapeError(id: ShapeId, problem: Problem): string {
  return `Shape ${quoted(id)} in the file is invalid: ${problemText(problem)}.`;
}

// The Sketch, if the Shapes are as Skisse writes them in the current format version, or else what is wrong with them.
function sketchOf(shapes: unknown): { readonly sketch: Sketch } | { readonly error: string } {
  if (!isObject(shapes)) return { error: "The file has no Shapes." };
  const entries = Object.entries(shapes);
  const malformed = entries
    .map(([id, value]) => ({ id, problem: shape(value) }))
    .find(({ problem }) => problem !== undefined);
  if (malformed?.problem) return { error: shapeError(malformed.id, malformed.problem) };
  const checked = shapes as Shapes;
  const misfitting = entries
    .map(([id, value]) => ({ id, problem: misfit(checked, id, value as Shape) }))
    .find(({ problem }) => problem !== undefined);
  if (misfitting?.problem) return { error: shapeError(misfitting.id, misfitting.problem) };
  return { sketch: { shapes: checked } };
}

// The Sketch and its zoom and pan in a file in the current format version, or else what is wrong with them.
function contentOf(file: JsonFile): JsonImport {
  const imported = sketchOf(file.shapes);
  if ("error" in imported) return imported;
  const problem = zoomAndPan(file.viewport);
  if (problem) return { error: `The zoom and pan in the file are invalid: ${problemText(problem)}.` };
  return { ...imported, viewport: file.viewport as Viewport | undefined };
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The Sketch, and the zoom and pan it was exported at, in the text of a JSON file, migrated from the format version it is in to the current one, or why it
 * can't be imported. Tests can pass `chain` to take the place of the real migrations.
 */
export function importJson(text: string, chain: readonly Migration[] = migrations): JsonImport {
  const file = parse(text);
  if (file === undefined) return { error: "The file isn't valid JSON." };
  if (!isObject(file) || file.format !== format) return { error: "The file isn't a Skisse Sketch." };
  const { version } = file;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { error: "The file has no valid format version." };
  }
  const latest = latestVersion(chain);
  if (version > latest) {
    const newer = `The file is in format version ${version}, from a newer Skisse than this one`;
    return { error: `${newer}, which reads up to version ${latest}. Reload the page to update Skisse.` };
  }
  const migrated = chain.slice(version - 1).reduce((migrating, migrate) => migrate(migrating), file);
  return contentOf(migrated);
}
