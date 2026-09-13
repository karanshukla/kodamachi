import { type Database } from "../database/db";

export interface Message {
  tid: string;
  message: string;
  createdAt: string;
  recipient: string;
}

export interface InboxStore {
  list(recipient: string): Promise<Message[]>;
  find(tid: string): Promise<Message | undefined>;
  putIgnoringDuplicates(messages: Message[]): Promise<void>;
  remove(tid: string): Promise<void>;
  clear(recipient: string): Promise<void>;
}

export class KyselyInboxStore implements InboxStore {
  constructor(private db: Database) {}

  async list(recipient: string): Promise<Message[]> {
    return await this.db
      .selectFrom("message")
      .selectAll()
      .where("recipient", "=", recipient)
      .orderBy("createdAt", "desc")
      .execute();
  }

  async find(tid: string): Promise<Message | undefined> {
    return await this.db
      .selectFrom("message")
      .selectAll()
      .where("tid", "=", tid)
      .executeTakeFirst();
  }

  async putIgnoringDuplicates(messages: Message[]): Promise<void> {
    await this.db
      .insertInto("message")
      .values(messages)
      .onConflict((oc) => oc.column("tid").doNothing())
      .execute();
  }

  async remove(tid: string): Promise<void> {
    await this.db.deleteFrom("message").where("tid", "=", tid).execute();
  }

  async clear(recipient: string): Promise<void> {
    await this.db.deleteFrom("message").where("recipient", "=", recipient).execute();
  }
}
