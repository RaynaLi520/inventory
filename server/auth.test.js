import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUsername } from "./auth.js";

test("normalizes login identifiers without changing their meaning", () => {
  assert.equal(normalizeUsername(" Rayna.Li "), "rayna.li");
  assert.equal(normalizeUsername("ｒａｙｎａ．ｌｉ"), "rayna.li");
  assert.equal(normalizeUsername("rayna\u200B.li\uFEFF"), "rayna.li");
});
