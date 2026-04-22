import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPptCustomSkillsFromStorage,
  readStoredEnrichBatchSize,
  scheduleSavePptCustomSkills,
  writeStoredEnrichBatchSize
} from "./pptFrameworkUserSettings";

function mockStorage() {
  const m = new Map<string, string>();
  const s = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    clear: () => {
      m.clear();
    },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() {
      return m.size;
    }
  } as Storage;
  return { s, m };
}

describe("pptFrameworkUserSettings — enrich batch", () => {
  let real: Storage | undefined;

  beforeEach(() => {
    real = globalThis.localStorage;
    const { s, m } = mockStorage();
    vi.stubGlobal("localStorage", s);
    m.set("unbox.ppt.enrichBatchSize", "2");
  });

  afterEach(() => {
    if (real !== undefined) {
      vi.stubGlobal("localStorage", real);
    } else {
      // @ts-expect-error cleanup
      delete globalThis.localStorage;
    }
    vi.unstubAllGlobals();
  });

  it("readStoredEnrichBatchSize returns clamped int", () => {
    expect(readStoredEnrichBatchSize()).toBe(2);
  });

  it("writeStoredEnrichBatchSize persists clamped value", () => {
    writeStoredEnrichBatchSize(99);
    expect(globalThis.localStorage.getItem("unbox.ppt.enrichBatchSize")).toBe("8");
  });
});

describe("loadPptCustomSkillsFromStorage", () => {
  let real: Storage | undefined;

  beforeEach(() => {
    real = globalThis.localStorage;
    const { s, m } = mockStorage();
    vi.stubGlobal("localStorage", s);
    m.set(
      "unbox.ppt.customSkills.v1",
      JSON.stringify([{ name: "N", instruction: "I", enabled: true }])
    );
  });

  afterEach(() => {
    if (real !== undefined) {
      vi.stubGlobal("localStorage", real);
    } else {
      // @ts-expect-error cleanup
      delete globalThis.localStorage;
    }
    vi.unstubAllGlobals();
  });

  it("restores name/instruction and assigns new ids", () => {
    const rows = loadPptCustomSkillsFromStorage();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("N");
    expect(rows[0]!.instruction).toBe("I");
    expect(rows[0]!.enabled).toBe(true);
    expect(rows[0]!.id).toMatch(/^ppt_/);
  });
});

describe("scheduleSavePptCustomSkills", () => {
  let real: Storage | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    real = globalThis.localStorage;
    const { s } = mockStorage();
    vi.stubGlobal("localStorage", s);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (real !== undefined) {
      vi.stubGlobal("localStorage", real);
    } else {
      // @ts-expect-error
      delete globalThis.localStorage;
    }
    vi.unstubAllGlobals();
  });

  it("debounces writes to the skills key", () => {
    scheduleSavePptCustomSkills(
      [{ name: "A", instruction: "x", enabled: true }],
      400
    );
    expect(globalThis.localStorage.getItem("unbox.ppt.customSkills.v1")).toBeNull();
    vi.advanceTimersByTime(400);
    const raw = globalThis.localStorage.getItem("unbox.ppt.customSkills.v1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual([{ name: "A", instruction: "x", enabled: true }]);
  });
});
