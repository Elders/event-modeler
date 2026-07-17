// The Miro implementation of the Store port: board app data, which travels
// with the board and survives reloads. App-data calls count against the same
// rate limit as item calls, so they go through the shared limiter too.
//
// Neither call catches. A read that returned its fallback on failure claimed the
// registry was empty, and a write that swallowed its failure claimed to have
// persisted — the second one especially, because app data has a tight total
// budget (~31 KB, see DECISIONS.md) and going over it is exactly when a write
// fails. Silently losing a fields record and reporting success is how a screen's
// box became unrebuildable. A missing key is still a normal answer, and still
// returns the fallback.

import type { Store } from '../../ports/store';
import { withRateLimit } from './rateLimit';

export class MiroStore implements Store {
  async read<T>(key: string, fallback: T): Promise<T> {
    const value = await withRateLimit('appData', () => miro.board.getAppData(key));
    return (value ?? fallback) as T;
  }

  async write(key: string, value: unknown): Promise<void> {
    await withRateLimit('appData', () =>
      miro.board.setAppData(key, value as Parameters<typeof miro.board.setAppData>[1]),
    );
  }
}
