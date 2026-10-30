import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFStream,
  PDFRawStream,
  PDFString,
  decodePDFRawStream
} from 'pdf-lib';

import {
  PacketSigner,
  SigningWorkflowMode,
  SigningPacketManifest,
  SigningPacketStatusReport,
  SignFieldExecutionData
} from '../models/signing-packet.types';
import { StorageService } from './storage.service';

const MANIFEST_ATTACHMENT_NAME = '_signing_manifest.json';

@Injectable({
  providedIn: 'root'
})
export class PdfSigningPacketService {
  private storageService = inject(StorageService, { optional: true });

  // ==========================================
  // 1. Cryptographic Hash Helpers
  // ==========================================

  async computeSha256(data: ArrayBuffer | Uint8Array): Promise<string> {
    const buffer = data instanceof Uint8Array
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Deterministic token representing the document's authorized state:
   * baseDocumentHash + page count + page content stream hashes +
   * sorted signer statuses + sorted field values and read-only flags.
   */
  async computeIntegrityToken(
    doc: PDFDocument,
    baseHash: string,
    signers: PacketSigner[]
  ): Promise<string> {
    const parts: string[] = [baseHash, `pages:${doc.getPageCount()}`];

    // 1. Page Content Stream cryptographic digests (detects page / text modifications)
    for (let i = 0; i < doc.getPageCount(); i++) {
      const page = doc.getPage(i);
      const contentsRef = page.node.get(PDFName.of('Contents'));
      if (contentsRef) {
        const contentsObj = doc.context.lookup(contentsRef);
        if (contentsObj instanceof PDFStream || contentsObj instanceof PDFRawStream) {
          const streamBytes = contentsObj.getContents();
          const streamHash = await this.computeSha256(streamBytes);
          parts.push(`page:${i}:stream:${streamHash}`);
        } else if (contentsObj instanceof PDFArray) {
          for (let j = 0; j < contentsObj.size(); j++) {
            const subStream = doc.context.lookup(contentsObj.get(j));
            if (subStream instanceof PDFStream || subStream instanceof PDFRawStream) {
              const streamHash = await this.computeSha256(subStream.getContents());
              parts.push(`page:${i}:stream:${j}:${streamHash}`);
            }
          }
        }
      }
    }

    // 2. Deterministically sorted Signers sequence and status
    const sortedSigners = [...signers].sort(
      (a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id)
    );
    for (const s of sortedSigners) {
      parts.push(`${s.id}:${s.orderIndex}:${s.status}:${s.signedAt || ''}`);
    }

    // 3. Deterministically sorted Form field values and read-only flags
    try {
      const form = doc.getForm();
      const fields = form.getFields();
      const sortedFields = [...fields].sort((a, b) => a.getName().localeCompare(b.getName()));

      for (const f of sortedFields) {
        const name = f.getName();
        let val = '';
        try {
          if (typeof (f as any).getText === 'function') {
            val = (f as any).getText() || '';
          } else if (typeof (f as any).isChecked === 'function') {
            val = (f as any).isChecked() ? 'true' : 'false';
          } else if (typeof (f as any).getSelected === 'function') {
            val = (f as any).getSelected() || '';
          }
        } catch {
          // ignore read error
        }
        const isReadOnly = typeof f.isReadOnly === 'function' ? f.isReadOnly() : false;
        parts.push(`field:${name}=${val}:ro=${isReadOnly}`);
      }
    } catch {
      // Document might not have AcroForm
    }

    const payload = new TextEncoder().encode(parts.join('|'));
    return this.computeSha256(payload);
  }

  // ==========================================
  // 2. Packet Creation
  // ==========================================

  /**
   * Creates a tamper-evident on-device signing packet PDF embedding
   * a cryptographically verifiable JSON manifest as an embedded attachment.
   */
  async createPacket(
    basePdfBytes: ArrayBuffer | Uint8Array,
    title: string,
    signers: PacketSigner[],
    mode: SigningWorkflowMode = 'sequential'
  ): Promise<{ packetBytes: Uint8Array; manifest: SigningPacketManifest }> {
    const baseDocumentHash = await this.computeSha256(basePdfBytes);
    const pdfDoc = await PDFDocument.load(basePdfBytes, { ignoreEncryption: true });

    // Order signers by orderIndex
    const sortedSigners = signers.map((s, idx) => ({
      ...s,
      orderIndex: s.orderIndex !== undefined ? s.orderIndex : idx + 1,
      status: s.status || 'pending'
    })).sort((a, b) => a.orderIndex - b.orderIndex);

    // Initial integrity token
    const expectedIntegrityToken = await this.computeIntegrityToken(
      pdfDoc,
      baseDocumentHash,
      sortedSigners
    );

    const now = new Date().toISOString();
    const manifest: SigningPacketManifest = {
      manifestVersion: '1.0',
      packetId: `pkt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      title: title || 'Signing Packet',
      createdAt: now,
      updatedAt: now,
      workflowMode: mode,
      baseDocumentHash,
      expectedIntegrityToken,
      signers: sortedSigners,
      auditTrail: [
        {
          timestamp: now,
          signerId: 'system',
          signerName: 'Document Creator',
          action: 'packet_created',
          details: `Packet created with ${sortedSigners.length} signers (${mode} mode)`
        }
      ]
    };

    // Embed manifest attachment
    await this.embedManifestInDoc(pdfDoc, manifest);

    const packetBytes = await pdfDoc.save();
    return { packetBytes, manifest };
  }

  // ==========================================
  // 3. Packet Inspection & Tamper Verification
  // ==========================================

  /**
   * Inspects any PDF to check if it contains a signing packet manifest,
   * verifies integrity, calculates outstanding fields, and identifies the next signer.
   */
  async inspectPacket(
    pdfBytes: ArrayBuffer | Uint8Array
  ): Promise<SigningPacketStatusReport> {
    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    } catch {
      return {
        isPacket: false,
        isTampered: true,
        manifest: null,
        totalSigners: 0,
        completedSigners: 0,
        pendingSigners: 0,
        currentSigner: null,
        isCompleted: false,
        outstandingFieldIds: [],
        tamperReason: 'Corrupted or unreadable PDF document structure'
      };
    }

    const manifest = this.extractManifestFromDoc(pdfDoc);
    if (!manifest) {
      return {
        isPacket: false,
        isTampered: false,
        manifest: null,
        totalSigners: 0,
        completedSigners: 0,
        pendingSigners: 0,
        currentSigner: null,
        isCompleted: false,
        outstandingFieldIds: []
      };
    }

    // Verify Manifest Structure Integrity
    if (!manifest.packetId || !manifest.baseDocumentHash || !Array.isArray(manifest.signers)) {
      return {
        isPacket: true,
        isTampered: true,
        manifest,
        totalSigners: 0,
        completedSigners: 0,
        pendingSigners: 0,
        currentSigner: null,
        isCompleted: false,
        outstandingFieldIds: [],
        tamperReason: 'Manifest structure is corrupted or invalid'
      };
    }

    // Verify Tamper Evidence & Cryptographic Consistency
    let isTampered = false;
    let tamperReason: string | undefined;

    // Check 1: Manifest Spoofing Verification
    // Every signer with status 'signed' must have a verifiable audit trail record
    for (const signer of manifest.signers) {
      if (signer.status === 'signed') {
        const auditMatch = manifest.auditTrail?.some(
          a => a.signerId === signer.id && a.action === 'signed'
        );
        if (!auditMatch) {
          isTampered = true;
          tamperReason = `Manifest spoofing detected: Signer "${signer.name}" is marked signed without audit trail record`;
          break;
        }

        // If AcroForm exists, verify assigned fields are locked as read-only
        try {
          const form = pdfDoc.getForm();
          for (const fid of signer.assignedFieldIds) {
            try {
              const field = form.getField(fid);
              if (field && typeof field.isReadOnly === 'function' && !field.isReadOnly()) {
                isTampered = true;
                tamperReason = `Manifest spoofing detected: Assigned field "${fid}" for signed signer "${signer.name}" is not locked read-only`;
                break;
              }
            } catch {
              // field lookup fallback
            }
          }
        } catch {
          // no acroform
        }
        if (isTampered) break;
      }
    }

    // Check 2: Document Hash & Token Integrity
    if (!isTampered) {
      try {
        const currentToken = await this.computeIntegrityToken(
          pdfDoc,
          manifest.baseDocumentHash,
          manifest.signers
        );

        if (currentToken !== manifest.expectedIntegrityToken) {
          isTampered = true;
          tamperReason = 'Document content or form fields were altered outside the workflow';
        }
      } catch (err: any) {
        isTampered = true;
        tamperReason = err?.message || 'Integrity calculation failure';
      }
    }

    // Calculate signer statistics
    const totalSigners = manifest.signers.length;
    const completedSigners = manifest.signers.filter(s => s.status === 'signed').length;
    const pendingSigners = manifest.signers.filter(s => s.status === 'pending').length;
    const isCompleted = pendingSigners === 0 && totalSigners > 0;

    // Calculate Outstanding Fields
    const outstandingFieldIds: string[] = [];
    for (const signer of manifest.signers) {
      if (signer.status === 'pending') {
        for (const fid of signer.assignedFieldIds) {
          if (!outstandingFieldIds.includes(fid)) {
            outstandingFieldIds.push(fid);
          }
        }
      }
    }

    // Identify Next Eligible Signer
    let currentSigner: PacketSigner | null = null;
    if (!isCompleted) {
      if (manifest.workflowMode === 'sequential') {
        // First pending signer by orderIndex
        const pendingSorted = manifest.signers
          .filter(s => s.status === 'pending')
          .sort((a, b) => a.orderIndex - b.orderIndex);
        currentSigner = pendingSorted[0] || null;
      } else {
        // Parallel mode: any pending signer
        currentSigner = manifest.signers.find(s => s.status === 'pending') || null;
      }
    }

    return {
      isPacket: true,
      isTampered,
      manifest,
      totalSigners,
      completedSigners,
      pendingSigners,
      currentSigner,
      isCompleted,
      outstandingFieldIds,
      tamperReason
    };
  }

  // ==========================================
  // 4. Signer Execution Pass
  // ==========================================

  /**
   * Executes a signing pass for a designated signer: verifies rules,
   * enforces strict field access control, injects signatures, locks completed fields,
   * updates audit trail, and re-embeds manifest.
   */
  async signAsSigner(
    packetPdfBytes: ArrayBuffer | Uint8Array,
    signerId: string,
    fieldData: Record<string, SignFieldExecutionData> = {}
  ): Promise<{ updatedPacketBytes: Uint8Array; manifest: SigningPacketManifest }> {
    const inspection = await this.inspectPacket(packetPdfBytes);

    if (!inspection.isPacket || !inspection.manifest) {
      throw new Error('Not a valid signing packet document');
    }

    if (inspection.isTampered) {
      throw new Error(`Cannot sign a tampered document: ${inspection.tamperReason}`);
    }

    if (inspection.isCompleted) {
      throw new Error('Cannot sign: This signing packet is already completed and finalized.');
    }

    const manifest = inspection.manifest;
    const signerIndex = manifest.signers.findIndex(s => s.id === signerId);

    if (signerIndex < 0) {
      throw new Error(`Signer "${signerId}" is not part of this packet`);
    }

    const signer = manifest.signers[signerIndex];

    if (signer.status === 'signed') {
      throw new Error(`Signer "${signer.name}" has already signed this document`);
    }

    if (signer.status === 'declined') {
      throw new Error(`Signer "${signer.name}" has declined this document`);
    }

    // Enforce Sequential Workflow Rule
    if (manifest.workflowMode === 'sequential') {
      const priorPending = manifest.signers.find(
        s => s.orderIndex < signer.orderIndex && s.status !== 'signed'
      );
      if (priorPending) {
        throw new Error(
          `Sequential rule: "${priorPending.name}" (Step ${priorPending.orderIndex}) must sign before "${signer.name}" (Step ${signer.orderIndex})`
        );
      }
    }

    // Strict Field Access Control / Privilege Escalation Guard
    const unauthorizedKeys = Object.keys(fieldData).filter(
      fid => !signer.assignedFieldIds.includes(fid)
    );
    if (unauthorizedKeys.length > 0) {
      throw new Error(
        `Privilege escalation rejected: Signer "${signer.name}" is not authorized to fill or modify field(s): ${unauthorizedKeys.join(', ')}`
      );
    }

    const pdfDoc = await PDFDocument.load(packetPdfBytes, { ignoreEncryption: true });
    let form: any;
    try {
      form = pdfDoc.getForm();
    } catch {
      // no acroform
    }

    // Fill assigned fields & burn in signatures
    for (const fieldId of signer.assignedFieldIds) {
      const data = fieldData[fieldId];

      if (form) {
        try {
          const field = form.getField(fieldId);
          if (field) {
            if (data && data.value !== undefined) {
              if (typeof field.setText === 'function') {
                field.setText(String(data.value));
              } else if (typeof field.check === 'function') {
                if (data.value === 'true' || (data.value as any) === true) field.check();
                else field.uncheck();
              }
            }

            // Lock field as read-only once signed
            if (typeof field.enableReadOnly === 'function') {
              field.enableReadOnly();
            }
          }
        } catch {
          // Field not found or not AcroForm
        }
      }

      // Burn in signature graphic if provided
      if (data && data.signatureDataUrl && data.signatureDataUrl.startsWith('data:image')) {
        await this.burnInSignatureGraphic(pdfDoc, data.signatureDataUrl, fieldId);
      }
    }

    // Mark current signer as 'signed'
    const now = new Date().toISOString();
    signer.status = 'signed';
    signer.signedAt = now;

    // Update Audit Trail
    manifest.auditTrail.push({
      timestamp: now,
      signerId: signer.id,
      signerName: signer.name,
      action: 'signed',
      details: `Signed ${signer.assignedFieldIds.length} assigned field(s)`
    });

    // Check if packet completed
    const allSigned = manifest.signers.every(s => s.status === 'signed');
    if (allSigned) {
      manifest.auditTrail.push({
        timestamp: now,
        signerId: 'system',
        signerName: 'Workflow Engine',
        action: 'packet_completed',
        details: 'All signers completed signing workflow'
      });
    }

    manifest.updatedAt = now;

    // Update Expected Integrity Token
    manifest.expectedIntegrityToken = await this.computeIntegrityToken(
      pdfDoc,
      manifest.baseDocumentHash,
      manifest.signers
    );

    // Re-embed updated manifest
    await this.embedManifestInDoc(pdfDoc, manifest);

    const updatedPacketBytes = await pdfDoc.save();
    return { updatedPacketBytes, manifest };
  }

  // ==========================================
  // 5. Embedded Attachment Read / Write Helpers
  // ==========================================

  extractManifestFromDoc(doc: PDFDocument): SigningPacketManifest | null {
    try {
      const catalog = doc.catalog;
      if (!catalog.has(PDFName.of('Names'))) return null;

      const namesDict = doc.context.lookup(catalog.get(PDFName.of('Names')));
      if (!(namesDict instanceof PDFDict)) return null;

      if (!namesDict.has(PDFName.of('EmbeddedFiles'))) return null;
      const efTree = doc.context.lookup(namesDict.get(PDFName.of('EmbeddedFiles')));
      if (!(efTree instanceof PDFDict)) return null;

      return this.findManifestInNameTree(efTree, doc);
    } catch (e) {
      console.warn('Error reading manifest attachment:', e);
      return null;
    }
  }

  private findManifestInNameTree(treeDict: PDFDict, doc: PDFDocument): SigningPacketManifest | null {
    if (treeDict.has(PDFName.of('Names'))) {
      const namesArray = doc.context.lookup(treeDict.get(PDFName.of('Names')));
      if (namesArray instanceof PDFArray) {
        // Traverse backwards to pick latest manifest if multiple exist
        for (let i = namesArray.size() - 2; i >= 0; i -= 2) {
          const valRef = namesArray.get(i + 1);
          const valDict = doc.context.lookup(valRef);
          if (valDict instanceof PDFDict) {
            const manifest = this.parseFileSpecForManifest(valDict, doc);
            if (manifest) return manifest;
          }
        }
      }
    }

    if (treeDict.has(PDFName.of('Kids'))) {
      const kids = doc.context.lookup(treeDict.get(PDFName.of('Kids')));
      if (kids instanceof PDFArray) {
        for (let i = kids.size() - 1; i >= 0; i--) {
          const kid = doc.context.lookup(kids.get(i));
          if (kid instanceof PDFDict) {
            const found = this.findManifestInNameTree(kid, doc);
            if (found) return found;
          }
        }
      }
    }

    return null;
  }

  private parseFileSpecForManifest(fsDict: PDFDict, doc: PDFDocument): SigningPacketManifest | null {
    const fObj = (fsDict.get(PDFName.of('UF')) || fsDict.get(PDFName.of('F'))) as any;
    if (!fObj) return null;

    const nameStr = typeof fObj.decodeText === 'function'
      ? fObj.decodeText()
      : typeof fObj.asString === 'function'
      ? fObj.asString()
      : fObj.toString();

    if (!nameStr || !nameStr.includes(MANIFEST_ATTACHMENT_NAME)) {
      return null;
    }

    const ef = fsDict.get(PDFName.of('EF'));
    if (!ef) return null;

    const efDict = doc.context.lookup(ef);
    if (!(efDict instanceof PDFDict)) return null;

    const streamRef = efDict.get(PDFName.of('F')) || efDict.get(PDFName.of('UF'));
    if (!streamRef) return null;

    const stream = doc.context.lookup(streamRef);
    if (!(stream instanceof PDFStream) && !(stream instanceof PDFRawStream)) {
      return null;
    }

    let rawData: Uint8Array;
    try {
      const filter = stream.dict.get(PDFName.of('Filter'));
      const filterStr = String(filter);
      const isFlate =
        filter === PDFName.of('FlateDecode') ||
        (filter instanceof PDFArray && filter.asArray().some(f => f === PDFName.of('FlateDecode'))) ||
        filterStr.includes('FlateDecode');

      if (isFlate) {
        const decoded = decodePDFRawStream(stream as any);
        if (typeof (decoded as any).getBytes === 'function') {
          rawData = (decoded as any).getBytes();
        } else {
          rawData = new Uint8Array(stream.getContents());
        }
      } else {
        rawData = new Uint8Array(stream.getContents());
      }
    } catch {
      rawData = new Uint8Array(stream.getContents());
    }

    try {
      const jsonStr = new TextDecoder().decode(rawData);
      return JSON.parse(jsonStr) as SigningPacketManifest;
    } catch {
      return null;
    }
  }

  async embedManifestInDoc(doc: PDFDocument, manifest: SigningPacketManifest): Promise<void> {
    const manifestJson = JSON.stringify(manifest, null, 2);

    // Clean up any existing manifest entry before attaching new version
    try {
      const catalog = doc.catalog;
      if (catalog.has(PDFName.of('Names'))) {
        const namesDict = doc.context.lookup(catalog.get(PDFName.of('Names')));
        if (namesDict instanceof PDFDict && namesDict.has(PDFName.of('EmbeddedFiles'))) {
          const efTree = doc.context.lookup(namesDict.get(PDFName.of('EmbeddedFiles')));
          if (efTree instanceof PDFDict && efTree.has(PDFName.of('Names'))) {
            const namesArray = doc.context.lookup(efTree.get(PDFName.of('Names')));
            if (namesArray instanceof PDFArray) {
              for (let i = namesArray.size() - 2; i >= 0; i -= 2) {
                const key = namesArray.get(i) as any;
                const keyStr = typeof key?.decodeText === 'function'
                  ? key.decodeText()
                  : typeof key?.asString === 'function'
                  ? key.asString()
                  : key?.toString();

                if (keyStr && keyStr.includes(MANIFEST_ATTACHMENT_NAME)) {
                  namesArray.remove(i + 1);
                  namesArray.remove(i);
                }
              }
            }
          }
        }
      }
    } catch {
      // Best-effort cleanup
    }

    // Use base64 data URI to prevent cross-realm instanceof issues in Vitest/JSDOM
    let base64: string;
    if (typeof Buffer !== 'undefined') {
      base64 = Buffer.from(manifestJson, 'utf-8').toString('base64');
    } else {
      base64 = btoa(unescape(encodeURIComponent(manifestJson)));
    }
    const dataUri = `data:application/json;base64,${base64}`;

    // Attach as embedded file attachment
    await doc.attach(dataUri, MANIFEST_ATTACHMENT_NAME, {
      mimeType: 'application/json',
      description: 'On-device multi-party signing workflow manifest',
      creationDate: new Date(manifest.createdAt),
      modificationDate: new Date(manifest.updatedAt)
    });
  }

  private async burnInSignatureGraphic(
    doc: PDFDocument,
    dataUrl: string,
    fieldId: string
  ): Promise<void> {
    try {
      const base64Data = dataUrl.split(',')[1];
      if (!base64Data) return;

      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const img = await doc.embedPng(bytes);

      // Check if AcroForm field has widgets
      const form = doc.getForm();
      const field = form.getField(fieldId);
      if (field) {
        const widgets = (field as any).acroField?.getWidgets?.() || [];
        for (const widget of widgets) {
          const rect = widget.getRectangle();
          const pRef = widget.P();
          let page = doc.getPages()[0];
          if (pRef) {
            const foundPage = doc.getPages().find(p => p.ref === pRef);
            if (foundPage) page = foundPage;
          }

          page.drawImage(img, {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          });
        }
      }
    } catch (e) {
      console.warn(`Could not burn in signature graphic for field ${fieldId}:`, e);
    }
  }
}
