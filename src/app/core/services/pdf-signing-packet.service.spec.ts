import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import { PdfSigningPacketService } from './pdf-signing-packet.service';
import { PacketSigner } from '../models/signing-packet.types';

describe('PdfSigningPacketService', () => {
  let service: PdfSigningPacketService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.runInInjectionContext(() => new PdfSigningPacketService());
  });

  async function createBaseDocWithFields(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const form = doc.getForm();

    const tf1 = form.createTextField('signer1_name');
    tf1.addToPage(page, { x: 50, y: 700, width: 200, height: 28 });

    const tf2 = form.createTextField('signer2_name');
    tf2.addToPage(page, { x: 50, y: 600, width: 200, height: 28 });

    const cb = form.createCheckBox('signer1_agree');
    cb.addToPage(page, { x: 50, y: 550, width: 20, height: 20 });

    return await doc.save();
  }

  const sampleSigners: PacketSigner[] = [
    {
      id: 'signer-1',
      name: 'Alice Johnson',
      emailOrPhone: 'alice@example.com',
      role: 'Reviewer',
      orderIndex: 1,
      assignedFieldIds: ['signer1_name', 'signer1_agree'],
      status: 'pending'
    },
    {
      id: 'signer-2',
      name: 'Bob Smith',
      emailOrPhone: 'bob@example.com',
      role: 'Approver',
      orderIndex: 2,
      assignedFieldIds: ['signer2_name'],
      status: 'pending'
    }
  ];

  it('computes sha256 hash deterministically', async () => {
    const data = new TextEncoder().encode('Hello World');
    const hash = await service.computeSha256(data);
    expect(hash).toBe('a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e');
  });

  describe('createPacket', () => {
    it('creates a packet with embedded manifest and integrity token', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes, manifest } = await service.createPacket(
        basePdfBytes,
        'Employment Agreement',
        sampleSigners,
        'sequential'
      );

      expect(packetBytes).toBeDefined();
      expect(packetBytes.length).toBeGreaterThan(0);
      expect(manifest.title).toBe('Employment Agreement');
      expect(manifest.workflowMode).toBe('sequential');
      expect(manifest.signers.length).toBe(2);
      expect(manifest.signers[0].name).toBe('Alice Johnson');
      expect(manifest.signers[1].name).toBe('Bob Smith');
      expect(manifest.baseDocumentHash).toBeTruthy();
      expect(manifest.expectedIntegrityToken).toBeTruthy();
      expect(manifest.auditTrail.length).toBe(1);
      expect(manifest.auditTrail[0].action).toBe('packet_created');
    });
  });

  describe('inspectPacket', () => {
    it('returns isPacket: false for normal PDF without manifest', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const report = await service.inspectPacket(basePdfBytes);

      expect(report.isPacket).toBe(false);
      expect(report.isTampered).toBe(false);
      expect(report.manifest).toBeNull();
      expect(report.totalSigners).toBe(0);
    });

    it('correctly inspects a valid packet PDF', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Test NDA',
        sampleSigners,
        'sequential'
      );

      const report = await service.inspectPacket(packetBytes);

      expect(report.isPacket).toBe(true);
      expect(report.isTampered).toBe(false);
      expect(report.manifest?.title).toBe('Test NDA');
      expect(report.totalSigners).toBe(2);
      expect(report.completedSigners).toBe(0);
      expect(report.pendingSigners).toBe(2);
      expect(report.isCompleted).toBe(false);
      expect(report.currentSigner?.id).toBe('signer-1');
      expect(report.outstandingFieldIds).toEqual(['signer1_name', 'signer1_agree', 'signer2_name']);
    });

    it('detects tampering if document fields are changed outside workflow', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Tamper Test Doc',
        sampleSigners,
        'sequential'
      );

      // Modify the document form field maliciously
      const tamperedDoc = await PDFDocument.load(packetBytes);
      const form = tamperedDoc.getForm();
      const field = form.getTextField('signer1_name');
      field.setText('HACKED_VALUE');
      const tamperedBytes = await tamperedDoc.save();

      const report = await service.inspectPacket(tamperedBytes);
      expect(report.isPacket).toBe(true);
      expect(report.isTampered).toBe(true);
      expect(report.tamperReason).toContain('Document content or form fields were altered');
    });
  });

  describe('signAsSigner (Sequential Workflow)', () => {
    it('enforces sequential order: prevents Signer 2 from signing before Signer 1', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Order Enforcement',
        sampleSigners,
        'sequential'
      );

      await expect(
        service.signAsSigner(packetBytes, 'signer-2', {
          signer2_name: { fieldId: 'signer2_name', value: 'Bob Smith' }
        })
      ).rejects.toThrow(/Sequential rule: "Alice Johnson" \(Step 1\) must sign before "Bob Smith" \(Step 2\)/);
    });

    it('executes Signer 1 pass, fills and locks fields, and updates report', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes: step0Bytes } = await service.createPacket(
        basePdfBytes,
        'Order Pass',
        sampleSigners,
        'sequential'
      );

      // Signer 1 signs
      const { updatedPacketBytes: step1Bytes, manifest: step1Manifest } = await service.signAsSigner(
        step0Bytes,
        'signer-1',
        {
          signer1_name: { fieldId: 'signer1_name', value: 'Alice Johnson' },
          signer1_agree: { fieldId: 'signer1_agree', value: 'true' }
        }
      );

      expect(step1Manifest.signers[0].status).toBe('signed');
      expect(step1Manifest.signers[0].signedAt).toBeDefined();
      expect(step1Manifest.signers[1].status).toBe('pending');
      expect(step1Manifest.auditTrail.length).toBe(2);
      expect(step1Manifest.auditTrail[1].action).toBe('signed');
      expect(step1Manifest.auditTrail[1].signerId).toBe('signer-1');

      // Inspect step1 packet
      const report1 = await service.inspectPacket(step1Bytes);
      expect(report1.isTampered).toBe(false);
      expect(report1.completedSigners).toBe(1);
      expect(report1.pendingSigners).toBe(1);
      expect(report1.currentSigner?.id).toBe('signer-2');
      expect(report1.outstandingFieldIds).toEqual(['signer2_name']);

      // Check fields locked in PDF
      const doc1 = await PDFDocument.load(step1Bytes);
      const form1 = doc1.getForm();
      const tf1 = form1.getTextField('signer1_name');
      expect(tf1.getText()).toBe('Alice Johnson');
      expect(tf1.isReadOnly()).toBe(true);

      // Now Signer 2 can sign
      const { updatedPacketBytes: step2Bytes, manifest: step2Manifest } = await service.signAsSigner(
        step1Bytes,
        'signer-2',
        {
          signer2_name: { fieldId: 'signer2_name', value: 'Bob Smith' }
        }
      );

      expect(step2Manifest.signers[1].status).toBe('signed');
      expect(step2Manifest.auditTrail.length).toBe(4); // created, signed1, signed2, packet_completed
      expect(step2Manifest.auditTrail[3].action).toBe('packet_completed');

      const report2 = await service.inspectPacket(step2Bytes);
      expect(report2.isTampered).toBe(false);
      expect(report2.isCompleted).toBe(true);
      expect(report2.completedSigners).toBe(2);
      expect(report2.pendingSigners).toBe(0);
      expect(report2.currentSigner).toBeNull();
      expect(report2.outstandingFieldIds).toEqual([]);
    });

    it('prevents already signed signer from signing again', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Double Sign Test',
        sampleSigners,
        'sequential'
      );

      const { updatedPacketBytes } = await service.signAsSigner(packetBytes, 'signer-1', {
        signer1_name: { fieldId: 'signer1_name', value: 'Alice' }
      });

      await expect(
        service.signAsSigner(updatedPacketBytes, 'signer-1', {
          signer1_name: { fieldId: 'signer1_name', value: 'Alice Again' }
        })
      ).rejects.toThrow(/has already signed this document/);
    });
  });

  describe('signAsSigner (Parallel Workflow)', () => {
    it('allows Signer 2 to sign before Signer 1 when workflowMode is parallel', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Parallel Test',
        sampleSigners,
        'parallel'
      );

      // Signer 2 signs first
      const { updatedPacketBytes, manifest } = await service.signAsSigner(
        packetBytes,
        'signer-2',
        {
          signer2_name: { fieldId: 'signer2_name', value: 'Bob Smith' }
        }
      );

      expect(manifest.signers.find(s => s.id === 'signer-2')?.status).toBe('signed');
      expect(manifest.signers.find(s => s.id === 'signer-1')?.status).toBe('pending');

      const report = await service.inspectPacket(updatedPacketBytes);
      expect(report.isTampered).toBe(false);
      expect(report.completedSigners).toBe(1);
      expect(report.pendingSigners).toBe(1);
      expect(report.outstandingFieldIds).toEqual(['signer1_name', 'signer1_agree']);
    });
  });

  describe('error conditions', () => {
    it('throws error when attempting to sign a non-packet PDF', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      await expect(
        service.signAsSigner(basePdfBytes, 'signer-1', {})
      ).rejects.toThrow(/Not a valid signing packet document/);
    });

    it('throws error when signer does not belong to packet', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Unknown Signer Test',
        sampleSigners,
        'sequential'
      );

      await expect(
        service.signAsSigner(packetBytes, 'unknown-user', {})
      ).rejects.toThrow(/is not part of this packet/);
    });

    it('refuses to sign if packet is tampered', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Tampered Sign Test',
        sampleSigners,
        'sequential'
      );

      // Maliciously tamper with PDF
      const doc = await PDFDocument.load(packetBytes);
      doc.addPage([200, 200]);
      const tamperedBytes = await doc.save();

      await expect(
        service.signAsSigner(tamperedBytes, 'signer-1', {})
      ).rejects.toThrow(/Cannot sign a tampered document/);
    });
  });

  describe('3-Signer Sequential Workflow & Completed Packet Verification', () => {
    async function create3SignerDoc(): Promise<{ pdfBytes: Uint8Array; signers: PacketSigner[] }> {
      const doc = await PDFDocument.create();
      const page = doc.addPage([600, 800]);
      const form = doc.getForm();

      const f1 = form.createTextField('field_party_1');
      f1.addToPage(page, { x: 50, y: 700, width: 200, height: 28 });

      const f2 = form.createTextField('field_party_2');
      f2.addToPage(page, { x: 50, y: 600, width: 200, height: 28 });

      const f3 = form.createTextField('field_party_3');
      f3.addToPage(page, { x: 50, y: 500, width: 200, height: 28 });

      const signers: PacketSigner[] = [
        {
          id: 'signer-1',
          name: 'Signer One',
          emailOrPhone: 's1@example.com',
          role: 'Preparer',
          orderIndex: 1,
          assignedFieldIds: ['field_party_1'],
          status: 'pending'
        },
        {
          id: 'signer-2',
          name: 'Signer Two',
          emailOrPhone: 's2@example.com',
          role: 'Reviewer',
          orderIndex: 2,
          assignedFieldIds: ['field_party_2'],
          status: 'pending'
        },
        {
          id: 'signer-3',
          name: 'Signer Three',
          emailOrPhone: 's3@example.com',
          role: 'Final Approver',
          orderIndex: 3,
          assignedFieldIds: ['field_party_3'],
          status: 'pending'
        }
      ];

      return { pdfBytes: await doc.save(), signers };
    }

    it('executes 3-signer sequential workflow: Signer 1 -> Signer 2 -> Signer 3 completes', async () => {
      const { pdfBytes, signers } = await create3SignerDoc();
      const { packetBytes: step0 } = await service.createPacket(pdfBytes, 'Tri-Party Contract', signers, 'sequential');

      // Step 1: Signer 1 signs
      const { updatedPacketBytes: step1 } = await service.signAsSigner(step0, 'signer-1', {
        field_party_1: { fieldId: 'field_party_1', value: 'Authorized by S1' }
      });
      const rep1 = await service.inspectPacket(step1);
      expect(rep1.completedSigners).toBe(1);
      expect(rep1.currentSigner?.id).toBe('signer-2');

      // Step 2: Signer 2 signs
      const { updatedPacketBytes: step2 } = await service.signAsSigner(step1, 'signer-2', {
        field_party_2: { fieldId: 'field_party_2', value: 'Reviewed by S2' }
      });
      const rep2 = await service.inspectPacket(step2);
      expect(rep2.completedSigners).toBe(2);
      expect(rep2.currentSigner?.id).toBe('signer-3');

      // Step 3: Signer 3 completes
      const { updatedPacketBytes: step3, manifest: manifest3 } = await service.signAsSigner(step2, 'signer-3', {
        field_party_3: { fieldId: 'field_party_3', value: 'Approved by S3' }
      });

      const rep3 = await service.inspectPacket(step3);
      expect(rep3.isCompleted).toBe(true);
      expect(rep3.completedSigners).toBe(3);
      expect(rep3.pendingSigners).toBe(0);
      expect(rep3.currentSigner).toBeNull();
      expect(rep3.outstandingFieldIds).toEqual([]);
      expect(manifest3.auditTrail.some(a => a.action === 'packet_completed')).toBe(true);
    });

    it('opens an already completed packet: verifies all fields locked read-only and disallows further signing', async () => {
      const { pdfBytes, signers } = await create3SignerDoc();
      const { packetBytes: step0 } = await service.createPacket(pdfBytes, 'Completed Verification', signers, 'sequential');

      const { updatedPacketBytes: s1 } = await service.signAsSigner(step0, 'signer-1', {
        field_party_1: { fieldId: 'field_party_1', value: 'V1' }
      });
      const { updatedPacketBytes: s2 } = await service.signAsSigner(s1, 'signer-2', {
        field_party_2: { fieldId: 'field_party_2', value: 'V2' }
      });
      const { updatedPacketBytes: completedBytes } = await service.signAsSigner(s2, 'signer-3', {
        field_party_3: { fieldId: 'field_party_3', value: 'V3' }
      });

      // Verify report
      const report = await service.inspectPacket(completedBytes);
      expect(report.isPacket).toBe(true);
      expect(report.isCompleted).toBe(true);
      expect(report.currentSigner).toBeNull();

      // Verify all AcroForm fields in the PDF are locked read-only
      const completedDoc = await PDFDocument.load(completedBytes);
      const form = completedDoc.getForm();
      expect(form.getTextField('field_party_1').isReadOnly()).toBe(true);
      expect(form.getTextField('field_party_2').isReadOnly()).toBe(true);
      expect(form.getTextField('field_party_3').isReadOnly()).toBe(true);

      // Attempting to sign again must be rejected
      await expect(
        service.signAsSigner(completedBytes, 'signer-1', {})
      ).rejects.toThrow(/already completed/i);
    });
  });

  describe('Cybersecurity Stress-Testing', () => {
    it('halts execution when page content stream is modified out-of-band', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Integrity Attack Doc',
        sampleSigners,
        'sequential'
      );

      // Modify the page text stream maliciously
      const tamperedDoc = await PDFDocument.load(packetBytes);
      const page = tamperedDoc.getPage(0);
      page.drawText('MALICIOUS_CLAUSE_INSERTED', { x: 50, y: 300, size: 14 });
      const tamperedBytes = await tamperedDoc.save();

      // Inspection detects content tampering
      const report = await service.inspectPacket(tamperedBytes);
      expect(report.isTampered).toBe(true);
      expect(report.tamperReason).toContain('Document content or form fields were altered');

      // Attempting to sign must halt with tamper alert
      await expect(
        service.signAsSigner(tamperedBytes, 'signer-1', {
          signer1_name: { fieldId: 'signer1_name', value: 'Alice' }
        })
      ).rejects.toThrow(/Cannot sign a tampered document/i);
    });

    it('rejects privilege escalation when Signer 1 attempts to sign Signer 2 fields', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Privilege Escalation Test',
        sampleSigners,
        'sequential'
      );

      // Signer 1 attempts to submit data for signer2_name (assigned exclusively to Signer 2)
      await expect(
        service.signAsSigner(packetBytes, 'signer-1', {
          signer1_name: { fieldId: 'signer1_name', value: 'Alice' },
          signer2_name: { fieldId: 'signer2_name', value: 'Forged Signer 2 Data' }
        })
      ).rejects.toThrow(/Privilege escalation rejected: Signer "Alice Johnson" is not authorized to fill or modify field\(s\): signer2_name/);
    });

    it('detects manifest spoofing when a fake manifest pre-marks signers as signed without audit trail', async () => {
      const basePdfBytes = await createBaseDocWithFields();
      const { packetBytes } = await service.createPacket(
        basePdfBytes,
        'Spoofing Test',
        sampleSigners,
        'sequential'
      );

      // Spoof the manifest: mark signer-2 as 'signed' without running workflow or generating audit trail
      const spoofDoc = await PDFDocument.load(packetBytes);
      const manifest = service.extractManifestFromDoc(spoofDoc);
      expect(manifest).toBeDefined();

      if (manifest) {
        manifest.signers[1].status = 'signed';
        manifest.signers[1].signedAt = new Date().toISOString();
        // Re-embed spoofed manifest
        await service.embedManifestInDoc(spoofDoc, manifest);
      }
      const spoofedBytes = await spoofDoc.save();

      const report = await service.inspectPacket(spoofedBytes);
      expect(report.isTampered).toBe(true);
      expect(report.tamperReason).toContain('Manifest spoofing detected');
    });
  });
});
