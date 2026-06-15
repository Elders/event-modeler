// The Notifier port: user-facing feedback for multi-step interactions and
// failures. The host decides how to surface it (toasts, banners, etc.).

export interface Notifier {
  info(message: string): Promise<void>;
  error(message: string): Promise<void>;
}
