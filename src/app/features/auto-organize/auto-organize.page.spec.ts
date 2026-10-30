import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAngularResources } from '../../../test-setup';
import { AutoOrganizePage } from './auto-organize.page';
import { DocumentClassifierService } from '../../core/services/document-classifier.service';
import { ToastService } from '../../core/services/toast.service';
import { DocumentOrganizationProposal } from '../../core/models/document-classifier.types';

describe('AutoOrganizePage (P5 — UI & Interactions)', () => {
  let component: AutoOrganizePage;
  let fixture: ComponentFixture<AutoOrganizePage>;

  const mockProposals: DocumentOrganizationProposal[] = [
    {
      id: 'prop-1',
      originalFileName: 'Electricity_Bill_Raw.pdf',
      fileSizeBytes: 1024 * 45,
      pageCount: 1,
      classification: {
        category: 'Utility Bill',
        confidence: 90,
        matchedSignals: ['Utility Bill: "electricity bill"']
      },
      tags: ['Electricity', 'October 2026', 'Paid'],
      proposedFileName: 'UtilityBill_PowerCorp_2026-10.pdf',
      approvalStatus: 'pending'
    },
    {
      id: 'prop-2',
      originalFileName: 'Store_Receipt_IMG.pdf',
      fileSizeBytes: 1024 * 30,
      pageCount: 1,
      classification: {
        category: 'Receipt',
        confidence: 85,
        matchedSignals: ['Receipt: "subtotal"']
      },
      tags: ['Receipt', 'Store', 'Paid'],
      proposedFileName: 'Receipt_MetroMart_2026-10-28.pdf',
      approvalStatus: 'pending'
    }
  ];

  let mockClassifierService: {
    scanHistoryVault: ReturnType<typeof vi.fn>;
    proposeBatchFromFiles: ReturnType<typeof vi.fn>;
    applyBatchOrganization: ReturnType<typeof vi.fn>;
  };

  let mockToastService: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    await resolveAngularResources();

    mockClassifierService = {
      scanHistoryVault: vi.fn().mockResolvedValue([...mockProposals.map(p => ({ ...p }))]),
      proposeBatchFromFiles: vi.fn().mockResolvedValue([]),
      applyBatchOrganization: vi.fn().mockResolvedValue([
        {
          id: 'prop-1',
          originalFileName: 'Electricity_Bill_Raw.pdf',
          finalFileName: 'UtilityBill_PowerCorp_2026-10.pdf',
          tags: ['Electricity', 'October 2026', 'Paid'],
          category: 'Utility Bill',
          status: 'renamed',
          savedUri: 'file:///saved/UtilityBill_PowerCorp_2026-10.pdf'
        }
      ])
    };

    mockToastService = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [AutoOrganizePage],
      providers: [
        { provide: DocumentClassifierService, useValue: mockClassifierService },
        { provide: ToastService, useValue: mockToastService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AutoOrganizePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component and load batch proposals from vault', async () => {
    expect(component).toBeTruthy();
    await fixture.whenStable();
    expect(mockClassifierService.scanHistoryVault).toHaveBeenCalled();
    expect(component.proposals.length).toBe(2);
    expect(component.pendingCount).toBe(2);
    expect(component.approvedCount).toBe(0);
  });

  it('should approve and reject individual proposals', () => {
    component.approve(component.proposals[0]);
    expect(component.proposals[0].approvalStatus).toBe('approved');
    expect(component.approvedCount).toBe(1);

    component.reject(component.proposals[1]);
    expect(component.proposals[1].approvalStatus).toBe('rejected');
  });

  it('should support bulk actions: approveAll and rejectAll', () => {
    component.approveAll();
    expect(component.approvedCount).toBe(2);
    expect(component.proposals.every(p => p.approvalStatus === 'approved')).toBe(true);

    component.rejectAll();
    expect(component.approvedCount).toBe(0);
    expect(component.proposals.every(p => p.approvalStatus === 'rejected')).toBe(true);
  });

  it('should add and remove semantic tags dynamically', () => {
    const proposal = component.proposals[0];
    const initialTagCount = proposal.tags.length;

    // Remove first tag
    component.removeTag(proposal, 0);
    expect(proposal.tags.length).toBe(initialTagCount - 1);

    // Add a custom tag
    component.newTagInputs[proposal.id] = 'UrgentReview';
    component.addTag(proposal);
    expect(proposal.tags).toContain('UrgentReview');
    expect(component.newTagInputs[proposal.id]).toBe('');
  });

  it('should trigger approval on swipe right and rejection on swipe left', () => {
    const proposal = component.proposals[0];

    // Simulate Swipe Right (startX = 100, endX = 220 -> deltaX = +120 > 50)
    component.onTouchStart({
      touches: [{ clientX: 100, clientY: 150 }]
    } as any);

    component.onTouchEnd({
      changedTouches: [{ clientX: 220, clientY: 150 }]
    } as any, proposal);

    expect(proposal.approvalStatus).toBe('approved');

    // Simulate Swipe Left (startX = 200, endX = 80 -> deltaX = -120 < -50)
    component.onTouchStart({
      touches: [{ clientX: 200, clientY: 150 }]
    } as any);

    component.onTouchEnd({
      changedTouches: [{ clientX: 80, clientY: 150 }]
    } as any, proposal);

    expect(proposal.approvalStatus).toBe('rejected');
  });

  it('should apply organization changes only for approved proposals', async () => {
    // 0 approved proposals -> warning toast
    await component.applyOrganization();
    expect(mockToastService.warning).toHaveBeenCalled();
    expect(mockClassifierService.applyBatchOrganization).not.toHaveBeenCalled();

    // Approve proposal 0
    component.approve(component.proposals[0]);
    await component.applyOrganization();

    expect(mockClassifierService.applyBatchOrganization).toHaveBeenCalledWith(component.proposals);
    expect(mockToastService.success).toHaveBeenCalledWith(expect.stringContaining('Successfully organized 1 document'));
  });
});
