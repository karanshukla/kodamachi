/**
 * The push-event contract, shared by sw.ts and the server's dispatcher. Every
 * field is optional: the service worker defaults anything missing, and extra
 * fields the server sends are ignored.
 */
export interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  did?: string;
  handle?: string;
}
