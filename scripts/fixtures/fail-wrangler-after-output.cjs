// Fault injection for the CLI test only. Let the real remote import commit and
// print successful JSON, then fail the actual Wrangler process before it exits.
// This verifies that callers respect the exit status even after seeing success.
const fs = require('node:fs')
const entry = (process.argv[1] || '').replaceAll('\\', '/')
if (entry.endsWith('/wrangler-dist/cli.js') && process.argv.includes('--file')) {
  const write = process.stdout.write
  let output = ''
  process.stdout.write = function (chunk, encoding, callback) {
    output += String(chunk)
    const marker = process.env.KB_TEST_FAILURE_MARKER
    const bookmark = process.env.KB_TEST_FAIL_AFTER_BOOKMARK
    if (output.includes(`"finalBookmark": "${bookmark}"`) && !fs.existsSync(marker)) {
      fs.writeFileSync(marker, output)
      process.stderr.write('CLI fixture forced non-zero after successful import output\n')
      const done = typeof encoding === 'function' ? encoding : callback
      const charset = typeof encoding === 'string' ? encoding : undefined
      return write.call(this, chunk, charset, (...args) => {
        done?.(...args)
        process.exit(23)
      })
    }
    return write.apply(this, arguments)
  }
}
