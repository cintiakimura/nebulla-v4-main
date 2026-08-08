import assert from 'node:assert/strict';
import {
  classifyContinueFailure,
  continueFailureActivityLine,
  isKeyAuthFailureMessage,
  userFacingContinueFailureMessage,
} from '../src/lib/continueFailureTaxonomy';
import { MAIN_AI_CHAT_SETUP_HINT } from '../src/lib/grokKey';

assert.equal(
  isKeyAuthFailureMessage('HTTP 401: Incorrect API key provided'),
  true,
  '401 is key/auth',
);
assert.equal(
  isKeyAuthFailureMessage('HTTP 403: Forbidden. Ask your team admin for permission.'),
  true,
  '403 ACL is key/auth',
);
assert.equal(
  isKeyAuthFailureMessage('Grok chat is unavailable: no valid API key on the server.'),
  true,
  'missing key copy is key/auth',
);
assert.equal(
  isKeyAuthFailureMessage('Master Plan section 2 is empty'),
  false,
  'plan gap is not key/auth',
);

assert.equal(
  classifyContinueFailure({ message: 'HTTP 403: rejected this API key' }),
  'key/auth fail',
);
assert.equal(
  classifyContinueFailure({ repliedWithoutMasterPlanTags: true }),
  'parse miss',
);
assert.equal(
  classifyContinueFailure({ tagsPresentButNotSaved: true }),
  'save miss',
);
assert.equal(
  classifyContinueFailure({ bootstrapSkipped: true }),
  'bootstrap not re-fired',
);

const facing = userFacingContinueFailureMessage(
  'key/auth fail',
  'Grok chat is unavailable: no valid API key on the server.',
);
assert.equal(facing, MAIN_AI_CHAT_SETUP_HINT);

assert.match(
  continueFailureActivityLine('key/auth fail'),
  /key\/auth fail/i,
);

console.log('test-continue-failure-taxonomy: ok');
