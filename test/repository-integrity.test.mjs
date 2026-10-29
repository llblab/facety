// Guards the knowledge surface: every relative Markdown link and heading anchor must resolve in the tracked tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root })
  .toString().split('\0').filter(Boolean).filter(file => { try { readFileSync(join(root, file)); return true; } catch { return false; } });
const files = new Set(tracked);
const directories = new Set();
for (const file of tracked) for (let d = dirname(file); d !== '.' && !directories.has(d); d = dirname(d)) directories.add(d);
const markdown = tracked.filter(file => file.endsWith('.md'));
const text = new Map(markdown.map(file => [file, readFileSync(join(root, file), 'utf8')]));
const links = file => [...text.get(file).matchAll(/\]\(([^)\s]+)\)/g)].map(match => match[1]).filter(target => !/^(https?:|mailto:)/.test(target));

// GitHub-compatible heading slugs, including -1/-2 suffixes for repeated headings.
function anchors(file) {
  const result = new Set();
  const counts = new Map();
  let fenced = false;
  for (const line of text.get(file).split('\n')) {
    if (/^```/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const slug = heading[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').trim().toLowerCase()
      .replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const seen = counts.get(slug) ?? 0;
    counts.set(slug, seen + 1);
    result.add(seen ? slug + '-' + seen : slug);
  }
  for (const match of text.get(file).matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) result.add(match[1]);
  return result;
}
const anchorCache = new Map();
const anchorsOf = file => { if (!anchorCache.has(file)) anchorCache.set(file, anchors(file)); return anchorCache.get(file); };

test('every relative Markdown link resolves to a tracked file or directory', () => {
  const broken = [];
  for (const file of markdown) for (const target of links(file)) {
    const path = target.split('#')[0];
    if (!path) continue;
    const resolved = normalize(join(dirname(file), decodeURI(path))).replace(/\/$/, '');
    if (!files.has(resolved) && !directories.has(resolved)) broken.push(file + ' -> ' + target);
  }
  assert.deepEqual(broken, []);
});

test('README code examples import only existing named exports', async () => {
  const missing = [];
  for (const block of text.get('README.md').matchAll(/```js\n([\s\S]*?)```/g)) {
    for (const [, names, path] of block[1].matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.\/[^']+)'/g)) {
      const module = await import(new URL(path, new URL('../', import.meta.url)));
      for (const name of names.split(',').map(value => value.trim()).filter(Boolean)) if (!(name in module)) missing.push(path + '#' + name);
    }
  }
  assert.deepEqual(missing, []);
});

test('every Markdown heading anchor link resolves in its target document', () => {
  const broken = [];
  for (const file of markdown) for (const target of links(file)) {
    if (!target.includes('#')) continue;
    const [path, anchor] = target.split('#');
    const resolved = path ? normalize(join(dirname(file), decodeURI(path))) : file;
    if (!resolved.endsWith('.md') || !text.has(resolved)) continue;
    if (!anchorsOf(resolved).has(decodeURIComponent(anchor))) broken.push(file + ' -> ' + target);
  }
  assert.deepEqual(broken, []);
});
