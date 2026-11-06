import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { fallbackChain, preferredMode } = await import("../src/lib/ai/config");

const keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AI_PROVIDER"] as const;
const set = (env: Partial<Record<(typeof keys)[number], string>>) => {
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
};
afterEach(() => set({}));

describe("provider selection", () => {
  it("runs in demo mode with no keys", () => {
    set({});
    expect(preferredMode()).toBe("demo");
    expect(fallbackChain("demo")).toEqual(["demo"]);
  });

  it("prefers OpenAI, then Claude, when keys exist", () => {
    set({ OPENAI_API_KEY: "x", ANTHROPIC_API_KEY: "y" });
    expect(preferredMode()).toBe("openai");
    set({ ANTHROPIC_API_KEY: "y" });
    expect(preferredMode()).toBe("anthropic");
  });

  it("lets AI_PROVIDER choose, but only if that key exists", () => {
    set({ OPENAI_API_KEY: "x", ANTHROPIC_API_KEY: "y", AI_PROVIDER: "anthropic" });
    expect(preferredMode()).toBe("anthropic");
    set({ OPENAI_API_KEY: "x", AI_PROVIDER: "anthropic" });
    expect(preferredMode()).toBe("openai");
  });

  it("falls back from a failing provider to the other one, then to demo", () => {
    set({ OPENAI_API_KEY: "x", ANTHROPIC_API_KEY: "y" });
    expect(fallbackChain("openai")).toEqual(["openai", "anthropic", "demo"]);
    set({ OPENAI_API_KEY: "x" });
    expect(fallbackChain("openai")).toEqual(["openai", "demo"]);
  });

  it("ignores keys that are only spaces", () => {
    set({ OPENAI_API_KEY: "   " });
    expect(preferredMode()).toBe("demo");
  });
});
