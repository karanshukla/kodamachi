import type { Logger } from "pino";

import type { InboxStore, Message, Question } from "./inbox-store";

/**
 * Both halves must succeed for a write or delete to succeed. Writes land in the
 * table before the space and deletes leave the space before the table, so
 * whichever half fails, the table never lacks a question the space still has.
 * That is what keeps a rollback to the table safe during the bake.
 * @see [dual-write-inbox-store.test.ts](../tests/dual-write-inbox-store.test.ts) —
 * one test per half failing, for writes, removes and clears.
 */
export class DualWriteInboxStore implements InboxStore {
  constructor(
    private table: InboxStore,
    private space: InboxStore,
    private logger: Logger
  ) {}

  async list(recipient: string): Promise<Message[]> {
    return await this.readSpaceFirst(
      () => this.space.list(recipient),
      () => this.table.list(recipient),
      { recipient, op: "list" }
    );
  }

  async find(recipient: string, tid: string): Promise<Message | undefined> {
    return await this.readSpaceFirst(
      () => this.space.find(recipient, tid),
      () => this.table.find(recipient, tid),
      { recipient, tid, op: "find" }
    );
  }

  async putIgnoringDuplicates(recipient: string, questions: Question[]): Promise<void> {
    await this.table.putIgnoringDuplicates(recipient, questions);
    await this.space.putIgnoringDuplicates(recipient, questions);
  }

  async remove(recipient: string, tid: string): Promise<void> {
    await this.space.remove(recipient, tid);
    await this.table.remove(recipient, tid);
  }

  async clear(recipient: string): Promise<void> {
    await this.space.clear(recipient);
    await this.table.clear(recipient);
  }

  private async readSpaceFirst<T>(
    fromSpace: () => Promise<T>,
    fromTable: () => Promise<T>,
    context: Record<string, string>
  ): Promise<T> {
    try {
      return await fromSpace();
    } catch (err) {
      this.logger.warn({ err, ...context }, "Space read failed, serving from the table");
      return await fromTable();
    }
  }
}
