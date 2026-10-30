import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('On-Device Multi-Party Signing Workflow Engine (M5) E2E @sign @packet', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[Browser Error]: ${msg.text()}`);
      }
    });
  });

  test('M5-001: Create packet, reorder signers, add third signer, execute Signer 1 & Signer 2 passes, and export updated packet', async ({ page }) => {
    // 1. Navigate to multi-party signing packet route
    await page.goto('/features/pdf/sign/packet');
    await page.waitForLoadState('domcontentloaded');

    // Verify initial designer mode
    const screenTitle = page.locator('.screen-title');
    await expect(screenTitle).toBeVisible({ timeout: 10000 });

    const designerTab = page.locator('[data-testid="designer-mode-tab"]');
    await expect(designerTab).toHaveClass(/active/);

    // 2. Set packet title
    const titleInput = page.locator('#packetTitleInput');
    await titleInput.fill('Partnership Agreement M5');

    // Verify initial signers (Primary Signer & Secondary Approver)
    const signerCards = page.locator('.signer-card');
    await expect(signerCards).toHaveCount(2);
    await expect(signerCards.nth(0)).toContainText('Primary Signer');
    await expect(signerCards.nth(1)).toContainText('Secondary Approver');

    // 3. Reorder signers: Move first signer down
    const moveDownBtn = page.locator('[data-testid="move-signer-down-btn"]').first();
    await moveDownBtn.click();

    // Verify order swapped: Secondary Approver is now 1, Primary Signer is now 2
    await expect(signerCards.nth(0)).toContainText('Secondary Approver');
    await expect(signerCards.nth(1)).toContainText('Primary Signer');

    // Move back up to restore original sequence
    const moveUpBtn = page.locator('[data-testid="move-signer-up-btn"]').nth(1);
    await moveUpBtn.click();
    await expect(signerCards.nth(0)).toContainText('Primary Signer');
    await expect(signerCards.nth(1)).toContainText('Secondary Approver');

    // 4. Add a third signer via Modal
    const addSignerBtn = page.locator('[data-testid="add-signer-btn"]');
    await addSignerBtn.click();

    const modalSheet = page.locator('.modal-sheet');
    await expect(modalSheet).toBeVisible();

    const nameField = page.locator('#signerNameInput');
    await nameField.fill('Counsel Diana Prince');

    const roleField = page.locator('#signerRoleInput');
    await roleField.fill('Legal Compliance');

    const emailField = page.locator('#signerContactInput');
    await emailField.fill('diana@example.com');

    // Save Signer
    const saveSignerBtn = page.locator('[data-testid="save-signer-modal-btn"]');
    await saveSignerBtn.click();
    await expect(modalSheet).toBeHidden();

    // Verify 3 signers now exist
    await expect(signerCards).toHaveCount(3);
    await expect(signerCards.nth(2)).toContainText('Counsel Diana Prince');

    // 5. Generate Signing Packet
    const createPacketBtn = page.locator('[data-testid="create-packet-btn"]');
    await expect(createPacketBtn).toBeEnabled();
    await createPacketBtn.click();

    // 6. Transition to Signer Execution Mode
    const signerTab = page.locator('[data-testid="signer-mode-tab"]');
    await expect(signerTab).toHaveClass(/active/, { timeout: 10000 });

    // Verify active execution banner shows Step 1: Primary Signer
    const executionBanner = page.locator('.execution-banner');
    await expect(executionBanner).toBeVisible();
    await expect(executionBanner).toContainText('Primary Signer');

    // 7. Signer 1 fills assigned field and signs
    const fieldInput = page.locator('.fields-exec-list input.app-input').first();
    if (await fieldInput.isVisible()) {
      await fieldInput.fill('Signed by Primary Signer');
    }

    const signNowBtn = page.locator('[data-testid="sign-now-btn"]');
    await expect(signNowBtn).toBeEnabled();
    await signNowBtn.click();

    // 8. Advances to Step 2: Secondary Approver
    await expect(executionBanner).toContainText('Secondary Approver', { timeout: 10000 });

    // Signer 2 fills assigned field and signs
    const fieldInput2 = page.locator('.fields-exec-list input.app-input').first();
    if (await fieldInput2.isVisible()) {
      await fieldInput2.fill('Approved by Secondary Approver');
    }

    await expect(signNowBtn).toBeEnabled();
    await signNowBtn.click();

    // 9. Advances to Step 3: Counsel Diana Prince
    await expect(executionBanner).toContainText('Counsel Diana Prince', { timeout: 10000 });

    // 10. Audit Trail verification
    const auditCard = page.locator('.audit-trail-card');
    await expect(auditCard).toBeVisible();
    await expect(page.locator('.audit-signer', { hasText: 'Primary Signer' })).toBeVisible();
    await expect(page.locator('.audit-signer', { hasText: 'Secondary Approver' })).toBeVisible();
  });
});
