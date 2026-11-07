import { describe, expect, it } from "vitest";

import { defaultLinkSection } from "./defaultLinkSection";

describe("defaultLinkSection", () => {
  it("opens Instagram links in Reader View when available", () => {
    expect(
      defaultLinkSection(
        "https://www.instagram.com/reel/abc/",
        null,
        "instagram",
        "overview",
      ),
    ).toBe("cached");
    expect(
      defaultLinkSection(
        "https://instagram.com/example/",
        "readable",
        undefined,
        "screenshot",
      ),
    ).toBe("cached");
  });

  it("retains existing defaults when Reader View is unavailable or the link is not Instagram", () => {
    expect(
      defaultLinkSection(
        "https://instagram.com/reel/abc/",
        "unavailable",
        "instagram",
        "overview",
      ),
    ).toBe("instagram");
    expect(
      defaultLinkSection(
        "https://notinstagram.com/reel/abc/",
        "readable",
        undefined,
        "overview",
      ),
    ).toBe("overview");
    expect(defaultLinkSection("invalid", null, undefined, "screenshot")).toBe(
      "screenshot",
    );
  });
});
