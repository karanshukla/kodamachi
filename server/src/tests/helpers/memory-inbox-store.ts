import type { InboxStore, Message, Question } from "../../services/inbox-store";

/** One map per recipient, as one space per recipient. */
export class MemoryInboxStore implements InboxStore {
  spaces = new Map<string, Map<string, Question>>();
  putCalls: { recipient: string; questions: Question[] }[] = [];
  failing = false;

  private check(): void {
    if (this.failing) throw new Error("store unavailable");
  }

  private space(recipient: string): Map<string, Question> {
    let space = this.spaces.get(recipient);
    if (!space) this.spaces.set(recipient, (space = new Map()));
    return space;
  }

  seed(recipient: string, question: Question): void {
    this.space(recipient).set(question.tid, question);
  }

  tids(recipient: string): string[] {
    return [...this.space(recipient).keys()];
  }

  get size(): number {
    return [...this.spaces.values()].reduce((sum, space) => sum + space.size, 0);
  }

  async list(recipient: string): Promise<Message[]> {
    this.check();
    return [...this.space(recipient).values()].map((q) => ({ ...q, recipient }));
  }

  async find(recipient: string, tid: string): Promise<Message | undefined> {
    this.check();
    const question = this.space(recipient).get(tid);
    return question && { ...question, recipient };
  }

  async putIgnoringDuplicates(recipient: string, questions: Question[]): Promise<void> {
    this.check();
    this.putCalls.push({ recipient, questions });
    const space = this.space(recipient);
    for (const q of questions) {
      if (!space.has(q.tid)) {
        space.set(q.tid, { tid: q.tid, message: q.message, createdAt: q.createdAt });
      }
    }
  }

  async remove(recipient: string, tid: string): Promise<void> {
    this.check();
    this.space(recipient).delete(tid);
  }

  async clear(recipient: string): Promise<void> {
    this.check();
    this.spaces.delete(recipient);
  }
}
