import { describe, expect, it } from "vitest";
import { NOT_FOUND, quoteAnswer } from "../src/lib/answer";
import { splitIntoChunks } from "../src/lib/chunk";

describe("splitIntoChunks", () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about topic ${i}.`).join(" ");

  it("keeps chunks near the size limit and tags each with its page", () => {
    const chunks = splitIntoChunks([{ page: 3, text }], 300, 60);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(300);
      expect(c.page).toBe(3);
    }
  });

  it("overlaps neighbouring chunks so nothing is cut in half", () => {
    const [a, b] = splitIntoChunks([{ page: 1, text }], 300, 60);
    expect(b.text.slice(0, 20)).toSatisfy((start: string) => a.text.includes(start.split(" ").slice(1, 3).join(" ")));
  });

  it("never crosses pages", () => {
    const chunks = splitIntoChunks([{ page: 1, text: "Page one text." }, { page: 2, text: "Page two text." }]);
    expect(chunks.map((c) => c.page)).toEqual([1, 2]);
  });
});

describe("quoteAnswer (demo mode)", () => {
  const found = [{ page: 2, score: 0.5, text: "Every team member gets 25 paid vacation days per year. Sick leave is separate." }];

  it("quotes the best sentence with its page", () => {
    expect(quoteAnswer("How many vacation days do I get?", found)).toEqual({ text: "Every team member gets 25 paid vacation days per year. (page 2)", pages: [2] });
  });

  it("says it doesn't know instead of guessing", () => {
    expect(quoteAnswer("Who is the CEO's favourite band?", found).text).toBe(NOT_FOUND);
  });
});

describe("packVectors / unpackVectors", () => {
  it("round-trips vectors through base64 so the browser can carry them", async () => {
    const { packVectors, unpackVectors } = await import("../src/lib/store");
    const v = [[0.5, -0.25, 1], [0, 0.125, -1]];
    expect(unpackVectors(packVectors(v), 2)).toEqual(v);
  });
});
