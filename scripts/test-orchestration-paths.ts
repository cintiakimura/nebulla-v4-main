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
assert.equal(isUserAppProductPath('public/index.html'), true);
assert.equal(isUserAppProductPath('.nebula-created-at'), false);
assert.equal(isUserAppProductPath('CHANGELOG-methodology.md'), false);
assert.equal(isUserAppProductPath('.env'), false);
assert.equal(isUserAppProductPath('.env.d1'), false);
assert.equal(isUserAppProductPath('nebula-d1.json'), false);
assert.equal(isUserAppProductPath('nebula-project-secrets.d1.json'), false);
assert.equal(isUserAppProductPath('public/nebula-basic-preview.html'), false);
assert.equal(isUserAppProductPath('public/nebula-ui-gen-preview.html'), false);

console.log('test-orchestration-paths: ok');
