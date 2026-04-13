import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

test("protected routes receive no-store headers when authenticated", () => {
  const request = new NextRequest("https://example.test/es/dashboard", {
    headers: { cookie: "saw_session=test-token" },
  });

  const response = middleware(request);
  assert.ok(response);
  assert.equal(
    response.headers.get("cache-control"),
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
});

test("protected routes redirect to localized login when unauthenticated", () => {
  const request = new NextRequest("https://example.test/es/dashboard");
  const response = middleware(request);

  assert.ok(response);
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://example.test/es/login?next=%2Fes%2Fdashboard",
  );
});

test("mock fallback does not bypass login on non-local hosts", () => {
  const previous = process.env.AUTH_ALLOW_MOCK_FALLBACK;
  process.env.AUTH_ALLOW_MOCK_FALLBACK = "true";

  try {
    const request = new NextRequest("https://example.test/es/dashboard");
    const response = middleware(request);

    assert.ok(response);
    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get("location"),
      "https://example.test/es/login?next=%2Fes%2Fdashboard",
    );
  } finally {
    if (previous === undefined) {
      delete process.env.AUTH_ALLOW_MOCK_FALLBACK;
    } else {
      process.env.AUTH_ALLOW_MOCK_FALLBACK = previous;
    }
  }
});
