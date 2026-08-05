import assert from "node:assert/strict";
import {
  isLegacyV0ApiFrozen,
  isPencilApiFrozen,
} from "../lib/betaLeanFlags";

const prevLegacy = process.env.ENABLE_LEGACY_V0;
const prevPencil = process.env.ENABLE_PENCIL;

try {
  delete process.env.ENABLE_LEGACY_V0;
  delete process.env.ENABLE_PENCIL;
  assert.equal(isLegacyV0ApiFrozen(), true, "V0 frozen by default");
  assert.equal(isPencilApiFrozen(), true, "Pencil frozen by default");

  process.env.ENABLE_LEGACY_V0 = "true";
  process.env.ENABLE_PENCIL = "1";
  assert.equal(isLegacyV0ApiFrozen(), false, "ENABLE_LEGACY_V0 revives V0");
  assert.equal(isPencilApiFrozen(), false, "ENABLE_PENCIL revives Pencil");

  process.env.ENABLE_LEGACY_V0 = "false";
  process.env.ENABLE_PENCIL = "no";
  assert.equal(isLegacyV0ApiFrozen(), true);
  assert.equal(isPencilApiFrozen(), true);

  console.log("test-beta-lean-flags: ok");
} finally {
  if (prevLegacy === undefined) delete process.env.ENABLE_LEGACY_V0;
  else process.env.ENABLE_LEGACY_V0 = prevLegacy;
  if (prevPencil === undefined) delete process.env.ENABLE_PENCIL;
  else process.env.ENABLE_PENCIL = prevPencil;
}
