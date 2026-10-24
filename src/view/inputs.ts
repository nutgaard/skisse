import type { KeyInput, Modifiers } from "../engine";

type ModifierKeys = Pick<KeyboardEvent, "shiftKey" | "altKey" | "ctrlKey" | "metaKey">;

export function modifiersOf(event: ModifierKeys): Modifiers {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
  };
}

export function keyInput(type: KeyInput["type"], event: ModifierKeys & Pick<KeyboardEvent, "key">): KeyInput {
  return {
    type,
    key: event.key,
    modifiers: modifiersOf(event),
  };
}
