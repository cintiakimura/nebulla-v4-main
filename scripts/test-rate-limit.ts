import assert from "node:assert/strict";
import {
  createRateLimiter,
  isAiRateLimitedPath,
  resetRateLimitStore,
} from "../lib/rateLimit";

function mockReq(ip = "1.2.3.4") {
  return {
    ip,
    headers: {},
    socket: { remoteAddress: ip },
  } as any;
}

function mockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;
  return {
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    status(c: number) {
      statusCode = c;
      return this;
    },
    json(b: unknown) {
      body = b;
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    headers,
  } as any;
}

resetRateLimitStore();
const limiter = createRateLimiter({ name: "test", max: 2, windowMs: 60_000 });

let nextCount = 0;
const next = () => {
  nextCount += 1;
};

limiter(mockReq(), mockRes(), next);
limiter(mockReq(), mockRes(), next);
assert.equal(nextCount, 2);

const res3 = mockRes();
limiter(mockReq(), res3, next);
assert.equal(res3.statusCode, 429);
assert.equal(nextCount, 2);

assert.equal(isAiRateLimitedPath("/api/grok/go-code"), true);
assert.equal(isAiRateLimitedPath("/api/grok/go-code/poll"), false);
assert.equal(isAiRateLimitedPath("/api/grok/chat"), true);

console.log("✓ rate limit blocks after max");
