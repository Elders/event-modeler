// The Miro implementation of the Store port: board app data, which travels
// with the board and survives reloads.

import type { Store } from '../../ports/store';

export class MiroStore implements Store {
  async read<T>(key: string, fallback: T): Promise<T> {
    try {
      const value = await miro.board.getAppData(key);
      return (value ?? fallback) as T;
    } catch (error) {
      console.warn(`Could not read app data "${key}"`, error);
      return fallback;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    try {
      await miro.board.setAppData(key, value as Parameters<typeof miro.board.setAppData>[1]);
    } catch (error) {
      console.warn(`Could not write app data "${key}"`, error);
    }
  }
}
