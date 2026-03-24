import { describe, expect, it } from "vitest";

import {
  getClientIp,
  getNormalizedRateLimitSubject,
} from "./rateLimitSubject.server";

describe("rateLimitSubject.server", () => {
  it("prefers cf-connecting-ip and normalizes casing/whitespace", () => {
    const request = new Request("https://example.com", {
      headers: {
        "cf-connecting-ip": "  203.0.113.10  ",
        "x-forwarded-for": "198.51.100.20",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("falls back to the first x-forwarded-for hop", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "198.51.100.20, 198.51.100.21",
      },
    });

    expect(getClientIp(request)).toBe("198.51.100.20");
  });

  it("keeps unknown IPs rate-limitable", () => {
    const request = new Request("https://example.com");

    expect(getClientIp(request)).toBe("unknown");
    expect(getNormalizedRateLimitSubject(request, { shopId: "shop-a.myshopify.com" })).toBe(
      "shop:shop-a.myshopify.com:ip:unknown",
    );
  });
});
