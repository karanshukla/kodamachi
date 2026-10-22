import { type Database } from "../database/db";

/** A question as its recipient's space holds it: the space is the recipient. */
export interface Question {
  tid: string;
  message: string;
  createdAt: string;
}

export interface Message extends Question {
  recipient: string;
}

/**
 * Every call names the recipient whose inbox it touches, because a space
 * addresses a record by its space and rkey and holds only its owner's questions.
 * @see [inbox-store.test.ts](../tests/inbox-store.test.ts) — "finds nothing for
 * another recipient's tid" and "leaves another recipient's question in place".
 */
export interface InboxStore {
  list(recipient: string): Promise<Message[]>;
  find(recipient: string, tid: string): Promise<Message | undefined>;
  putIgnoringDuplicates(recipient: string, questions: Question[]): Promise<void>;
  remove(recipient: string, tid: string): Promise<void>;
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

  async find(recipient: string, tid: string): Promise<Message | undefined> {
    return await this.db
      .selectFrom("message")
      .selectAll()
      .where("recipient", "=", recipient)
      .where("tid", "=", tid)
      .executeTakeFirst();
  }

  async putIgnoringDuplicates(recipient: string, questions: Question[]): Promise<void> {
    await this.db
      .insertInto("message")
      .values(
        questions.map(({ tid, message, createdAt }) => ({ tid, message, createdAt, recipient }))
      )
      .onConflict((oc) => oc.column("tid").doNothing())
      .execute();
  }

  async remove(recipient: string, tid: string): Promise<void> {
    await this.db
      .deleteFrom("message")
      .where("recipient", "=", recipient)
      .where("tid", "=", tid)
      .execute();
  }

  async clear(recipient: string): Promise<void> {
    await this.db.deleteFrom("message").where("recipient", "=", recipient).execute();
  }
}
