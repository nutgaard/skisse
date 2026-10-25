import { arrowheads, routings, type ArrowEnd } from "./arrow";
import type { Shape, ShapeId, Sketch } from "./editor";
import { axes } from "./elbow";
import { shapeGeometry } from "./shape-geometry";
import { isArrow } from "./shape-kind";
import { fills, fontSizes, palette, strokePatterns, strokeWidths } from "./style";
import { symbolDefinition, symbolIds } from "./symbols";
import { horizontalAlignments, verticalAlignments } from "./symbols/symbol";

// Marks a file as a Skisse Sketch, so any other JSON is never taken for one.
const format = "skisse/sketch";

/** A JSON file's top-level object. */
type JsonDocument = Readonly<Record<string, unknown>>;

/** Turns a JSON file in one format version into one in the next. */
export type Migration = (document: JsonDocument) => JsonDocument;

/**
 * The migration from each format version to the next, oldest first. The first version is 1, and the current one comes
 * after the last migration. A change to the format adds a migration here, so files written before it still import.
 */
const migrations: readonly Migration[] = [];

function latestVersion(migrations: readonly Migration[]): number {
  return migrations.length + 1;
}

/** What importing a JSON file gives: the Sketch in it, or why it can't be imported, to show to the user. */
export type JsonImport = { readonly sketch: Sketch } | { readonly error: string };

/** The Sketch as the text of a JSON file, marked with the format version it is written in. */
export function exportJson(sketch: Sketch): string {
  return JSON.stringify({ format, version: latestVersion(migrations), shapes: sketch.shapes }, undefined, 2);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// What is wrong with a value read from a file: the field inside it that is wrong, if any, and what is wrong with that.
type Problem = { readonly field: readonly string[]; readonly problem: string };

// Gives what is wrong with a value read from a file, or `undefined` when nothing is.
type Check = (value: unknown) => Problem | undefined;

function wrong(problem: string): Problem {
  return { field: [], problem };
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

// Checks that a value is there and passes `test`, or else has the problem `problem` gives for it.
function check(test: (value: unknown) => boolean, problem: (value: unknown) => string): Check {
  return (value) => {
    if (value === undefined) return wrong("is missing");
    return test(value) ? undefined : wrong(problem(value));
  };
}

// Lets a value be left out, but checks it when it is there.
function optional(check: Check): Check {
  return (value) => (value === undefined ? undefined : check(value));
}

const string = check(
  (value) => typeof value === "string",
  () => "should be text",
);

const number = check(
  (value) => typeof value === "number",
  () => "should be a number",
);

function between(min: number, max: number): Check {
  return check(
    (value) => typeof value === "number" && value >= min && value <= max,
    () => `should be a number from ${min} to ${max}`,
  );
}

function oneOf(values: readonly unknown[]): Check {
  return check(
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

const symbol = check(
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
  bounds: object({ x: number, y: number, width: number, height: number }),
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
  const problem =
    container === undefined
      ? `${quoted(parent)} isn't a Shape in the file`
      : isArrow(container) || !symbolDefinition(container.symbol).canBeContainer
        ? `${quoted(parent)} isn't a Container`
        : reaches(shapes, parent, shape.id, Object.keys(shapes).length)
          ? `${quoted(parent)} is inside it`
          : undefined;
  return problem === undefined ? undefined : inField("parent", wrong(problem));
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

function shapeError(id: ShapeId, { field, problem }: Problem): string {
  return `Shape ${quoted(id)} in the file is invalid: ${field.length === 0 ? "it" : field.join(".")} ${problem}.`;
}

// The Sketch, if the Shapes are as Skisse writes them in the current format version, or else what is wrong with them.
function sketchOf(shapes: unknown): JsonImport {
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

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The Sketch in the text of a JSON file, migrated from the format version it is in to the current one, or why it
 * can't be imported. Tests can pass `chain` to take the place of the real migrations.
 */
export function importJson(text: string, chain: readonly Migration[] = migrations): JsonImport {
  const document = parse(text);
  if (document === undefined) return { error: "The file isn't valid JSON." };
  if (!isObject(document) || document.format !== format) return { error: "The file isn't a Skisse Sketch." };
  const { version } = document;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { error: "The file has no valid format version." };
  }
  const latest = latestVersion(chain);
  if (version > latest) {
    const newer = `The file is in format version ${version}, from a newer Skisse than this one`;
    return { error: `${newer}, which reads up to version ${latest}. Reload the page to update Skisse.` };
  }
  const migrated = chain.slice(version - 1).reduce((migrating, migrate) => migrate(migrating), document);
  return sketchOf(migrated.shapes);
}
