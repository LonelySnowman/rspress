#!/usr/bin/env node --experimental-fetch
import nodeModule from 'node:module';

// enable on-disk code caching of all modules loaded by Node.js
// requires Nodejs >= 22.8.0
const { enableCompileCache } = nodeModule;
if (enableCompileCache) {
  try {
    enableCompileCache();
  } catch {
    // ignore errors
  }
}

import('../dist/index.js');
