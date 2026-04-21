import { TextDecoder, TextEncoder } from 'node:util';

if (!globalThis.TextEncoder) {
  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    writable: true,
    value: TextEncoder,
  });
}

if (!globalThis.TextDecoder) {
  Object.defineProperty(globalThis, 'TextDecoder', {
    configurable: true,
    writable: true,
    value: TextDecoder,
  });
}
