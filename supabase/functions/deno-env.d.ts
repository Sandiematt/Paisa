/**
 * Ambient types so the workspace TypeScript language service can check
 * Supabase Edge Functions (Deno) without the Deno VS Code extension.
 * Runtime resolution still goes through Deno's `jsr:` / `npm:` specifiers.
 */

declare namespace Deno {
  function test(name: string, fn: () => void | Promise<void>): void;
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
  const env: {
    get(key: string): string | undefined;
  };
}

declare module 'jsr:@std/assert@1' {
  export function assertEquals(actual: unknown, expected: unknown, msg?: string): void;
  export function assertNotEquals(actual: unknown, expected: unknown, msg?: string): void;
}

declare module 'jsr:@supabase/functions-js/edge-runtime.d.ts' {}

declare module 'npm:@supabase/supabase-js@2.45.4' {
  export * from '@supabase/supabase-js';
}

declare module 'npm:zod@3.23.8' {
  export const z: any;
  export namespace z {
    type infer<T> = any;
  }
}
