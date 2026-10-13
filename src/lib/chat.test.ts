import { describe, expect, it } from "vitest";
import { fresh, mergeMessages, type ChatMessage } from "./chatList";

const m = (id: number, at = 0): ChatMessage => ({ id, author: "a", name: "A", body: `m${id}`, at });

describe("chat", () => {
  it("fusionne sans doublon et dans l'ordre", () => {
    expect(mergeMessages([m(1), m(3)], [m(2), m(3)]).map((x) => x.id)).toEqual([1, 2, 3]);
  });
  it("ne garde que les 120 derniers messages", () => {
    const many = Array.from({ length: 150 }, (_, i) => m(i + 1));
    const kept = mergeMessages([], many);
    expect(kept).toHaveLength(120);
    expect(kept[0].id).toBe(31);
  });
  it("cache les messages de plus de 24 h", () => {
    const now = 100 * 3_600_000;
    expect(fresh([m(1, now - 25 * 3_600_000), m(2, now - 3_600_000)], now).map((x) => x.id)).toEqual([2]);
  });
});
