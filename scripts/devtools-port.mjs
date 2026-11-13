import fs from 'node:fs';

// Chromium creates DevToolsActivePort before it has finished writing it, and on
// Windows the file can briefly be locked (EBUSY/EPERM). Read until it holds a
// port instead of trusting the first moment the file exists.
export async function readDevToolsPort(portFile, { timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (/^\d+$/.test(port)) return port;
    } catch (error) {
      if (!['ENOENT', 'EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    }
    if (Date.now() > deadline) throw new Error('Browser debugging endpoint did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
