import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checker = join(projectRoot, 'scripts/check-site.mjs')

function check(files) {
  const directory = mkdtempSync(join(tmpdir(), 'kb-site-check-'))
  const written = []
  const folders = ['tags', 'images'].map((name) => join(directory, name))
  try {
    for (const folder of folders) mkdirSync(folder)
    for (const [name, content] of Object.entries(files)) {
      const path = join(directory, name)
      writeFileSync(path, content)
      written.push(path)
    }
    const result = spawnSync(process.execPath, [checker, directory], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 15_000
    })
    assert.ifError(result.error)
    return result
  } finally {
    // Remove only the exact files and directories this fixture created.
    for (const file of written.reverse()) unlinkSync(file)
    for (const folder of folders.reverse()) rmdirSync(folder)
    rmdirSync(directory)
  }
}

test('resolves generated clean URLs, encoded anchors, same-origin links and HTML resources', () => {
  const result = check({
    'index.html': `
      <link rel="canonical" href="https://docs.example.test/">
      <h1 id="home">Home</h1>
      <a href="/tags/%E4%B8%AD%E6%96%87?x=1#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98">Encoded</a>
      <a href="https://docs.example.test/tags/中文#中文标题">Absolute</a>
      <a href="/tags/">Directory index</a>
      <img src="/images/logo.svg">
      <img srcset="/images/logo.svg 1x, data:image/svg+xml,ignore 2x">
      <a href="https://external.example.test/missing">External</a>
      <a href="mailto:contact@example.test">Mail</a>
      <a href="#top">Top</a>
      <a href="#:~:text=Home">Text fragment</a>
      <form action="/api/feedback"></form>
    `,
    'tags/中文.html': `
      <link rel="canonical" href="https://docs.example.test/tags/%E4%B8%AD%E6%96%87">
      <h1 id="中文标题">标题</h1>
      <a href="../#home">Home</a>
      <a name="legacy"></a><a href="#legacy">Named anchor</a>
      <h2 id="A&amp;B">Entity</h2><a href="#A%26B">Entity anchor</a>
    `,
    'tags/index.html': '<h1>Tags</h1>',
    'images/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /3 个 HTML/)
})

test('fails for missing pages, HTML resources and case mismatches on every OS', () => {
  const result = check({
    'index.html': `
      <a href="/missing-page">Page</a>
      <img src="/images/missing.png">
      <link rel="modulepreload" href="/missing-chunk.js">
      <img srcset="/images/logo.svg 1x, /images/missing-2x.svg 2x">
      <a href="/Tags/中文">Wrong case</a>
    `,
    'tags/中文.html': '<h1>Tag</h1>',
    'images/logo.svg': '<svg></svg>'
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /5 处问题/)
  for (const url of ['missing-page', 'missing.png', 'missing-chunk.js', 'missing-2x.svg', '/Tags/中文']) {
    assert.ok(result.stderr.includes(url), result.stderr)
  }
})

test('validates local and cross-page anchors against the generated HTML', () => {
  const result = check({
    'index.html': '<h1 id="existing">Home</h1><a href="#absent">Local</a><a href="/tags/topic#absent">Other</a>',
    'tags/topic.html': '<h1 id="existing">Topic</h1>'
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /2 处问题/)
  assert.match(result.stderr, /目标 index\.html 中没有锚点 #absent/)
  assert.match(result.stderr, /目标 tags\/topic\.html 中没有锚点 #absent/)
})

test('reports invalid path and anchor encodings', () => {
  const result = check({
    'index.html': '<a href="/%ZZ">Path</a><a href="#%ZZ">Anchor</a>'
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /URL 编码无效/)
  assert.match(result.stderr, /锚点编码无效/)
})

test('an empty output directory cannot pass', () => {
  const result = check({})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /没有 HTML/)
})
