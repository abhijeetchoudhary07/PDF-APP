import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('P4 Local Multi-Document Q&A Engine @multi-doc-qa @p4', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('P4-001 to P4-008: Comprehensive Multi-Doc Ingestion, Dual Citations, Scope Toggle, Zero Hallucination & Export', async ({ page }) => {
    // 1. Navigate to /features/pdf/intelligence/multi-qa
    await page.goto('/features/pdf/intelligence/multi-qa');
    await page.waitForLoadState('domcontentloaded');

    // Verify Title & Empty State
    const pageTitle = page.locator('.page-title');
    await expect(pageTitle).toBeVisible();
    await expect(pageTitle).toContainText('Multi-Document Q&A');

    const emptyState = page.locator('.empty-state-card');
    await expect(emptyState).toBeVisible();

    // 2. Ingest 3 Distinct Real PDF Documents: HR Policy, Technical Manual, Financial Report
    const hrPolicyPath = path.resolve('e2e/test-data/multi-qa/hr-policy-2026.pdf');
    const techManualPath = path.resolve('e2e/test-data/multi-qa/technical-manual.pdf');
    const finReportPath = path.resolve('e2e/test-data/multi-qa/financial-report.pdf');

    expect(fs.existsSync(hrPolicyPath)).toBe(true);
    expect(fs.existsSync(techManualPath)).toBe(true);
    expect(fs.existsSync(finReportPath)).toBe(true);

    const fileInput = page.locator('input.hidden-file-input');
    await fileInput.setInputFiles([hrPolicyPath, techManualPath, finReportPath]);

    // 3. Verify Document Scope Carousel
    const docChips = page.locator('.carousel-track .doc-chip');
    await expect(docChips).toHaveCount(3, { timeout: 10000 });

    const scopeCounter = page.locator('.scope-counter');
    await expect(scopeCounter).toContainText('3 of 3 active');

    // Check specific file chip labels and page badges
    const hrChip = docChips.filter({ hasText: 'hr-policy-2026.pdf' });
    await expect(hrChip).toBeVisible();
    await expect(hrChip.locator('.doc-pages')).toContainText('2p');

    const techChip = docChips.filter({ hasText: 'technical-manual.pdf' });
    await expect(techChip).toBeVisible();
    await expect(techChip.locator('.doc-pages')).toContainText('1p');

    const finChip = docChips.filter({ hasText: 'financial-report.pdf' });
    await expect(finChip).toBeVisible();
    await expect(finChip.locator('.doc-pages')).toContainText('1p');

    // 4. Query Document 1: HR Policy (Paternity Leave)
    const questionInput = page.locator('input.question-input');
    const sendBtn = page.locator('button.btn-send');

    await questionInput.fill('What is the paternity leave policy?');
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Verify Grounded Assistant Answer
    const assistantCards = page.locator('.assistant-card');
    await expect(assistantCards).toHaveCount(1, { timeout: 8000 });

    const firstAnswer = assistantCards.first();
    await expect(firstAnswer.locator('.answer-text')).toContainText('15 days of paid paternity leave');

    // Verify Dual Citation Attribution: [hr-policy-2026.pdf, Page 1]
    const citationBadges = firstAnswer.locator('.citation-badge');
    await expect(citationBadges.first()).toBeVisible();
    await expect(citationBadges.first().locator('.citation-ref')).toContainText('[hr-policy-2026.pdf, Page 1]');
    await expect(citationBadges.first().locator('.citation-match')).toContainText('% Match');

    // 5. Interactive Citation Preview Modal
    await citationBadges.first().click();
    const modal = page.locator('.citation-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal-doc-name')).toContainText('hr-policy-2026.pdf');
    await expect(modal.locator('.modal-page-tag')).toContainText('Page 1');
    await expect(modal.locator('.excerpt-box')).toContainText('15 days of paid paternity leave');
    await expect(modal.locator('.badge-confidence')).toContainText('Confidence:');

    // Close preview modal
    const closeBtn = modal.locator('.btn-modal-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // 6. Query Document 2: Technical Manual (Port 8443)
    await questionInput.fill('What secure port does Kubernetes ingress listen on?');
    await sendBtn.click();

    await expect(assistantCards).toHaveCount(2, { timeout: 8000 });
    const secondAnswer = assistantCards.nth(1);
    await expect(secondAnswer.locator('.answer-text')).toContainText('port 8443');
    await expect(secondAnswer.locator('.citation-badge').first().locator('.citation-ref')).toContainText('[technical-manual.pdf, Page 1]');

    // 7. Query Document 3: Financial Report (EBITDA growth)
    await questionInput.fill('What is the EBITDA growth percentage in Q3?');
    await sendBtn.click();

    await expect(assistantCards).toHaveCount(3, { timeout: 8000 });
    const thirdAnswer = assistantCards.nth(2);
    await expect(thirdAnswer.locator('.answer-text')).toContainText('24.5 percent');
    await expect(thirdAnswer.locator('.citation-badge').first().locator('.citation-ref')).toContainText('[financial-report.pdf, Page 1]');

    // 8. Scope Toggle: Exclude hr-policy-2026.pdf
    // Click checkbox or chip of hr-policy-2026.pdf to toggle off
    const hrCheckbox = hrChip.locator('input.chip-checkbox');
    await hrCheckbox.click();

    await expect(scopeCounter).toContainText('2 of 3 active');

    // Now query for something only in hr-policy-2026.pdf (hospitalization reimbursement)
    await questionInput.fill('What is the hospitalization reimbursement cap?');
    await sendBtn.click();

    await expect(assistantCards).toHaveCount(4, { timeout: 8000 });
    const fourthAnswer = assistantCards.nth(3);
    // Because hr-policy is out of scope, it must return unanswerable state and NEVER hallucinate
    await expect(fourthAnswer.locator('.answer-text')).toContainText('No relevant information found in the selected documents');
    await expect(fourthAnswer.locator('.citation-badge')).toHaveCount(0);

    // Re-enable hr-policy-2026.pdf
    await hrCheckbox.click();
    await expect(scopeCounter).toContainText('3 of 3 active');

    // 9. Completely Absent Query: Zero Hallucination Test
    await questionInput.fill('interstellar warp drive antimatter propulsion system');
    await sendBtn.click();

    await expect(assistantCards).toHaveCount(5, { timeout: 8000 });
    const fifthAnswer = assistantCards.nth(4);
    await expect(fifthAnswer.locator('.answer-text')).toContainText('No relevant information found in the selected documents');
    await expect(fifthAnswer.locator('.citation-badge')).toHaveCount(0);

    // 10. Cybersecurity Stress: XSS injection attempt in user question
    const xssPayload = '<img src=x onerror=alert(document.domain)>';
    await questionInput.fill(xssPayload);
    await sendBtn.click();

    const userMessages = page.locator('.user-row .bubble-text');
    const lastUserBubble = userMessages.last();
    // Verify text is safely encoded in DOM and not executed as HTML
    await expect(lastUserBubble).toHaveText(xssPayload);

    // 11. Transcript Export (TXT and PDF)
    const exportTxtBtn = page.locator('button[aria-label="Export transcript as TXT"]');
    await expect(exportTxtBtn).toBeVisible();

    // Catch download event for TXT export
    const [txtDownload] = await Promise.all([
      page.waitForEvent('download'),
      exportTxtBtn.click()
    ]);
    expect(txtDownload.suggestedFilename()).toBe('multi-doc-qa-transcript.txt');

    // Catch download event for PDF export
    const exportPdfBtn = page.locator('button[aria-label="Export transcript as PDF"]');
    await expect(exportPdfBtn).toBeVisible();

    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      exportPdfBtn.click()
    ]);
    expect(pdfDownload.suggestedFilename()).toBe('multi-doc-qa-transcript.pdf');

    // Verify Success Toast notification
    const toast = page.locator('.toast-notification');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Exported');
  });
});
