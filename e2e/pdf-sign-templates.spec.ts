import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('Signature Appearance Templates & Calligraphy Engine (M4) E2E @sign @templates', () => {
  const samplePdfPath = path.resolve(__dirname, 'test-data/phase2/hf-1page-portrait.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    page.on('console', msg => {
      // Filter out noisy debug logs if needed
      if (msg.type() === 'error') {
        console.error(`[Browser Error]: ${msg.text()}`);
      }
    });
  });

  test('M4-001: Tab switching [Draw] [Type] [Upload] [Templates], font & color selection, and live paper mockup rendering', async ({ page }) => {
    // 1. Navigate to signature studio templates route
    await page.goto('/features/pdf/sign/templates');
    await page.waitForLoadState('domcontentloaded');

    // Verify studio header and preview are visible
    const previewImg = page.locator('.stamp-preview-img');
    await expect(previewImg).toBeVisible({ timeout: 10000 });

    // Verify we start on [Type] tab
    const typeTabBtn = page.locator('.tab-pill', { hasText: 'Type' });
    await expect(typeTabBtn).toHaveClass(/active/);

    // 2. Switch to [Draw] tab
    const drawTabBtn = page.locator('.tab-pill', { hasText: 'Draw' });
    await drawTabBtn.click();
    await expect(drawTabBtn).toHaveClass(/active/);

    const drawCanvas = page.locator('.signature-canvas');
    await expect(drawCanvas).toBeVisible();

    // Draw on the canvas
    const box = await drawCanvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 30, box.y + 30);
      await page.mouse.down();
      await page.mouse.move(box.x + 100, box.y + 60);
      await page.mouse.move(box.x + 160, box.y + 40);
      await page.mouse.up();
    }

    // Clear canvas
    const clearBtn = page.locator('.clear-pad-btn');
    await clearBtn.click();

    // 3. Switch to [Upload] tab
    const uploadTabBtn = page.locator('.tab-pill', { hasText: 'Upload' });
    await uploadTabBtn.click();
    await expect(uploadTabBtn).toHaveClass(/active/);
    await expect(page.locator('.upload-box')).toBeVisible();

    // 4. Switch back to [Type] tab and test calligraphy font selection
    await typeTabBtn.click();
    await expect(typeTabBtn).toHaveClass(/active/);

    // Type a signer name
    const signerInput = page.locator('#signerNameInput');
    await signerInput.fill('Dr. Jane Doe-Smith');

    // Select 'Dancing Script' font card
    const dancingScriptCard = page.locator('.font-preview-card', { hasText: 'Dancing Script' });
    await dancingScriptCard.click();
    await expect(dancingScriptCard).toHaveClass(/active/);

    // Select Ink Color (Royal Navy #0a2540)
    const colorBubbles = page.locator('.color-bubble');
    await expect(colorBubbles).toHaveCount(5);
    await colorBubbles.nth(2).click(); // 3rd color is Royal Navy
    await expect(colorBubbles.nth(2)).toHaveClass(/active/);

    // Verify live stamp preview updated
    await expect(previewImg).toBeVisible();
  });

  test('M4-002: Metadata toggles, layout presets, template persistence, and navigation to PDF sign', async ({ page }) => {
    await page.goto('/features/pdf/sign/templates');
    await page.waitForLoadState('domcontentloaded');

    // Switch to [Templates] tab to configure metadata & layout presets
    const templatesTabBtn = page.locator('.tab-pill', { hasText: 'Templates' });
    await templatesTabBtn.click();
    await expect(templatesTabBtn).toHaveClass(/active/);

    // 1. Change Layout Preset to 'Formal Seal'
    const sealPresetBtn = page.locator('.layout-preset-btn', { hasText: 'Formal Seal' });
    await sealPresetBtn.click();
    await expect(sealPresetBtn).toHaveClass(/active/);

    // Verify badge in preview card shows 'formal-seal'
    await expect(page.locator('.paper-header-hint app-badge')).toContainText('formal-seal');

    // 2. Fill in Signer Details
    const nameInput = page.locator('#tmplFullName');
    await nameInput.fill('Dr. Jane Doe-Smith');

    const roleInput = page.locator('#tmplRole');
    await roleInput.fill('Chief Medical Officer');

    const orgInput = page.locator('#tmplOrg');
    await orgInput.fill('Apollo Healthcare');

    // 3. Toggle Metadata switches: Reason preset
    const reasonInput = page.locator('.nested-input-wrap input.studio-text-input').first();
    const approvedPreset = page.locator('.preset-chip', { hasText: 'Approved' });
    if (await approvedPreset.isVisible()) {
      await approvedPreset.click();
      await expect(reasonInput).toHaveValue('Approved');
    }

    // 4. Save template
    const saveBtn = page.locator('[data-testid="save-template-btn"]');
    await saveBtn.click();

    // Verify saved template chip appears in the list
    const savedChip = page.locator('.saved-template-chip');
    await expect(savedChip.first()).toBeVisible({ timeout: 5000 });

    // 5. Click 'Use on PDF' and verify navigation
    const useOnPdfBtn = page.locator('[data-testid="use-signature-pdf-btn"]');
    await useOnPdfBtn.click();

    // Should navigate to /features/pdf/sign
    await expect(page).toHaveURL(/\/features\/pdf\/sign/);
  });
});
