import type { InboxStore, Message } from "../../services/inbox-store";

export class MemoryInboxStore implements InboxStore {
  rows = new Map<string, Message>();
  putCalls: Message[][] = [];
  failing = false;

  private check(): void {
    if (this.failing) throw new Error("store unavailable");
  }

  async list(recipient: string): Promise<Message[]> {
    this.check();
    return [...this.rows.values()].filter((m) => m.recipient === recipient);
  }

  async find(tid: string): Promise<Message | undefined> {
    this.check();
    return this.rows.get(tid);
  }

  async putIgnoringDuplicates(messages: Message[]): Promise<void> {
    this.check();
    this.putCalls.push(messages);
    for (const m of messages) if (!this.rows.has(m.tid)) this.rows.set(m.tid, m);
  }

  async remove(tid: string): Promise<void> {
    this.check();
    this.rows.delete(tid);
  }

  async clear(recipient: string): Promise<void> {
    this.check();
    for (const [tid, m] of this.rows) if (m.recipient === recipient) this.rows.delete(tid);
  }
}
