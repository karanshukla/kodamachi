import type { DrainMarker } from "../../services/inbox-drain-marker";

export class MemoryDrainMarker implements DrainMarker {
  drained = new Set<string>();

  async isDrained(recipient: string): Promise<boolean> {
    return this.drained.has(recipient);
  }

  async markDrained(recipient: string): Promise<void> {
    this.drained.add(recipient);
  }
}
