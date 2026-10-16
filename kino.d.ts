declare namespace kino {
  const apiVersion: number;
  const appVersion: string;
  const lang: string;
  const fetchAnyHost: boolean | undefined;
  const device: "tv" | "phone" | undefined;
  function seed(session: object): void;

  function fetch(url: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | { json?: any; form?: Record<string, any>; base64?: string };
    redirect?: "follow" | "manual";
    cookies?: boolean;
    timeoutMs?: number;
  }): Promise<{
    ok: boolean;
    status: number;
    url: string;
    headers: Record<string, string>;
    text(): string;
    json(): any;
    base64(): string;
  }>;

  namespace cookies {
    function get(url: string, name: string): string | null;
    function clear(): void;
  }

  function secret(name: string): string;

  namespace crypto {
    function hash(algo: string, data: string, encoding?: string): string;
    function hmac(algo: string, key: string, data: string, options?: { encoding?: string; outputEncoding?: string }): string;
    function encrypt(algo: string, options: { key: string; keyEncoding?: string; iv?: string; ivEncoding?: string; data: string; inputEncoding?: string; outputEncoding?: string; aad?: string; aadEncoding?: string; padding?: string }): string;
    function decrypt(algo: string, options: { key: string; keyEncoding?: string; iv?: string; ivEncoding?: string; data: string; inputEncoding?: string; outputEncoding?: string; aad?: string; aadEncoding?: string; padding?: string }): string;
    pbcrypto_pbkdf2 = pbkdf2;
    function pbkdf2(algo: string, password: string, salt: string, iterations: number, keylen: number, encoding?: string): string;
    function randomBytes(size: number, encoding?: string): string;
    function uuid(): string;
    function generateKeyPair(options: { type: "ec" | "ed25519" | "x25519"; namedCurve?: "P-256" | "P-384" }): { privateKey: any; publicKey: any };
    function sign(options: { key: any; data: string; encoding?: string; hash?: string; format?: string; outputEncoding?: string }): string;
    function verify(options: { key: any; data: string; encoding?: string; signature: string; signatureEncoding?: string; hash?: string; format?: string }): boolean;
    function importKey(options: { format: "jwk" | "spki" | "raw"; key: any; type?: string; namedCurve?: string }): any;
    function deriveSharedSecret(options: { privateKey: any; publicKey: any }): string;
  }

  namespace browser {
    const captureAll: boolean | undefined;
    function capture(url: string, options?: { timeoutMs?: number; headers?: Record<string, string>; match?: string; autoplay?: boolean }): Promise<any>;
    function page(url: string, options?: { waitFor?: string; timeoutMs?: number }): Promise<any>;
  }

  function meta(query: { type: "movie" | "series"; ids?: { imdb?: string; tmdb?: number; tvdb?: number; kitsu?: number; mal?: number; anilist?: number }; title?: string; year?: number | string; lang?: string }): Promise<any>;
  function tmdb(path: string, params?: Record<string, any>): Promise<any>;

  function sleep(ms: number): Promise<void>;
  function error(code: "auth_required" | "not_found" | "geo_blocked" | "rate_limited" | "unavailable", message?: string, options?: { userMessage?: string }): Error;

  namespace config {
    function get(key: string): any;
    function all(): Record<string, any>;
  }

  namespace html {
    function select(html: string, selector: string): { text: string; html: string; attrs: Record<string, string> }[];
  }

  namespace storage {
    function get(key: string): string | null;
    function set(key: string, value: string, options?: { ttlMs?: number }): void;
    function remove(key: string): void;
    function keys(): string[];
  }

  function log(...args: any[]): void;
  namespace log {
    function report(area: string, code: string, message?: string): void;
  }

  namespace rank {
    function shortQuery(query: string): string;
    function sortBySimilarity(items: any[], query: string | string[], getTitle?: (item: any) => string | string[]): any[];
    function filterRelevant(items: any[], query: string | string[], getTitle?: (item: any) => string | string[]): any[];
  }
}
