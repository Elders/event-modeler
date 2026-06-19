// The Miro implementation of the Store port: board app data, which travels
// with the board and survives reloads. App-data calls count against the same
// rate limit as item calls, so they go through the shared limiter too.

import type { Store } from '../../ports/store';
import { withRateLimit } from './rateLimit';

export class MiroStore implements Store {
  async read<T>(key: string, fallback: T): Promise<T> {
    try {
      const value = await withRateLimit(() => miro.board.getAppData(key));
      return (value ?? fallback) as T;
    } catch (error) {
      console.warn(`Could not read app data "${key}"`, error);
      return fallback;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    try {
      await withRateLimit(() =>
        miro.board.setAppData(key, value as Parameters<typeof miro.board.setAppData>[1]),
      );
    } catch (error) {
      console.warn(`Could not write app data "${key}"`, error);
    }
  }
}
