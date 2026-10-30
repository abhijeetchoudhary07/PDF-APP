import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import * as forgeImport from 'node-forge';
import {
  PDFDocument,
  PDFName,
  PDFHexString,
  PDFNumber,
  PDFString,
  rgb
} from 'pdf-lib';

import {
  X509CertificateInfo,
  UnlockedP12Data,
  CryptoSignOptions,
  CryptoSignResult,
  CryptoSignVerificationReport,
  CreateCertOptions
} from '../models/crypto-sign.types';

// Normalise node-forge import across CJS and ESM environments
const forge: any = (forgeImport as any).default || forgeImport;

const SIGNATURE_CONTENTS_BYTES = 8192; // 8192 bytes = 16384 hex characters
const SIGNATURE_HEX_LENGTH = SIGNATURE_CONTENTS_BYTES * 2;
const PLACEHOLDER_BYTERANGE = '/ByteRange [ 0 1000000000 1000000000 1000000000 ]';

@Injectable({
  providedIn: 'root'
})
export class PdfCryptoSignService {
  // Brute-force & timing attack protection state
  private failedUnlockAttempts = 0;
  private lastFailedUnlockTime = 0;
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_PERIOD_MS = 15000; // 15 seconds lockout

  /**
   * Resets failed attempt counter (useful for testing or after administrative reset)
   */
  resetBruteForceProtection(): void {
    this.failedUnlockAttempts = 0;
    this.lastFailedUnlockTime = 0;
  }

  // ==========================================
  // 1. PKCS#12 Parsing & Decryption
  // ==========================================

  /**
   * Ingests a binary .p12/.pfx file, decrypts using user password,
   * and extracts the X.509 certificate chain and RSA private key.
   * Includes rate-limiting protection against brute-force attacks.
   */
  unlockP12(p12Buffer: ArrayBuffer | Uint8Array, password: string): UnlockedP12Data {
    // 1. Check brute-force lockout
    const now = Date.now();
    if (this.failedUnlockAttempts >= PdfCryptoSignService.MAX_FAILED_ATTEMPTS) {
      const elapsed = now - this.lastFailedUnlockTime;
      if (elapsed < PdfCryptoSignService.LOCKOUT_PERIOD_MS) {
        const remainingSec = Math.ceil((PdfCryptoSignService.LOCKOUT_PERIOD_MS - elapsed) / 1000);
        throw new Error(
          `Too many failed unlock attempts. Decryption locked for ${remainingSec} seconds to protect against brute-force attacks.`
        );
      } else {
        this.failedUnlockAttempts = 0;
      }
    }

    const bytes = p12Buffer instanceof Uint8Array
      ? p12Buffer
      : new Uint8Array(p12Buffer);

    // Convert Uint8Array to binary string for node-forge
    let binaryStr = '';
    const chunkSz = 8192;
    for (let i = 0; i < bytes.length; i += chunkSz) {
      const slice = bytes.subarray(i, Math.min(i + chunkSz, bytes.length));
      binaryStr += String.fromCharCode.apply(null, slice as any);
    }

    let p12Asn1: any;
    try {
      p12Asn1 = forge.asn1.fromDer(binaryStr);
    } catch {
      throw new Error('Failed to parse certificate: file is not valid ASN.1 DER data');
    }

    let p12: any;
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    } catch (err: any) {
      this.failedUnlockAttempts++;
      this.lastFailedUnlockTime = Date.now();
      throw new Error(
        'Incorrect password or unsupported PKCS#12 encryption scheme. Please verify your password.'
      );
    }

    // Extract X.509 Certificate
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    if (certBags.length === 0) {
      throw new Error('No X.509 certificate found inside this PKCS#12 file');
    }

    const certificate = certBags[0].cert;
    const certChain = certBags.map((b: any) => b.cert);

    // Extract Private Key
    const pkcs8Bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
    const plainKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
    const keyBag = pkcs8Bags[0] || plainKeyBags[0];

    if (!keyBag || !keyBag.key) {
      throw new Error('No matching RSA private key found inside this PKCS#12 file');
    }

    // Success: reset failed attempt counter
    this.failedUnlockAttempts = 0;

    const privateKey = keyBag.key;
    const certInfo = this.extractCertInfo(certificate);

    return {
      certInfo,
      certificate,
      privateKey,
      certChain
    };
  }

  /**
   * Helper to parse human-readable X.509 details from a certificate.
   */
  extractCertInfo(cert: any): X509CertificateInfo {
    const commonName = cert.subject.getField('CN')?.value || 'Unnamed Signer';
    const organization = cert.subject.getField('O')?.value || '';
    const issuer = cert.issuer.getField('CN')?.value || cert.issuer.getField('O')?.value || 'Self-Issued';

    const notBefore = cert.validity.notBefore instanceof Date
      ? cert.validity.notBefore
      : new Date(cert.validity.notBefore);
    const notAfter = cert.validity.notAfter instanceof Date
      ? cert.validity.notAfter
      : new Date(cert.validity.notAfter);

    const now = new Date();
    const isExpired = now.getTime() > notAfter.getTime();
    const isValid = now.getTime() >= notBefore.getTime() && !isExpired;

    // Calculate SHA-256 fingerprint of DER cert
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md = forge.md.sha256.create();
    md.update(der);
    const fingerprintSha256 = md.digest().toHex();

    let keySize: number | undefined;
    try {
      if (cert.publicKey?.n) {
        keySize = cert.publicKey.n.bitLength();
      }
    } catch {}

    return {
      commonName,
      organization,
      issuer,
      validityNotBefore: notBefore.toISOString(),
      validityNotAfter: notAfter.toISOString(),
      serialNumber: cert.serialNumber || '01',
      isValid,
      isExpired,
      fingerprintSha256,
      keySize
    };
  }

  // ==========================================
  // 2. Standards-Compliant PDF Digital Signing
  // ==========================================

  /**
   * Signs a PDF document with standard Adobe PPKLite / adbe.pkcs7.detached
   * CMS SignedData using the unlocked PKCS#12 certificate and private key.
   */
  async signPdf(
    pdfBytes: ArrayBuffer | Uint8Array,
    p12Data: UnlockedP12Data,
    options: CryptoSignOptions = {}
  ): Promise<CryptoSignResult> {
    // Honesty Gate: Block signing if certificate is expired or invalid
    if (!options.allowExpiredCert) {
      if (p12Data.certInfo.isExpired) {
        throw new Error(
          `Cryptographic Honesty Gate Failed: Certificate "${p12Data.certInfo.commonName}" is expired (expired on ${p12Data.certInfo.validityNotAfter}). Digital signing rejected.`
        );
      }
      if (!p12Data.certInfo.isValid) {
        throw new Error(
          `Cryptographic Honesty Gate Failed: Certificate "${p12Data.certInfo.commonName}" is not yet valid (validity begins ${p12Data.certInfo.validityNotBefore}). Digital signing rejected.`
        );
      }
    }

    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    // Optional visual signature stamp appearance
    if (options.includeVisualStamp) {
      await this.applyVisualSignatureStamp(doc, p12Data.certInfo, options);
    }

    // Create signature placeholder dictionary
    const now = new Date();
    const pdfDateStr = this.formatPdfDate(now);

    const sigDict = doc.context.obj({
      Type: 'Sig',
      Filter: 'Adobe.PPKLite',
      SubFilter: 'adbe.pkcs7.detached',
      ByteRange: [
        PDFNumber.of(0),
        PDFNumber.of(1000000000),
        PDFNumber.of(1000000000),
        PDFNumber.of(1000000000)
      ],
      Contents: PDFHexString.of('0'.repeat(SIGNATURE_HEX_LENGTH)),
      Reason: PDFString.of(options.reason || 'Cryptographically signed with user certificate'),
      Location: PDFString.of(options.location || ''),
      M: PDFString.of(pdfDateStr)
    });
    const sigRef = doc.context.register(sigDict);

    // Link to AcroForm signature field & widget annotation
    const pages = doc.getPages();
    const targetPage = pages[Math.max(0, Math.min((options.stampPage || 1) - 1, pages.length - 1))];

    const rect = options.stampRect || { x: 50, y: 70, width: 260, height: 80 };
    const widgetRect = options.includeVisualStamp
      ? [PDFNumber.of(rect.x), PDFNumber.of(rect.y), PDFNumber.of(rect.x + rect.width), PDFNumber.of(rect.y + rect.height)]
      : [PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0)];

    const sigField = doc.context.obj({
      FT: 'Sig',
      T: PDFString.of(`Signature_${Date.now()}`),
      V: sigRef,
      Type: 'Annot',
      Subtype: 'Widget',
      Rect: widgetRect,
      P: targetPage.ref,
      F: 4
    });
    const fieldRef = doc.context.register(sigField);

    let annots = targetPage.node.Annots();
    if (!annots) {
      annots = doc.context.obj([]);
      targetPage.node.set(PDFName.of('Annots'), annots);
    }
    annots.push(fieldRef);

    const form = doc.getForm();
    form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3));
    let fields = form.acroForm.dict.get(PDFName.of('Fields'));
    if (!fields) {
      fields = doc.context.obj([]);
      form.acroForm.dict.set(PDFName.of('Fields'), fields);
    }
    (fields as any).push(fieldRef);

    // Save with uncompressed object streams so offsets are exact byte positions
    const preparedPdfBytes = await doc.save({ useObjectStreams: false });
    const pdfBuffer = new Uint8Array(preparedPdfBytes);

    // Locate ByteRange placeholder & Contents placeholder
    const pdfLatin1 = this.uint8ArrayToLatin1(pdfBuffer);
    const byteRangeOffset = pdfLatin1.indexOf(PLACEHOLDER_BYTERANGE);
    if (byteRangeOffset === -1) {
      throw new Error('Internal error: /ByteRange placeholder not found in prepared PDF');
    }

    const contentsTag = '/Contents <';
    const contentsOffset = pdfLatin1.indexOf(contentsTag);
    if (contentsOffset === -1) {
      throw new Error('Internal error: /Contents placeholder not found in prepared PDF');
    }

    const openBracket = contentsOffset + '/Contents '.length; // byte offset of '<'
    const closeBracket = openBracket + SIGNATURE_HEX_LENGTH + 1; // byte offset of '>'

    if (pdfBuffer[openBracket] !== 60 /* '<' */ || pdfBuffer[closeBracket] !== 62 /* '>' */) {
      throw new Error('Internal error: /Contents boundary brackets misaligned');
    }

    // Calculate actual byte ranges
    const length1 = openBracket;
    const offset2 = closeBracket + 1;
    const length2 = pdfBuffer.length - offset2;

    const pad10 = (n: number) => String(n).padStart(10, '0');
    const actualByteRangeStr = `/ByteRange [ 0 ${pad10(length1)} ${pad10(offset2)} ${pad10(length2)} ]`;

    // Overwrite placeholder ByteRange with exact values (same character length)
    this.writeAsciiToBuffer(pdfBuffer, byteRangeOffset, actualByteRangeStr);

    // Extract exact bytes to sign (Chunk 1 + Chunk 2)
    const chunk1 = pdfBuffer.subarray(0, length1);
    const chunk2 = pdfBuffer.subarray(offset2);
    const signedDataBuffer = new Uint8Array(chunk1.length + chunk2.length);
    signedDataBuffer.set(chunk1, 0);
    signedDataBuffer.set(chunk2, chunk1.length);

    // Construct CMS / PKCS#7 SignedData detached signature
    const binarySignedData = this.uint8ArrayToLatin1(signedDataBuffer);
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(binarySignedData);
    p7.addCertificate(p12Data.certificate);

    p7.addSigner({
      key: p12Data.privateKey,
      certificate: p12Data.certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: now }
      ]
    });

    p7.sign({ detached: true });

    // DER encode signature and format as padded hex
    const derSignature = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const hexSignature = forge.util.bytesToHex(derSignature).padEnd(SIGNATURE_HEX_LENGTH, '0');

    if (hexSignature.length > SIGNATURE_HEX_LENGTH) {
      throw new Error(
        `Signature container size (${hexSignature.length}) exceeds reserved capacity (${SIGNATURE_HEX_LENGTH})`
      );
    }

    // Splice hex signature into /Contents placeholder
    this.writeAsciiToBuffer(pdfBuffer, openBracket + 1, hexSignature);

    // Compute document SHA-256 for audit record
    const docMd = forge.md.sha256.create();
    docMd.update(binarySignedData);
    const documentDigestSha256 = docMd.digest().toHex();

    // ==========================================
    // Honesty Gate & Verification Check
    // ==========================================
    const verification = await this.verifyPdfSignature(pdfBuffer);
    if (!verification.isValid) {
      throw new Error(
        `Cryptographic Honesty Gate Failed: Generated PDF signature could not be verified (${verification.error || 'digest mismatch'}). Operation aborted.`
      );
    }

    return {
      signedPdfBytes: pdfBuffer,
      byteRange: [0, length1, offset2, length2],
      documentDigestSha256,
      signatureHexLength: derSignature.length * 2,
      signerCommonName: p12Data.certInfo.commonName,
      signedAt: now.toISOString(),
      verificationPassed: true
    };
  }

  // ==========================================
  // 3. Cryptographic Signature Verification
  // ==========================================

  /**
   * Verifies the cryptographic integrity of any digital signature inside a PDF.
   * Enforces strict /ByteRange boundary rules, detects PDF Shadow Attacks,
   * safely parses CMS SignedData, and verifies SHA-256 hash.
   */
  async verifyPdfSignature(pdfBytes: ArrayBuffer | Uint8Array): Promise<CryptoSignVerificationReport> {
    const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
    const pdfLatin1 = this.uint8ArrayToLatin1(bytes);

    const brMatch = pdfLatin1.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    if (!brMatch) {
      return {
        isValid: false,
        hasSignature: false,
        byteRange: null,
        expectedDigest: '',
        actualDigest: '',
        error: 'No valid /ByteRange array found in PDF'
      };
    }

    const br: [number, number, number, number] = [
      parseInt(brMatch[1], 10),
      parseInt(brMatch[2], 10),
      parseInt(brMatch[3], 10),
      parseInt(brMatch[4], 10)
    ];

    // 1. Verify ByteRange boundaries (no overlaps, starts at zero)
    if (br[0] !== 0) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest: '',
        actualDigest: '',
        error: 'Invalid ByteRange: First range does not start at byte 0'
      };
    }

    if (br[1] >= br[2]) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest: '',
        actualDigest: '',
        error: `Invalid ByteRange: Range 1 end (${br[1]}) exceeds or equals Range 2 start (${br[2]})`
      };
    }

    // 2. PDF Shadow Attack Check: Detect trailing incremental updates injected after the signed boundary
    if (bytes.length > br[2] + br[3]) {
      const trailingCount = bytes.length - (br[2] + br[3]);
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest: '',
        actualDigest: '',
        error: `PDF Shadow Attack detected: File contains ${trailingCount} unhashed trailing bytes after signed ByteRange boundary`
      };
    }

    if (br[2] + br[3] !== bytes.length) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest: '',
        actualDigest: '',
        error: `ByteRange bounds mismatch: range [${br.join(', ')}] does not encompass file of ${bytes.length} bytes`
      };
    }

    // 3. Strict Boundary Bracket Check: ByteRange must precisely bracket the /Contents <...> delimiters
    if (bytes[br[1]] !== 60 /* '<' */ || bytes[br[2] - 1] !== 62 /* '>' */) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest: '',
        actualDigest: '',
        error: 'ByteRange does not strictly align with /Contents hex container boundary brackets'
      };
    }

    // 4. Extract signature hex from /Contents <...>
    const hexContents = pdfLatin1.substring(br[1] + 1, br[2] - 1).trim();
    if (!hexContents || hexContents.length < 100) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest: '',
        actualDigest: '',
        error: 'Empty or missing signature content'
      };
    }

    // 5. Hex validation & parser buffer safety
    if (/[^0-9a-fA-F]/.test(hexContents)) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest: '',
        actualDigest: '',
        error: 'Signature contents contain invalid non-hex characters'
      };
    }

    if (hexContents.length % 2 !== 0) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest: '',
        actualDigest: '',
        error: 'Signature contents hex length is odd (corrupted DER structure)'
      };
    }

    // Compute expected SHA-256 over ByteRange chunks
    const chunk1 = bytes.subarray(br[0], br[0] + br[1]);
    const chunk2 = bytes.subarray(br[2], br[2] + br[3]);
    const signedDataBuffer = new Uint8Array(chunk1.length + chunk2.length);
    signedDataBuffer.set(chunk1, 0);
    signedDataBuffer.set(chunk2, chunk1.length);

    const md = forge.md.sha256.create();
    md.update(this.uint8ArrayToLatin1(signedDataBuffer));
    const expectedDigest = md.digest().toHex();

    // 6. Parse ASN.1 DER CMS SignedData
    let rawSigBytes: string;
    try {
      rawSigBytes = forge.util.hexToBytes(hexContents);
    } catch {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest,
        actualDigest: '',
        error: 'Hex decoding of /Contents failed'
      };
    }

    let parsedAsn1: any;
    try {
      parsedAsn1 = forge.asn1.fromDer(rawSigBytes, { parseAllBytes: false });
    } catch (e: any) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest,
        actualDigest: '',
        error: `ASN.1 DER parsing failed: ${e?.message || 'invalid structure'}`
      };
    }

    if (!parsedAsn1 || !parsedAsn1.value || !Array.isArray(parsedAsn1.value)) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest,
        actualDigest: '',
        error: 'Malformed ASN.1 structure: Root is not a valid CMS sequence'
      };
    }

    let actualDigest = '';
    let signerCommonName = '';
    let signerOrganization = '';
    let signerIssuer = '';
    let signingTime = '';
    let isCertExpired = false;
    let certValidityNotBefore: string | undefined;
    let certValidityNotAfter: string | undefined;
    const warnings: string[] = [];

    try {
      const signedDataAsn1 = parsedAsn1.value[1].value[0];
      const signerInfos = signedDataAsn1.value[4];
      const signerInfo = signerInfos.value[0];
      const authAttrs = signerInfo.value[3];

      for (const attr of authAttrs.value) {
        const oid = forge.asn1.derToOid(attr.value[0].value);
        if (oid === forge.pki.oids.messageDigest) {
          actualDigest = forge.util.bytesToHex(attr.value[1].value[0].value);
        } else if (oid === forge.pki.oids.signingTime) {
          signingTime = attr.value[1].value[0].value;
        }
      }

      // Try reading certificate subject details from certificates set
      const certsSet = signedDataAsn1.value[3];
      if (certsSet && certsSet.value && certsSet.value.length > 0) {
        try {
          const certObj = forge.pki.certificateFromAsn1(certsSet.value[0]);
          signerCommonName = certObj.subject.getField('CN')?.value || '';
          signerOrganization = certObj.subject.getField('O')?.value || '';
          signerIssuer = certObj.issuer.getField('CN')?.value || certObj.issuer.getField('O')?.value || '';

          if (certObj.validity) {
            const notBeforeRaw = certObj.validity.notBefore;
            const notAfterRaw = certObj.validity.notAfter;
            const notBeforeDate = notBeforeRaw instanceof Date
              ? notBeforeRaw
              : new Date(notBeforeRaw || Date.now());
            const notAfterDate = notAfterRaw instanceof Date
              ? notAfterRaw
              : new Date(notAfterRaw || Date.now());

            certValidityNotBefore = notBeforeDate.toISOString();
            certValidityNotAfter = notAfterDate.toISOString();

            if (Date.now() > notAfterDate.getTime()) {
              isCertExpired = true;
              warnings.push(`Signer certificate expired on ${certValidityNotAfter}`);
            }
          }
        } catch (certErr: any) {
          warnings.push(`Could not fully parse embedded X.509 certificate: ${certErr?.message}`);
        }
      }
    } catch (e: any) {
      return {
        isValid: false,
        hasSignature: true,
        byteRange: br,
        expectedDigest,
        actualDigest,
        error: `Failed to extract SignedData attributes: ${e?.message || 'malformed'}`
      };
    }

    const isValid = actualDigest.toLowerCase() === expectedDigest.toLowerCase();

    return {
      isValid,
      hasSignature: true,
      byteRange: br,
      expectedDigest,
      actualDigest,
      signerInfo: {
        commonName: signerCommonName,
        organization: signerOrganization,
        issuer: signerIssuer,
        signingTime,
        isExpired: isCertExpired,
        validityNotBefore: certValidityNotBefore,
        validityNotAfter: certValidityNotAfter
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      error: isValid ? undefined : 'Document content has been modified or corrupted (hash mismatch)'
    };
  }

  // ==========================================
  // 4. Test Utility: Self-Signed & CA Cert Generator
  // ==========================================

  /**
   * Generates a local RSA PKCS#12 certificate on-device (2048-bit or 4096-bit,
   * self-signed or simulated CA-issued, valid or expired) for testing.
   */
  async createSelfSignedP12(
    commonName: string,
    password: string,
    organization: string = 'Indian Form Helper',
    options: CreateCertOptions = {}
  ): Promise<{ p12Bytes: Uint8Array; certInfo: X509CertificateInfo }> {
    const keySize = options.keySize || 2048;
    const keys = forge.pki.rsa.generateKeyPair(keySize);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = String(Date.now());

    const now = new Date();
    let notBefore: Date;
    let notAfter: Date;

    if (options.isExpired) {
      // Validity window in the past
      notBefore = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
      notAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      const days = options.daysValid || 730; // 2 years default
      notBefore = new Date(now.getTime() - 60 * 1000);
      notAfter = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    }

    cert.validity.notBefore = notBefore;
    cert.validity.notAfter = notAfter;

    const subjectAttrs = [
      { name: 'commonName', value: commonName },
      { name: 'organizationName', value: organization },
      { name: 'countryName', value: 'IN' }
    ];
    cert.setSubject(subjectAttrs);

    const issuerAttrs = options.issuerCommonName
      ? [
          { name: 'commonName', value: options.issuerCommonName },
          { name: 'organizationName', value: `${organization} Trust Network CA` },
          { name: 'countryName', value: 'IN' }
        ]
      : subjectAttrs;
    cert.setIssuer(issuerAttrs);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
      generateLocalKeyId: true,
      friendlyName: `${commonName} Certificate`,
      algorithm: '3des'
    });

    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const p12Bytes = new Uint8Array(p12Der.length);
    for (let i = 0; i < p12Der.length; i++) {
      p12Bytes[i] = p12Der.charCodeAt(i);
    }

    const certInfo = this.extractCertInfo(cert);
    certInfo.keySize = keySize;
    return { p12Bytes, certInfo };
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private async applyVisualSignatureStamp(
    doc: PDFDocument,
    certInfo: X509CertificateInfo,
    options: CryptoSignOptions
  ): Promise<void> {
    const pages = doc.getPages();
    const pageIndex = Math.max(0, Math.min((options.stampPage || 1) - 1, pages.length - 1));
    const page = pages[pageIndex];

    const rect = options.stampRect || { x: 50, y: 70, width: 260, height: 80 };
    const signer = options.visualStamp?.signerName || certInfo.commonName;
    const org = options.visualStamp?.organization || certInfo.organization;
    const reason = options.reason || 'Cryptographically signed with user certificate';
    const loc = options.location || '';
    const dateStr = new Date().toLocaleString();

    // Draw visual stamp container box
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      borderWidth: 1.5,
      borderColor: rgb(0.12, 0.23, 0.54), // navy
      color: rgb(0.97, 0.98, 1.0) // very light blue tint
    });

    // Inner accent line
    page.drawLine({
      start: { x: rect.x + 8, y: rect.y + rect.height - 24 },
      end: { x: rect.x + rect.width - 8, y: rect.y + rect.height - 24 },
      thickness: 1,
      color: rgb(0.23, 0.51, 0.96)
    });

    // Signer Title Header
    page.drawText(`Digitally Signed by: ${signer}`, {
      x: rect.x + 10,
      y: rect.y + rect.height - 18,
      size: 9,
      color: rgb(0.12, 0.23, 0.54)
    });

    // Details Lines
    let currentY = rect.y + rect.height - 36;
    if (org) {
      page.drawText(`Org: ${org}`, { x: rect.x + 10, y: currentY, size: 7.5, color: rgb(0.2, 0.2, 0.2) });
      currentY -= 11;
    }

    page.drawText(`Date: ${dateStr}`, { x: rect.x + 10, y: currentY, size: 7.5, color: rgb(0.2, 0.2, 0.2) });
    currentY -= 11;

    if (reason) {
      page.drawText(`Reason: ${reason}`, { x: rect.x + 10, y: currentY, size: 7, color: rgb(0.3, 0.3, 0.3) });
      currentY -= 10;
    }

    if (loc) {
      page.drawText(`Location: ${loc}`, { x: rect.x + 10, y: currentY, size: 7, color: rgb(0.3, 0.3, 0.3) });
    }
  }

  private formatPdfDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const h = pad(date.getUTCHours());
    const min = pad(date.getUTCMinutes());
    const s = pad(date.getUTCSeconds());
    return `D:${y}${m}${d}${h}${min}${s}Z`;
  }

  private uint8ArrayToLatin1(arr: Uint8Array): string {
    let result = '';
    const chunkSz = 8192;
    for (let i = 0; i < arr.length; i += chunkSz) {
      const slice = arr.subarray(i, Math.min(i + chunkSz, arr.length));
      result += String.fromCharCode.apply(null, slice as any);
    }
    return result;
  }

  private writeAsciiToBuffer(buf: Uint8Array, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
      buf[offset + i] = text.charCodeAt(i);
    }
  }
}
