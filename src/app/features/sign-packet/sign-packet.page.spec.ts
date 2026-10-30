import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { ChangeDetectorRef } from '@angular/core';

import { SignPacketPage } from './sign-packet.page';
import { PdfSigningPacketService } from '../../core/services/pdf-signing-packet.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import { ShareService } from '../../core/services/share.service';
import {
  PacketSigner,
  SigningPacketStatusReport,
  SigningPacketManifest
} from '../../core/models/signing-packet.types';

describe('SignPacketPage', () => {
  let page: SignPacketPage;
  let mockPacketService: any;
  let mockDocumentBridge: any;
  let mockShareService: any;
  let mockToastCtrl: any;
  let mockRouter: any;

  const sampleSigners: PacketSigner[] = [
    {
      id: 'signer-1',
      name: 'Alice Walker',
      emailOrPhone: 'alice@example.com',
      role: 'Reviewer',
      orderIndex: 1,
      assignedFieldIds: ['party1_name'],
      status: 'pending'
    },
    {
      id: 'signer-2',
      name: 'Bob Martin',
      emailOrPhone: 'bob@example.com',
      role: 'Approver',
      orderIndex: 2,
      assignedFieldIds: ['party2_name'],
      status: 'pending'
    }
  ];

  const sampleManifest: SigningPacketManifest = {
    manifestVersion: '1.0',
    packetId: 'pkt-test-123',
    title: 'Test Agreement',
    createdAt: '2026-10-28T10:00:00Z',
    updatedAt: '2026-10-28T10:00:00Z',
    workflowMode: 'sequential',
    baseDocumentHash: 'mock-base-hash',
    expectedIntegrityToken: 'mock-token',
    signers: sampleSigners,
    auditTrail: [
      {
        timestamp: '2026-10-28T10:00:00Z',
        signerId: 'system',
        signerName: 'Document Creator',
        action: 'packet_created'
      }
    ]
  };

  const sampleReport: SigningPacketStatusReport = {
    isPacket: true,
    isTampered: false,
    manifest: sampleManifest,
    totalSigners: 2,
    completedSigners: 0,
    pendingSigners: 2,
    currentSigner: sampleSigners[0],
    isCompleted: false,
    outstandingFieldIds: ['party1_name', 'party2_name']
  };

  beforeEach(() => {
    mockPacketService = {
      inspectPacket: vi.fn().mockResolvedValue({
        isPacket: false,
        isTampered: false,
        manifest: null,
        totalSigners: 0,
        completedSigners: 0,
        pendingSigners: 0,
        currentSigner: null,
        isCompleted: false,
        outstandingFieldIds: []
      }),
      createPacket: vi.fn().mockImplementation(async (bytes, title, signers, mode) => {
        return {
          packetBytes: new Uint8Array([1, 2, 3]),
          manifest: { ...sampleManifest, title, signers, workflowMode: mode }
        };
      }),
      signAsSigner: vi.fn().mockImplementation(async (bytes, signerId, data) => {
        const updatedSigners = sampleSigners.map(s =>
          s.id === signerId ? { ...s, status: 'signed' as const, signedAt: '2026-10-28T11:00:00Z' } : s
        );
        return {
          updatedPacketBytes: new Uint8Array([4, 5, 6]),
          manifest: { ...sampleManifest, signers: updatedSigners }
        };
      })
    };

    mockDocumentBridge = {
      consumeDocument: vi.fn().mockReturnValue(null)
    };

    mockShareService = {
      shareFile: vi.fn().mockResolvedValue(true)
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined)
      })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfSigningPacketService, useValue: mockPacketService },
        { provide: DocumentBridgeService, useValue: mockDocumentBridge },
        { provide: ShareService, useValue: mockShareService },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new SignPacketPage());
  });

  it('initializes in designer mode with sample document when no bridged doc', async () => {
    await page.ngOnInit();

    expect(page.activeMode).toBe('designer');
    expect(page.pdfBytes).toBeDefined();
    expect(page.detectedFieldIds.length).toBeGreaterThan(0);
    expect(page.signers.length).toBe(2);
  });

  it('automatically opens in signer mode when loaded document is a signing packet', async () => {
    mockPacketService.inspectPacket.mockResolvedValueOnce(sampleReport);

    await page.ngOnInit();

    expect(page.activeMode).toBe('signer');
    expect(page.packetTitle).toBe('Test Agreement');
    expect(page.activeSignerId).toBe('signer-1');
  });

  describe('Designer Operations', () => {
    beforeEach(async () => {
      await page.ngOnInit();
    });

    it('toggles workflow mode between sequential and parallel', () => {
      expect(page.workflowMode).toBe('sequential');
      page.setWorkflowMode('parallel');
      expect(page.workflowMode).toBe('parallel');
    });

    it('adds a new signer and assigns fields', () => {
      const initialCount = page.signers.length;
      page.openAddSignerModal();

      page.signerForm.name = 'Charlie Brown';
      page.signerForm.emailOrPhone = 'charlie@example.com';
      page.signerForm.role = 'Auditor';
      page.toggleAssignedField('party1_name');
      page.saveSigner();

      expect(page.signers.length).toBe(initialCount + 1);
      const added = page.signers[initialCount];
      expect(added.name).toBe('Charlie Brown');
      expect(added.role).toBe('Auditor');
      expect(added.assignedFieldIds).toContain('party1_name');
    });

    it('moves signer order in sequential mode', () => {
      const firstSigner = page.signers[0].name;
      const secondSigner = page.signers[1].name;

      page.moveSigner(0, 'down');

      expect(page.signers[0].name).toBe(secondSigner);
      expect(page.signers[1].name).toBe(firstSigner);
      expect(page.signers[0].orderIndex).toBe(1);
      expect(page.signers[1].orderIndex).toBe(2);
    });

    it('deletes a signer and re-indexes remaining signers', () => {
      page.deleteSigner(0);
      expect(page.signers.length).toBe(1);
      expect(page.signers[0].orderIndex).toBe(1);
    });

    it('generates packet and transitions to signer mode', async () => {
      mockPacketService.inspectPacket.mockResolvedValueOnce(sampleReport);
      const originalBytes = page.pdfBytes;

      await page.generatePacket();

      expect(mockPacketService.createPacket).toHaveBeenCalledWith(
        originalBytes,
        page.packetTitle,
        page.signers,
        page.workflowMode
      );
      expect(page.activeMode).toBe('signer');
    });
  });

  describe('Signer Execution Operations', () => {
    beforeEach(async () => {
      mockPacketService.inspectPacket.mockResolvedValue(sampleReport);
      await page.ngOnInit();
    });

    it('correctly resolves active signer and canCurrentSignerSign status', () => {
      expect(page.getActiveSigner()?.id).toBe('signer-1');
      expect(page.canCurrentSignerSign()).toBe(true);

      // Signer 2 cannot sign yet in sequential mode
      page.selectActiveSigner('signer-2');
      expect(page.canCurrentSignerSign()).toBe(false);
    });

    it('disallows signing if document is flagged as tampered', () => {
      page.statusReport = {
        ...sampleReport,
        isTampered: true,
        tamperReason: 'Document fields were altered'
      };

      expect(page.canCurrentSignerSign()).toBe(false);
    });

    it('executes sign pass for eligible signer and distributes updated packet', async () => {
      page.selectActiveSigner('signer-1');
      page.fieldData['party1_name'] = {
        fieldId: 'party1_name',
        value: 'Alice Walker',
        signatureDataUrl: 'data:image/png;base64,mock'
      };

      const originalBytes = page.pdfBytes;
      await page.executeSignPass();

      expect(mockPacketService.signAsSigner).toHaveBeenCalledWith(
        originalBytes,
        'signer-1',
        expect.objectContaining({
          party1_name: expect.objectContaining({
            value: 'Alice Walker',
            signatureDataUrl: 'data:image/png;base64,mock'
          })
        })
      );
      expect(mockShareService.shareFile).toHaveBeenCalled();
    });
  });

  describe('Distribution', () => {
    beforeEach(async () => {
      await page.ngOnInit();
    });

    it('shares current packet via ShareService', async () => {
      await page.shareCurrentPacket();
      expect(mockShareService.shareFile).toHaveBeenCalled();
    });
  });
});
