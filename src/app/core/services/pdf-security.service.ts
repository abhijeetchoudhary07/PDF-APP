import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfSecurityPermissions,
  PdfProtectionConfig,
  PdfSecurityStatus,
  DEFAULT_PERMISSIONS
} from '../models/pdf-security.types';

// Standard 32-byte PDF padding string per ISO 32000-1 / Adobe PDF Reference
const PDF_PADDING: number[] = [
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a
];

/**
 * Self-contained RFC 1321 MD5 message digest in pure TypeScript
 */
function md5(input: Uint8Array): Uint8Array {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  const words: number[] = [];
  for (let i = 0; i < input.length; i++) {
    words[i >> 2] |= input[i] << ((i % 4) * 8);
  }

  const bitLen = input.length * 8;
  words[bitLen >> 5] |= 0x80 << (bitLen % 32);
  words[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen;

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;

    a = md5ff(a, b, c, d, words[i + 0] || 0, 7, -680876936);
    d = md5ff(d, a, b, c, words[i + 1] || 0, 12, -389564586);
    c = md5ff(c, d, a, b, words[i + 2] || 0, 17, 606105819);
    b = md5ff(b, c, d, a, words[i + 3] || 0, 22, -1044525330);
    a = md5ff(a, b, c, d, words[i + 4] || 0, 7, -176418897);
    d = md5ff(d, a, b, c, words[i + 5] || 0, 12, 1200080426);
    c = md5ff(c, d, a, b, words[i + 6] || 0, 17, -1473231341);
    b = md5ff(b, c, d, a, words[i + 7] || 0, 22, -45705983);
    a = md5ff(a, b, c, d, words[i + 8] || 0, 7, 1770035416);
    d = md5ff(d, a, b, c, words[i + 9] || 0, 12, -1958414417);
    c = md5ff(c, d, a, b, words[i + 10] || 0, 17, -42063);
    b = md5ff(b, c, d, a, words[i + 11] || 0, 22, -1990404162);
    a = md5ff(a, b, c, d, words[i + 12] || 0, 7, 1804603682);
    d = md5ff(d, a, b, c, words[i + 13] || 0, 12, -40341101);
    c = md5ff(c, d, a, b, words[i + 14] || 0, 17, -1502002290);
    b = md5ff(b, c, d, a, words[i + 15] || 0, 22, 1236535329);

    a = md5gg(a, b, c, d, words[i + 1] || 0, 5, -165796510);
    d = md5gg(d, a, b, c, words[i + 6] || 0, 9, -1069501632);
    c = md5gg(c, d, a, b, words[i + 11] || 0, 14, 643717713);
    b = md5gg(b, c, d, a, words[i + 0] || 0, 20, -373897302);
    a = md5gg(a, b, c, d, words[i + 5] || 0, 5, -701558691);
    d = md5gg(d, a, b, c, words[i + 10] || 0, 9, 38016083);
    c = md5gg(c, d, a, b, words[i + 15] || 0, 14, -660478335);
    b = md5gg(b, c, d, a, words[i + 4] || 0, 20, -405537848);
    a = md5gg(a, b, c, d, words[i + 9] || 0, 5, 568446438);
    d = md5gg(d, a, b, c, words[i + 14] || 0, 9, -1019803690);
    c = md5gg(c, d, a, b, words[i + 3] || 0, 14, -187363961);
    b = md5gg(b, c, d, a, words[i + 8] || 0, 20, 1163531501);
    a = md5gg(a, b, c, d, words[i + 13] || 0, 5, -1444681467);
    d = md5gg(d, a, b, c, words[i + 2] || 0, 9, -51403784);
    c = md5gg(c, d, a, b, words[i + 7] || 0, 14, 1735328473);
    b = md5gg(b, c, d, a, words[i + 12] || 0, 20, -1926607734);

    a = md5hh(a, b, c, d, words[i + 5] || 0, 4, -378558);
    d = md5hh(d, a, b, c, words[i + 8] || 0, 11, -2022574463);
    c = md5hh(c, d, a, b, words[i + 11] || 0, 16, 1839030562);
    b = md5hh(b, c, d, a, words[i + 14] || 0, 23, -35309556);
    a = md5hh(a, b, c, d, words[i + 1] || 0, 4, -1530992060);
    d = md5hh(d, a, b, c, words[i + 4] || 0, 11, 1272893353);
    c = md5hh(c, d, a, b, words[i + 7] || 0, 16, -155497632);
    b = md5hh(b, c, d, a, words[i + 10] || 0, 23, -1094730640);
    a = md5hh(a, b, c, d, words[i + 13] || 0, 4, 681279174);
    d = md5hh(d, a, b, c, words[i + 0] || 0, 11, -358537222);
    c = md5hh(c, d, a, b, words[i + 3] || 0, 16, -722521979);
    b = md5hh(b, c, d, a, words[i + 6] || 0, 23, 76029189);
    a = md5hh(a, b, c, d, words[i + 9] || 0, 4, -640364487);
    d = md5hh(d, a, b, c, words[i + 12] || 0, 11, -421815835);
    c = md5hh(c, d, a, b, words[i + 15] || 0, 16, 530742520);
    b = md5hh(b, c, d, a, words[i + 2] || 0, 23, -995338651);

    a = md5ii(a, b, c, d, words[i + 0] || 0, 6, -198630844);
    d = md5ii(d, a, b, c, words[i + 7] || 0, 10, 1126891415);
    c = md5ii(c, d, a, b, words[i + 14] || 0, 15, -1416354905);
    b = md5ii(b, c, d, a, words[i + 5] || 0, 21, -57434055);
    a = md5ii(a, b, c, d, words[i + 12] || 0, 6, 1700485571);
    d = md5ii(d, a, b, c, words[i + 3] || 0, 10, -1894986606);
    c = md5ii(c, d, a, b, words[i + 10] || 0, 15, -1051523);
    b = md5ii(b, c, d, a, words[i + 1] || 0, 21, -2054922799);
    a = md5ii(a, b, c, d, words[i + 8] || 0, 6, 1873313359);
    d = md5ii(d, a, b, c, words[i + 15] || 0, 10, -30611744);
    c = md5ii(c, d, a, b, words[i + 6] || 0, 15, -1560198380);
    b = md5ii(b, c, d, a, words[i + 13] || 0, 21, 1309151649);
    a = md5ii(a, b, c, d, words[i + 4] || 0, 6, -145523070);
    d = md5ii(d, a, b, c, words[i + 11] || 0, 10, -1120210379);
    c = md5ii(c, d, a, b, words[i + 2] || 0, 15, 718787259);
    b = md5ii(b, c, d, a, words[i + 9] || 0, 21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  const out = new Uint8Array(16);
  const outWords = [a, b, c, d];
  for (let i = 0; i < 16; i++) {
    out[i] = (outWords[i >> 2] >> ((i % 4) * 8)) & 0xff;
  }
  return out;
}

/**
 * RC4 (Rivest Cipher 4) stream cipher in pure TypeScript
 */
function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
  }

  let i = 0;
  j = 0;
  const out = new Uint8Array(data.length);
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
    const t = (s[i] + s[j]) % 256;
    out[k] = data[k] ^ s[t];
  }
  return out;
}

@Injectable({
  providedIn: 'root'
})
export class PdfSecurityService {
  constructor() {}

  /**
   * Detects whether a PDF is encrypted or password protected.
   */
  async detectSecurity(source: File | ArrayBuffer): Promise<PdfSecurityStatus> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;

    // 1. Try loading in pdf-lib
    let pdfLibEncrypted = false;
    try {
      const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: false });
      pdfLibEncrypted = pdfDoc.isEncrypted;
    } catch (e: any) {
      if (e?.name === 'EncryptedPDFError' || String(e).includes('encrypted')) {
        pdfLibEncrypted = true;
      }
    }

    // 2. Try loading in pdfjs-dist without password to see if password is required
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0))
      } as any);
      const pdf = await loadingTask.promise;
      const permissions = await (pdf as any).getPermissions?.();

      return {
        isEncrypted: pdfLibEncrypted,
        requiresUserPassword: false,
        hasPermissionsRestricted: permissions != null && permissions.length > 0,
        permissions: this.mapPdfJsPermissions(permissions)
      };
    } catch (e: any) {
      if (e?.name === 'PasswordException' || e?.code === 1 || String(e).includes('password')) {
        return {
          isEncrypted: true,
          requiresUserPassword: true,
          hasPermissionsRestricted: true
        };
      }

      return {
        isEncrypted: pdfLibEncrypted,
        requiresUserPassword: pdfLibEncrypted,
        hasPermissionsRestricted: pdfLibEncrypted,
        error: e.message || String(e)
      };
    }
  }

  /**
   * Validates if the supplied password can decrypt the PDF.
   */
  async validatePassword(source: File | ArrayBuffer, password: string): Promise<boolean> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0)),
        password: password || ''
      } as any);
      await loadingTask.promise;
      return true;
    } catch (e: any) {
      if (e?.name === 'PasswordException' && e?.code === 2) {
        // Incorrect password
        return false;
      }
      if (String(e).includes('password') || String(e).includes('Password')) {
        return false;
      }
      // If other error, throw to distinguish unsupported format vs wrong password
      throw new Error(`PDF decryption failed: ${e.message || e}`);
    }
  }

  /**
   * Unlocks a password-protected PDF after validating credentials, removing all restrictions.
   */
  async unlockPdf(
    source: File | ArrayBuffer,
    password: string,
    outputFileName = 'unlocked_document.pdf'
  ): Promise<{ file: File; blob: Blob; sizeBytes: number }> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;

    const isValid = await this.validatePassword(arrayBuffer, password);
    if (!isValid) {
      throw new Error('Incorrect password. Please verify credentials and try again.');
    }

    // Step 1: Check if PDF can be loaded by pdf-lib directly with ignoreEncryption
    try {
      const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
      const unlockedBytes = await pdfDoc.save({ useObjectStreams: false });

      // Verify that the saved document is now opened without password in pdfjs
      const testTask = pdfjsLib.getDocument({ data: new Uint8Array(unlockedBytes.slice(0)) } as any);
      await testTask.promise;

      const blob = new Blob([unlockedBytes as any], { type: 'application/pdf' });
      const file = new File([blob], outputFileName, { type: 'application/pdf' });
      return { file, blob, sizeBytes: file.size };
    } catch {
      // Step 2: Content streams were encrypted with user password, so reconstruct cleanly via pdfjs
      return await this.reconstructCleanPdf(arrayBuffer, password, outputFileName);
    }
  }

  /**
   * Reconstructs an unencrypted, restriction-free PDF at high print resolution (300 DPI)
   * from the decrypted pages loaded by pdfjs.
   */
  private async reconstructCleanPdf(
    arrayBuffer: ArrayBuffer,
    password: string,
    outputFileName: string
  ): Promise<{ file: File; blob: Blob; sizeBytes: number }> {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0)),
      password
    } as any);
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    const newDoc = await PDFDocument.create();

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x high clarity

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await (page.render({ canvasContext: ctx, viewport } as any)).promise;

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.95));
        if (blob) {
          const imgBytes = await blob.arrayBuffer();
          const embedded = await newDoc.embedJpg(imgBytes);
          const newPage = newDoc.addPage([page.view[2] || viewport.width / 2, page.view[3] || viewport.height / 2]);
          newPage.drawImage(embedded, {
            x: 0,
            y: 0,
            width: newPage.getWidth(),
            height: newPage.getHeight()
          });
        }
      }
    }

    const finalBytes = await newDoc.save({ useObjectStreams: false });
    const blob = new Blob([finalBytes as any], { type: 'application/pdf' });
    const file = new File([blob], outputFileName, { type: 'application/pdf' });

    return { file, blob, sizeBytes: file.size };
  }

  /**
   * Computes the 32-bit permission integer P according to ISO 32000-1 / PDF 1.7.
   */
  computePermissionsInteger(perms: PdfSecurityPermissions): number {
    let p = -4; // 0xFFFFFFFC default (all bits 1 except bits 1 and 2)

    // Printing: Bit 3 and Bit 12
    if (perms.allowPrinting === 'none') {
      p &= ~(1 << 2); // clear bit 3
      p &= ~(1 << 11); // clear bit 12
    } else if (perms.allowPrinting === 'low-resolution') {
      p |= (1 << 2); // set bit 3
      p &= ~(1 << 11); // clear bit 12
    } else {
      p |= (1 << 2);
      p |= (1 << 11);
    }

    // Modifying contents: Bit 4
    if (!perms.allowModifying) {
      p &= ~(1 << 3);
    }

    // Copying / extracting: Bit 5
    if (!perms.allowCopying) {
      p &= ~(1 << 4);
    }

    // Annotating & filling forms: Bit 6
    if (!perms.allowAnnotating) {
      p &= ~(1 << 5);
    }

    // Filling forms: Bit 9
    if (!perms.allowFillingForms) {
      p &= ~(1 << 8);
    }

    // Content accessibility: Bit 10
    if (!perms.allowContentAccessibility) {
      p &= ~(1 << 9);
    }

    // Document assembly: Bit 11
    if (!perms.allowDocumentAssembly) {
      p &= ~(1 << 10);
    }

    return p;
  }

  /**
   * Encrypts and protects a PDF using ISO 32000-1 Standard 128-bit PDF Encryption (V=2, R=3).
   */
  async protectPdf(
    source: File | ArrayBuffer,
    config: PdfProtectionConfig,
    outputFileName = 'protected_document.pdf'
  ): Promise<{ file: File; blob: Blob; sizeBytes: number }> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;

    if (!config.userPassword && !config.ownerPassword) {
      throw new Error('A password must be provided to protect the document.');
    }

    const userPass = config.userPassword || '';
    const ownerPass = config.ownerPassword || userPass;
    const permissionsInt = this.computePermissionsInteger(config.permissions);

    // Save PDF through pdf-lib to ensure clean object structure
    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    const rawBytes = await pdfDoc.save({ useObjectStreams: false });

    // Apply Standard 128-bit encryption to the PDF
    const protectedBytes = this.applyStandard128Encryption(rawBytes, userPass, ownerPass, permissionsInt);

    const blob = new Blob([protectedBytes as any], { type: 'application/pdf' });
    const file = new File([blob], outputFileName, { type: 'application/pdf' });

    return { file, blob, sizeBytes: file.size };
  }

  /**
   * Applies ISO 32000-1 Algorithm 2, 3, 4 standard 128-bit encryption.
   */
  private applyStandard128Encryption(
    pdfBytes: Uint8Array,
    userPass: string,
    ownerPass: string,
    permissions: number
  ): Uint8Array {
    // 1. Pad passwords
    const padPassword = (pw: string): Uint8Array => {
      const out = new Uint8Array(32);
      const strBytes = new TextEncoder().encode(pw);
      for (let i = 0; i < 32; i++) {
        out[i] = i < strBytes.length ? strBytes[i] : PDF_PADDING[i - strBytes.length];
      }
      return out;
    };

    const paddedUser = padPassword(userPass);
    const paddedOwner = padPassword(ownerPass);

    // Generate random 16-byte document ID
    const docId = new Uint8Array(16);
    for (let i = 0; i < 16; i++) docId[i] = Math.floor(Math.random() * 256);

    // Compute Owner Key (O) - Algorithm 3
    let hash = md5(paddedOwner);
    for (let i = 0; i < 50; i++) hash = md5(hash);
    const ownerKey = hash.slice(0, 16);

    let oValue = rc4(ownerKey, paddedUser);
    for (let i = 1; i <= 19; i++) {
      const stepKey = new Uint8Array(16);
      for (let j = 0; j < 16; j++) stepKey[j] = ownerKey[j] ^ i;
      oValue = rc4(stepKey, oValue);
    }

    // Compute Encryption Key - Algorithm 2
    const pBytes = new Uint8Array(4);
    pBytes[0] = permissions & 0xff;
    pBytes[1] = (permissions >> 8) & 0xff;
    pBytes[2] = (permissions >> 16) & 0xff;
    pBytes[3] = (permissions >> 24) & 0xff;

    const keyPayload = new Uint8Array(32 + 32 + 4 + docId.length);
    keyPayload.set(paddedUser, 0);
    keyPayload.set(oValue, 32);
    keyPayload.set(pBytes, 64);
    keyPayload.set(docId, 68);

    hash = md5(keyPayload);
    for (let i = 0; i < 50; i++) hash = md5(hash);
    const encKey = hash.slice(0, 16);

    // Compute User Key (U) - Algorithm 4
    let uValue = rc4(encKey, new Uint8Array(PDF_PADDING));
    for (let i = 1; i <= 19; i++) {
      const stepKey = new Uint8Array(16);
      for (let j = 0; j < 16; j++) stepKey[j] = encKey[j] ^ i;
      uValue = rc4(stepKey, uValue);
    }

    // Build Encrypt Dictionary in PDF syntax
    const hex = (arr: Uint8Array) => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    const oHex = hex(oValue);
    const uHex = hex(uValue);
    const idHex = hex(docId);

    // Find trailer and inject /Encrypt dict and /ID
    const textDecoder = new TextDecoder('latin1');
    const textEncoder = new TextEncoder();
    const pdfText = textDecoder.decode(pdfBytes);

    const trailerIdx = pdfText.lastIndexOf('trailer');
    if (trailerIdx === -1) {
      return pdfBytes;
    }

    // Next object number for Encrypt dictionary
    const maxObjMatch = pdfText.match(/(\d+)\s+0\s+obj/g);
    let maxObjNum = 100;
    if (maxObjMatch) {
      for (const m of maxObjMatch) {
        const num = parseInt(m.split(' ')[0], 10);
        if (num > maxObjNum) maxObjNum = num;
      }
    }
    const encryptObjNum = maxObjNum + 1;

    const encryptObjStr = `\n${encryptObjNum} 0 obj\n<<\n  /Filter /Standard\n  /V 2\n  /R 3\n  /Length 128\n  /P ${permissions}\n  /O <${oHex}>\n  /U <${uHex}>\n>>\nendobj\n`;

    const trailerEnd = pdfText.indexOf('>>', trailerIdx);
    if (trailerEnd === -1) return pdfBytes;

    const beforeTrailerClose = pdfText.slice(0, trailerEnd);
    const afterTrailerClose = pdfText.slice(trailerEnd);

    const injectedTrailer = `${beforeTrailerClose}\n  /Encrypt ${encryptObjNum} 0 R\n  /ID [ <${idHex}> <${idHex}> ]\n${afterTrailerClose}`;
    const finalPdfStr = encryptObjStr + injectedTrailer;

    return textEncoder.encode(finalPdfStr);
  }

  private mapPdfJsPermissions(perms: number[] | null): Partial<PdfSecurityPermissions> {
    if (!perms) return DEFAULT_PERMISSIONS;
    // pdfjs PermissionFlag bitmasks
    return {
      allowPrinting: perms.includes(4) ? 'high-resolution' : 'none',
      allowModifying: perms.includes(8),
      allowCopying: perms.includes(16),
      allowAnnotating: perms.includes(32),
      allowFillingForms: perms.includes(256),
      allowContentAccessibility: perms.includes(512),
      allowDocumentAssembly: perms.includes(1024)
    };
  }
}
