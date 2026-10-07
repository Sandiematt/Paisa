import {btoaPolyfill, getRandomValues, sha256} from '../src/lib/webCrypto';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// NIST SHA-256 vectors.
test('hashes the empty string', () => {
  expect(hex(sha256(new Uint8Array()))).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

test('hashes abc', () => {
  expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('base64-encodes the way btoa does', () => {
  expect(btoaPolyfill('hello')).toBe('aGVsbG8=');
  expect(btoaPolyfill('a')).toBe('YQ==');
});

test('fills a typed array from getRandomValues', () => {
  const bytes = new Uint8Array(8);
  const returned = getRandomValues(bytes);
  expect(returned).toBe(bytes);
  expect(bytes.some(byte => byte !== 0)).toBe(true);
});

test('hashes a message that crosses a block boundary', () => {
  const message = 'a'.repeat(64);
  expect(hex(sha256(new TextEncoder().encode(message)))).toBe(
    'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
  );
});
