/**
 * Hermes has no `crypto.subtle`, so Supabase's PKCE flow would fall back to a
 * plain code challenge. This installs the SHA-256 digest it actually calls.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256(message: Uint8Array): Uint8Array {
  const padded = new Uint8Array((((message.length + 9 + 63) >> 6) << 6));
  padded.set(message);
  padded[message.length] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, message.length * 8);

  const words = new Uint32Array(64);
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const view = new DataView(padded.buffer);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotr(words[index - 15], 7) ^
        rotr(words[index - 15], 18) ^
        (words[index - 15] >>> 3);
      const s1 =
        rotr(words[index - 2], 17) ^
        rotr(words[index - 2], 19) ^
        (words[index - 2] >>> 10);
      words[index] =
        (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + K[index] + words[index]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + ((s0 + majority) >>> 0)) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let index = 0; index < state.length; index += 1) {
    digestView.setUint32(index * 4, state[index]);
  }
  return digest;
}

function asBytes(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export function getRandomValues<T extends ArrayBufferView>(typedArray: T): T {
  const bytes = new Uint8Array(
    typedArray.buffer,
    typedArray.byteOffset,
    typedArray.byteLength,
  );
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return typedArray;
}

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Supabase base64-encodes the SHA-256 challenge with `btoa`, which Hermes lacks. */
export function btoaPolyfill(input: string): string {
  let output = '';
  for (let index = 0; index < input.length; index += 3) {
    const first = input.charCodeAt(index);
    const second = index + 1 < input.length ? input.charCodeAt(index + 1) : 0;
    const third = index + 2 < input.length ? input.charCodeAt(index + 2) : 0;
    const triplet = (first << 16) | (second << 8) | third;
    output += BASE64[(triplet >> 18) & 63];
    output += BASE64[(triplet >> 12) & 63];
    output += index + 1 < input.length ? BASE64[(triplet >> 6) & 63] : '=';
    output += index + 2 < input.length ? BASE64[triplet & 63] : '=';
  }
  return output;
}

function installWebCrypto() {
  const scope = globalThis as typeof globalThis & {
    crypto?: Crypto;
    btoa?: (value: string) => string;
  };
  const cryptoObject = scope.crypto ?? ({} as Crypto);

  if (typeof cryptoObject.getRandomValues !== 'function') {
    Object.defineProperty(cryptoObject, 'getRandomValues', {
      configurable: true,
      value: getRandomValues,
    });
  }
  if (typeof cryptoObject.subtle?.digest !== 'function') {
    Object.defineProperty(cryptoObject, 'subtle', {
      configurable: true,
      value: {
        digest(algorithm: AlgorithmIdentifier, data: BufferSource) {
          const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
          if (name.toUpperCase() !== 'SHA-256') {
            return Promise.reject(new Error(`Unsupported digest: ${name}`));
          }
          return Promise.resolve(sha256(asBytes(data)).buffer);
        },
      },
    });
  }
  if (!scope.crypto) {
    Object.defineProperty(scope, 'crypto', {
      configurable: true,
      value: cryptoObject,
    });
  }
  if (typeof scope.btoa !== 'function') {
    scope.btoa = btoaPolyfill;
  }
}

installWebCrypto();
