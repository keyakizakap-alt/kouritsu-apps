import type { Note } from '../domain/types';

// Web プレビューにはウィジェットが無いため何もしない
export async function pushWidgets(_notes: Note[]): Promise<void> {}
export async function pullWidgetEdits(_notes: Note[]): Promise<Note[]> {
  return [];
}
export function onWidgetInteraction(_listener: () => void): () => void {
  return () => {};
}
