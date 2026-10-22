import { type Database } from "../database/db";

/** Whether a recipient's inbox has been moved into their space. */
export interface DrainMarker {
  isDrained(recipient: string): Promise<boolean>;
  markDrained(recipient: string): Promise<void>;
}

export class KyselyDrainMarker implements DrainMarker {
  constructor(private db: Database) {}

  async isDrained(recipient: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("inbox_drain")
      .select("did")
      .where("did", "=", recipient)
      .executeTakeFirst();
    return row !== undefined;
  }

  async markDrained(recipient: string): Promise<void> {
    await this.db
      .insertInto("inbox_drain")
      .values({ did: recipient, drainedAt: new Date().toISOString() })
      .onConflict((oc) => oc.column("did").doNothing())
      .execute();
  }
}
