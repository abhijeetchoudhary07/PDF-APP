import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('P5 Document Classifier & Content-Based Renamer @auto-organize @p5', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('P5-001 to P5-008: Batch Vault View, Swipe Gestures, Inline Edit, Tag Management & Organization Apply', async ({ page }) => {
    // 1. Navigate to /features/pdf/intelligence/organize
    await page.goto('/features/pdf/intelligence/organize');
    await page.waitForLoadState('domcontentloaded');

    // Verify Title
    const title = page.locator('.header-title');
    await expect(title).toBeVisible();
    await expect(title).toContainText('Auto-Organize & Classifier');

    // 2. Batch Vault Proposals Loaded
    const cards = page.locator('.review-card');
    await expect(cards).toHaveCount(5, { timeout: 10000 });

    const summaryBadge = page.locator('.status-summary-badge');
    await expect(summaryBadge).toBeVisible();
    await expect(summaryBadge).toContainText('0 of 5 Approved');

    // Verify initial categories on loaded vault cards
    const firstCard = cards.nth(0);
    await expect(firstCard.locator('.category-chip strong')).toContainText('Utility Bill');
    await expect(firstCard.locator('.status-badge')).toContainText('Pending Review');

    const secondCard = cards.nth(1);
    await expect(secondCard.locator('.category-chip strong')).toContainText('Invoice');

    const applyBtn = page.locator('button.apply-btn');
    // Initially disabled because 0 approved
    await expect(applyBtn).toBeDisabled();

    // 3. Swipe Gesture: Swipe Right on Card 1 to Approve
    // deltaX = 260 - 100 = 160 > 50
    await firstCard.evaluate((el) => {
      const touchStart = new Touch({
        identifier: 1,
        target: el,
        clientX: 100,
        clientY: 200
      });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [touchStart], bubbles: true }));

      const touchEnd = new Touch({
        identifier: 1,
        target: el,
        clientX: 260,
        clientY: 200
      });
      el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touchEnd], bubbles: true }));
    });

    await expect(firstCard.locator('.status-badge')).toContainText('Approved');
    await expect(firstCard).toHaveClass(/card-approved/);
    await expect(summaryBadge).toContainText('1 of 5 Approved');
    await expect(applyBtn).toBeEnabled();

    // 4. Swipe Gesture: Swipe Left on Card 2 to Reject
    // deltaX = 100 - 260 = -160 < -50
    await secondCard.evaluate((el) => {
      const touchStart = new Touch({
        identifier: 2,
        target: el,
        clientX: 260,
        clientY: 200
      });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [touchStart], bubbles: true }));

      const touchEnd = new Touch({
        identifier: 2,
        target: el,
        clientX: 100,
        clientY: 200
      });
      el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touchEnd], bubbles: true }));
    });

    await expect(secondCard.locator('.status-badge')).toContainText('Rejected');
    await expect(secondCard).toHaveClass(/card-rejected/);
    await expect(summaryBadge).toContainText('1 of 5 Approved');

    // 5. Inline Proposed Filename Editing on Card 1
    const filenameInput = firstCard.locator('input.filename-input');
    await filenameInput.fill('UtilityBill_HouseholdPower_2026-10.pdf');
    await expect(filenameInput).toHaveValue('UtilityBill_HouseholdPower_2026-10.pdf');

    // 6. Semantic Tag Management (Remove & Add)
    const initialTags = firstCard.locator('.tag-pill');
    const initialTagCount = await initialTags.count();
    expect(initialTagCount).toBeGreaterThanOrEqual(3);

    // Remove first tag via x button
    const removeBtn = initialTags.first().locator('.tag-remove-btn');
    await removeBtn.click();
    await expect(initialTags).toHaveCount(initialTagCount - 1);

    // Add custom tag
    const inlineTagInput = firstCard.locator('input.inline-tag-input');
    const addTagBtn = firstCard.locator('button.add-tag-btn');
    await inlineTagInput.fill('UrgentReview');
    await addTagBtn.click();

    const updatedTags = firstCard.locator('.tag-pill');
    await expect(updatedTags).toContainText(['UrgentReview']);

    // 7. Test Card Action Buttons (Direct Clicks)
    const thirdCard = cards.nth(2);
    const card3ApproveBtn = thirdCard.locator('button.approve-btn');
    const card3RejectBtn = thirdCard.locator('button.reject-btn');

    await card3ApproveBtn.click();
    await expect(thirdCard.locator('.status-badge')).toContainText('Approved');
    await expect(summaryBadge).toContainText('2 of 5 Approved');

    await card3RejectBtn.click();
    await expect(thirdCard.locator('.status-badge')).toContainText('Rejected');
    await expect(summaryBadge).toContainText('1 of 5 Approved');

    // 8. Bulk Actions (Approve All & Reject All)
    const approveAllBtn = page.locator('button.approve-all-pill');
    await approveAllBtn.click();
    await expect(summaryBadge).toContainText('5 of 5 Approved');

    const rejectAllBtn = page.locator('button.reject-all-pill');
    await rejectAllBtn.click();
    await expect(summaryBadge).toContainText('0 of 5 Approved');
    await expect(applyBtn).toBeDisabled();

    // Re-approve Card 1
    const card1ApproveBtn = firstCard.locator('button.approve-btn');
    await card1ApproveBtn.click();
    await expect(summaryBadge).toContainText('1 of 5 Approved');
    await expect(applyBtn).toBeEnabled();

    // 9. Apply Organization Changes
    await applyBtn.click();

    // Success toast notification verification
    const toast = page.locator('.toast, [role="alert"], .toast-message, .toast-notification');
    await expect(toast.first()).toBeVisible({ timeout: 6000 });
    await expect(toast.first()).toContainText('Successfully organized 1 document');

    // 10. File Ingestion & Real Document Proposal Generation
    const realPdfPath = path.resolve('e2e/test-data/multi-qa/hr-policy-2026.pdf');
    expect(fs.existsSync(realPdfPath)).toBe(true);

    const fileInput = page.locator('input.hidden-file-input').first();
    await fileInput.setInputFiles([realPdfPath]);

    // Cards count increases to 6
    await expect(cards).toHaveCount(6, { timeout: 10000 });
    const newlyAddedCard = cards.first();
    await expect(newlyAddedCard.locator('.doc-original-name')).toContainText('hr-policy-2026.pdf');
    await expect(newlyAddedCard.locator('.status-badge')).toContainText('Pending Review');
    await expect(newlyAddedCard.locator('input.filename-input')).toHaveValue(/.+\.pdf$/);

    // 11. Cybersecurity: Path Traversal Defenses in Proposed Filename
    const newCardNameInput = newlyAddedCard.locator('input.filename-input');
    await newCardNameInput.fill('../../../../etc/shadow.pdf');

    const newCardApproveBtn = newlyAddedCard.locator('button.approve-btn');
    await newCardApproveBtn.click();

    await applyBtn.click();
    await expect(toast.first()).toBeVisible({ timeout: 6000 });
  });
});
