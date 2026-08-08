import assert from 'node:assert/strict';
import {
  isNebulaOrchestrationPath,
  isUserAppProductPath,
} from '../lib/nebulaOrchestrationPaths';

assert.equal(isNebulaOrchestrationPath('.nebula-created-at'), true);
assert.equal(isNebulaOrchestrationPath('CHANGELOG-methodology.md'), true);
assert.equal(isNebulaOrchestrationPath('nebula-project/inference-first-rules.md'), true);
assert.equal(isNebulaOrchestrationPath('nebulla-project/full-bug-database.md'), true);
assert.equal(isUserAppProductPath('src/App.tsx'), true);
assert.equal(isUserAppProductPath('app/page.tsx'), true);
assert.equal(isUserAppProductPath('.nebula-created-at'), false);
assert.equal(isUserAppProductPath('CHANGELOG-methodology.md'), false);

console.log('test-orchestration-paths: ok');
