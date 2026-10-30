import { test, expect } from '@playwright/test';

test.describe('N8 — App Lock & Emergency Panic Clear E2E Suite', () => {

  test.beforeEach(async ({ page }) => {
    // Ensure onboarding is completed and lock config is fresh
    await page.goto('/features/settings/security-lock');
    await page.evaluate(async () => {
      localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
      localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
      localStorage.removeItem('CapacitorStorage.IFH_SECURITY_LOCK_CONFIG_V1');
      localStorage.removeItem('IFH_SECURITY_LOCK_CONFIG_V1');

      if ((window as any).Capacitor?.Plugins?.Preferences) {
        await (window as any).Capacitor.Plugins.Preferences.remove({
          key: 'IFH_SECURITY_LOCK_CONFIG_V1'
        });
        await (window as any).Capacitor.Plugins.Preferences.set({
          key: 'IFH_ONBOARDING_COMPLETED_V1',
          value: 'true'
        });
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('Default State: Lock is OFF by default, untouched launch flow', async ({ page }) => {
    await page.goto('/features/settings/security-lock');
    await page.waitForLoadState('networkidle');

    // Verify Default State
    const badge = page.locator('.hero-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Lock Disabled (Default)');

    const toggle = page.locator('[data-testid="toggle-app-lock"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toHaveClass(/on/);

    // Sub-settings should not be visible when disabled
    await expect(page.locator('.lock-sub-settings')).not.toBeVisible();
  });

  test('PIN Setup: Keypad entry, confirmation match, and activation badge', async ({ page }) => {
    await page.goto('/features/settings/security-lock');
    await page.waitForLoadState('networkidle');

    // 1. Click toggle to start PIN setup
    await page.locator('[data-testid="toggle-app-lock"]').click();

    const pinModal = page.locator('[data-testid="pin-modal-card"]');
    await expect(pinModal).toBeVisible();

    // Verify 4-dot indicators present
    const pinDots = page.locator('[data-testid="pin-dots-row"] .pin-dot');
    await expect(pinDots).toHaveCount(4);

    // 2. Enter 1-2-3-4
    await page.locator('[data-testid="keypad-btn-1"]').click();
    await page.locator('[data-testid="keypad-btn-2"]').click();
    await page.locator('[data-testid="keypad-btn-3"]').click();
    await page.locator('[data-testid="keypad-btn-4"]').click();

    // Modal advances to step 2 (Confirm PIN)
    await page.waitForTimeout(300);

    // 3. Confirm matching 1-2-3-4
    await page.locator('[data-testid="keypad-btn-1"]').click();
    await page.locator('[data-testid="keypad-btn-2"]').click();
    await page.locator('[data-testid="keypad-btn-3"]').click();
    await page.locator('[data-testid="keypad-btn-4"]').click();

    // Verify modal closes
    await expect(pinModal).not.toBeVisible({ timeout: 5000 });

    // Verify badge updates to Active
    const badge = page.locator('.hero-badge');
    await expect(badge).toContainText('Security Lock Active');
    await expect(page.locator('[data-testid="toggle-app-lock"]')).toHaveClass(/on/);

    // Sub-settings are now revealed
    await expect(page.locator('.lock-sub-settings')).toBeVisible();
  });

  test('Configurable Targets & Timeout: Switch targets, timeout pills and auto-cache toggle', async ({ page }) => {
    // Setup PIN first
    await page.goto('/features/settings/security-lock');
    await page.locator('[data-testid="toggle-app-lock"]').click();
    for (const d of ['1', '2', '3', '4']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await page.waitForTimeout(300);
    for (const d of ['1', '2', '3', '4']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await expect(page.locator('.lock-sub-settings')).toBeVisible({ timeout: 5000 });

    // 1. Switch to Lock Vault Only
    const vaultTargetBtn = page.locator('[data-testid="target-btn-vault"]');
    await vaultTargetBtn.click();
    await expect(vaultTargetBtn).toHaveClass(/selected/);

    // 2. Switch timeout to 1min
    const timeout1min = page.locator('[data-testid="timeout-btn-1min"]');
    await timeout1min.click();
    await expect(timeout1min).toHaveClass(/active/);

    // 3. Toggle Cache Auto-Clear on Exit
    const autoCacheToggle = page.locator('[data-testid="toggle-cache-autoclear"]');
    await autoCacheToggle.click();
    await expect(autoCacheToggle).toHaveClass(/on/);
  });

  test('App Lock Overlay: Lock screen blocks view, wrong PIN shakes, correct PIN unlocks', async ({ page }) => {
    // Setup PIN
    await page.goto('/features/settings/security-lock');
    await page.locator('[data-testid="toggle-app-lock"]').click();
    for (const d of ['2', '4', '6', '8']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await page.waitForTimeout(300);
    for (const d of ['2', '4', '6', '8']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await expect(page.locator('.lock-sub-settings')).toBeVisible({ timeout: 5000 });

    // Trigger lock screen
    await page.evaluate(() => {
      if ((window as any).__securityLockService) {
        (window as any).__securityLockService.lock();
      }
    });

    const overlay = page.locator('[data-testid="security-lock-overlay"]');
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Enter wrong PIN 0-0-0-0
    for (const _ of [1, 2, 3, 4]) {
      await page.locator('[data-testid="overlay-keypad-0"]').click();
    }

    // Verify error text
    const errorText = page.locator('[data-testid="overlay-pin-error"]');
    await expect(errorText).toBeVisible({ timeout: 5000 });
    await expect(errorText).toContainText('Incorrect PIN');

    // Enter correct PIN 2-4-6-8
    for (const d of ['2', '4', '6', '8']) {
      await page.locator(`[data-testid="overlay-keypad-${d}"]`).click();
    }

    // Overlay smoothly unlocks
    await expect(overlay).not.toBeVisible({ timeout: 5000 });
  });

  test('History Vault Access Gating: Lock Vault Only gates /features/history behind PIN challenge', async ({ page }) => {
    // Setup PIN with Vault Only mode
    await page.goto('/features/settings/security-lock');
    await page.locator('[data-testid="toggle-app-lock"]').click();
    for (const d of ['1', '3', '5', '7']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await page.waitForTimeout(300);
    for (const d of ['1', '3', '5', '7']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await expect(page.locator('.lock-sub-settings')).toBeVisible({ timeout: 5000 });

    // Select vault only target and lock vault
    await page.locator('[data-testid="target-btn-vault"]').click();
    await page.evaluate(() => {
      if ((window as any).__securityLockService) {
        (window as any).__securityLockService.lockVault();
      }
    });

    // Navigate to /features/history
    await page.goto('/features/history');
    await page.waitForLoadState('networkidle');

    // Verify vault locked barrier
    const vaultCard = page.locator('[data-testid="vault-locked-card"]');
    await expect(vaultCard).toBeVisible({ timeout: 5000 });

    // Enter wrong PIN
    const pinInput = page.locator('[data-testid="vault-pin-input"]');
    await pinInput.fill('0000');
    await page.locator('[data-testid="btn-unlock-vault"]').click();

    const vaultError = page.locator('[data-testid="vault-pin-error"]');
    await expect(vaultError).toBeVisible();
    await expect(vaultError).toContainText('Incorrect PIN');

    // Enter correct PIN
    await pinInput.fill('1357');
    await page.locator('[data-testid="btn-unlock-vault"]').click();

    // Vault unlocks
    await expect(vaultCard).not.toBeVisible({ timeout: 5000 });
  });

  test('Cybersecurity: Rate limiting enforces 30s lockout after 5 consecutive failed attempts', async ({ page }) => {
    await page.goto('/features/settings/security-lock');
    await page.locator('[data-testid="toggle-app-lock"]').click();
    for (const d of ['9', '9', '9', '9']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await page.waitForTimeout(300);
    for (const d of ['9', '9', '9', '9']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await expect(page.locator('.lock-sub-settings')).toBeVisible({ timeout: 5000 });

    // Lock app
    await page.evaluate(() => {
      if ((window as any).__securityLockService) {
        (window as any).__securityLockService.lock();
      }
    });

    const overlay = page.locator('[data-testid="security-lock-overlay"]');
    await expect(overlay).toBeVisible();

    // Enter wrong PIN 5 times in a row
    for (let attempt = 1; attempt <= 5; attempt++) {
      for (const _ of [1, 2, 3, 4]) {
        await page.locator('[data-testid="overlay-keypad-0"]').click();
      }
      await page.waitForTimeout(300);
    }

    // Verify lockout active
    const errorText = page.locator('[data-testid="overlay-pin-error"]');
    await expect(errorText).toBeVisible();
    await expect(errorText).toContainText('Too many failed attempts');
    await expect(page.locator('.keypad-grid')).toHaveClass(/disabled/);
  });

  test('Cybersecurity: Cryptographic Salt & Hash Storage verification', async ({ page }) => {
    await page.goto('/features/settings/security-lock');
    await page.locator('[data-testid="toggle-app-lock"]').click();
    for (const d of ['4', '3', '2', '1']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await page.waitForTimeout(300);
    for (const d of ['4', '3', '2', '1']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await expect(page.locator('.lock-sub-settings')).toBeVisible({ timeout: 5000 });

    // Inspect persisted storage
    const storedConfig = await page.evaluate(async () => {
      if ((window as any).Capacitor?.Plugins?.Preferences) {
        const { value } = await (window as any).Capacitor.Plugins.Preferences.get({
          key: 'IFH_SECURITY_LOCK_CONFIG_V1'
        });
        return value ? JSON.parse(value) : null;
      }
      return null;
    });

    expect(storedConfig).not.toBeNull();
    expect(storedConfig.enabled).toBe(true);
    expect(storedConfig.pinSalt).toBeDefined();
    expect(storedConfig.pinSalt.length).toBeGreaterThanOrEqual(16);

    // Verify PIN is NEVER stored in plaintext
    expect(storedConfig.pinHash).toBeDefined();
    expect(storedConfig.pinHash.length).toBe(64); // 256-bit hex hash
    expect(storedConfig.pinHash).not.toBe('4321');
    expect(JSON.stringify(storedConfig)).not.toContain('4321');
  });

  test('Emergency Panic Clear: 2-step bottom sheet wipes all data, cache, and resets lock', async ({ page }) => {
    // 1. Enable lock and populate dummy data
    await page.goto('/features/settings/security-lock');
    await page.locator('[data-testid="toggle-app-lock"]').click();
    for (const d of ['1', '2', '3', '4']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await page.waitForTimeout(300);
    for (const d of ['1', '2', '3', '4']) {
      await page.locator(`[data-testid="keypad-btn-${d}"]`).click();
    }
    await expect(page.locator('.lock-sub-settings')).toBeVisible({ timeout: 5000 });

    // Pre-populate some preferences & history
    await page.evaluate(async () => {
      localStorage.setItem('DUMMY_KEY', 'DUMMY_VALUE');
      if ((window as any).Capacitor?.Plugins?.Preferences) {
        await (window as any).Capacitor.Plugins.Preferences.set({
          key: 'IFH_HISTORY_V2',
          value: JSON.stringify([{ id: 'h1', operation: 'pdf', originalFileName: 'test.pdf' }])
        });
      }
    });

    // 2. Click "Emergency Panic Clear" button
    await page.locator('[data-testid="btn-open-panic-clear"]').click();

    // 3. Verify Step 1 Bottom Sheet Breakdown
    const panicSheet = page.locator('[data-testid="panic-sheet-card"]');
    await expect(panicSheet).toBeVisible();
    await expect(page.locator('[data-testid="panic-step-1"]')).toBeVisible();

    // 4. Click "Proceed to Final Confirmation"
    await page.locator('[data-testid="btn-proceed-final-panic"]').click();

    // 5. Verify Step 2 High-Urgency Warning
    await expect(page.locator('[data-testid="panic-step-2"]')).toBeVisible();

    // 6. Execute Panic Wipe
    await page.locator('[data-testid="btn-execute-panic-wipe"]').click();

    // 7. Verify sheet dismisses and state resets
    await expect(panicSheet).not.toBeVisible({ timeout: 5000 });

    const badge = page.locator('.hero-badge');
    await expect(badge).toContainText('Lock Disabled (Default)');
    await expect(page.locator('[data-testid="toggle-app-lock"]')).not.toHaveClass(/on/);

    // Verify localStorage & preferences are completely erased
    const storageEmpty = await page.evaluate(async () => {
      const localEmpty = localStorage.length === 0;
      let prefsEmpty = true;
      if ((window as any).Capacitor?.Plugins?.Preferences) {
        const { keys } = await (window as any).Capacitor.Plugins.Preferences.keys();
        prefsEmpty = keys.length === 0;
      }
      return localEmpty && prefsEmpty;
    });

    expect(storageEmpty).toBe(true);
  });
});
