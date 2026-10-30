declare module 'pako' {
  export function inflate(data: Uint8Array | ArrayBuffer, options?: any): Uint8Array;
  export function gzip(data: Uint8Array | string, options?: any): Uint8Array;
  export function ungzip(data: Uint8Array | ArrayBuffer, options?: any): Uint8Array;
}
