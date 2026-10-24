import type { ReactNode } from "react";

/** One of a few values to choose, as a button: what it shows, such as a short name, and what it does in full. */
export type Choice<T> = { readonly value: T; readonly name: ReactNode; readonly title: string };

type ChoicesProps<T> = {
  readonly choices: readonly Choice<T>[];
  /** The value chosen, or `undefined` when the selected Shapes differ. */
  readonly chosen: T | undefined;
  readonly onChoose: (value: T) => void;
};

/**
 * A button for each choice. They keep the focus where it is, so they change a Label being edited without finishing the
 * editing.
 */
export function Choices<T extends string>({ choices, chosen, onChoose }: ChoicesProps<T>) {
  return choices.map((choice) => (
    <button
      key={choice.value}
      type="button"
      aria-pressed={choice.value === chosen}
      aria-label={choice.title}
      title={choice.title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onChoose(choice.value)}
    >
      {choice.name}
    </button>
  ));
}
