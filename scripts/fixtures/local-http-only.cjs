// Preloaded only by the remote migration CLI regression test, including every
// nested Wrangler process. No socket may leave the test server's exact address.
const net = require('node:net')
const allowed = new URL(process.env.KB_TEST_HTTP_ORIGIN)
if (allowed.protocol !== 'http:' || allowed.hostname !== '127.0.0.1' || !allowed.port) {
  throw new Error('The CLI fixture requires an explicit loopback HTTP origin')
}

const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  let options = args[0]
  if (Array.isArray(options)) options = options[0]
  if (typeof options !== 'object' || options === null) {
    options = { port: args[0], host: typeof args[1] === 'string' ? args[1] : 'localhost' }
  }
  const host = options.host || options.hostname || 'localhost'
  if (options.path || host !== allowed.hostname || String(options.port) !== allowed.port) {
    throw new Error('CLI test blocked a socket outside its local HTTP fixture')
  }
  return connect.apply(this, args)
}
