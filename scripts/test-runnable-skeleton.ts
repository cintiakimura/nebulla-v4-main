/**
 * Runnable product app skeleton contract (no npm install required).
 * Run: npm run test:runnable-skeleton
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureRunnableSkeleton,
  inspectRunnableSkeleton,
  isProductUiPath,
  RUNNABLE_SKELETON_GO_BULLETS,
  runnableStatusLine,
  writtenPathsNeedRunnableSkeleton,
} from '../lib/runnableAppSkeleton.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nebulla-runnable-'));
}

{
  assert.equal(isProductUiPath('app/kid/page.tsx'), true);
  assert.equal(isProductUiPath('nebulla-project/foo.md'), false);
  assert.equal(writtenPathsNeedRunnableSkeleton(['app/page.tsx']), true);
  assert.equal(writtenPathsNeedRunnableSkeleton(['master-plan.json']), false);
}

{
  const dir = tmpRoot();
  fs.mkdirSync(path.join(dir, 'app', 'kid'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'app', 'kid', 'page.tsx'),
    'export default function Kid(){ return <div>Kid</div> }\n',
    'utf8',
  );
  const before = inspectRunnableSkeleton(dir);
  assert.equal(before.runnable, false);
  assert.ok(before.missing.includes('package.json'));

  const after = ensureRunnableSkeleton(dir, { projectName: 'Tutor ADHD' });
  assert.equal(after.runnable, true, runnableStatusLine(after));
  assert.ok(fs.existsSync(path.join(dir, 'package.json')));
  assert.ok(fs.existsSync(path.join(dir, 'app', 'layout.tsx')));
  const layout = fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8');
  assert.match(layout, /Tutor ADHD/);
  assert.match(layout, /TA|data-nebula-brand/);
  assert.ok(fs.existsSync(path.join(dir, 'app', 'page.tsx')));
  assert.ok(fs.existsSync(path.join(dir, 'README.md')));
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
    private?: boolean;
  };
  assert.equal(pkg.private, true);
  assert.ok(pkg.scripts?.dev);
  assert.ok(pkg.scripts?.build);
  assert.ok(pkg.scripts?.start);
  assert.match(runnableStatusLine(after), /Runnable root: yes/);

  // Idempotent — second ensure does not wipe kid page
  ensureRunnableSkeleton(dir, { projectName: 'Tutor ADHD' });
  assert.match(
    fs.readFileSync(path.join(dir, 'app', 'kid', 'page.tsx'), 'utf8'),
    /Kid/,
  );
}

{
  assert.match(RUNNABLE_SKELETON_GO_BULLETS, /package\.json/);
  assert.match(RUNNABLE_SKELETON_GO_BULLETS, /workspace root/);
  const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  assert.match(server, /RUNNABLE_SKELETON_GO_BULLETS/);
  assert.match(server, /\/api\/workspace\/deploy/);
  assert.match(server, /ensureRunnableSkeleton/);
  assert.match(server, /deployable/);
}

console.log('\n✓ runnable skeleton contract passed\n');
