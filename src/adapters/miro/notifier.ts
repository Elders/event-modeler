// The Miro implementation of the Notifier port: board notification toasts.
// Miro truncates around 80 characters, so callers keep messages short.

import type { Notifier } from '../../ports/notifier';

export class MiroNotifier implements Notifier {
  async info(message: string): Promise<void> {
    await miro.board.notifications.showInfo(message);
  }

  async error(message: string): Promise<void> {
    await miro.board.notifications.showError(message.slice(0, 78));
  }
}
