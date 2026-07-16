const FIXED_PORT = 12321

function isValidListenPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535
}

function resolveListenPort(port: unknown): number {
  return isValidListenPort(port) ? port : FIXED_PORT
}

export { FIXED_PORT, isValidListenPort, resolveListenPort }
