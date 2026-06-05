/**
 * nymph run driver
 *
 * Usage:
 *   bun .claude/skills/run-nymph/driver.mjs <file.md> [--screenshot path.png] [--comment "text"]
 *
 * 検証済み: bun で動作（node では playwright が解決できない）
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const mdFile = args.find(a => a.endsWith('.md')) ?? 'tests/fixtures/sample.md';
const ssIdx = args.indexOf('--screenshot');
const ssPath = ssIdx !== -1 ? args[ssIdx + 1] : '/tmp/nymph-run.png';
const commentIdx = args.indexOf('--comment');
const commentText = commentIdx !== -1 ? args[commentIdx + 1] : null;

const mdAbs = resolve(mdFile);
const lockPath = `${mdAbs}.nymph-lock`;

// lock ファイルが残っていたら削除
if (existsSync(lockPath)) unlinkSync(lockPath);

const server = spawn('bun', ['run', 'src/cli.ts', '--no-open', mdAbs], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

// stdout からポートを取得（"nymph   http://localhost:6276" 形式）
const port = await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server start timeout')), 5000);
  server.stdout.on('data', d => {
    const m = d.toString().match(/localhost:(\d+)/);
    if (m) { clearTimeout(t); res(parseInt(m[1], 10)); }
  });
  server.stderr.on('data', d => process.stderr.write(d));
});

console.log(`nymph on http://localhost:${port}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`http://localhost:${port}`);
await page.waitForSelector('#content', { timeout: 5000 });
await page.waitForTimeout(400);

if (commentText) {
  const block = page.locator('#content .md-block').first();
  await block.hover();
  await block.locator('.comment-btn').click();
  await page.locator('#comment-ta').fill(commentText);
  await page.locator('#btn-submit').click();
  await page.waitForSelector('.comment-item', { timeout: 3000 });
  console.log('comment added');
}

await page.screenshot({ path: ssPath });
console.log(`screenshot → ${ssPath}`);

const filesRes = await page.evaluate(async () => {
  const r = await fetch('/files');
  return r.json();
});
console.log('active:', filesRes.activeFile ?? '(none)');

await browser.close();
server.kill();
try { if (existsSync(lockPath)) unlinkSync(lockPath); } catch {}
