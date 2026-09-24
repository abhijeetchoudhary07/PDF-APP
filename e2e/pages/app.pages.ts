import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page objects for the end-to-end journey.
 *
 * Kept deliberately thin. The existing suites address the DOM directly and
 * there is no value in rewriting them; these exist so the one test that walks
 * the *whole* product does not become a wall of selectors, and so that the
 * "wait for it to be interactive, not merely routed" rule lives in one place
 * instead of being re-derived in every step.
 *
 * No method in this file uses `waitForTimeout`. Every wait is for a condition.
 */

/** A route plus the thing that proves it finished rendering. */
export interface ToolSpec {
  readonly id: string;
  readonly name: string;
  readonly route: string;
  /** Rendered only once the tool is usable. */
  readonly ready: string;
}

/**
 * Every tool in the catalogue, with the selector that proves it is interactive.
 *
 * Mirrors `tool-registry.service.ts`. Two entries there share a route
 * (`pdf_reader`/`pdf_annotations`, both `/features/pdf/editor`), so this list
 * carries the 25 distinct routes rather than all 27 catalogue ids.
 */
export const ALL_TOOLS: readonly ToolSpec[] = [
  { id: 'photo_tools', name: 'Photo Tools', route: '/features/photo', ready: 'app-file-dropzone, main' },
  { id: 'signature_tools', name: 'Signature Tools', route: '/features/signature', ready: 'app-file-dropzone, main' },
  { id: 'pdf_compress', name: 'Compress PDF', route: '/features/pdf-compress', ready: 'main' },
  { id: 'images_to_pdf', name: 'Images to PDF', route: '/features/images-to-pdf', ready: 'main' },
  { id: 'pdf_dashboard', name: 'PDF Studio', route: '/features/pdf', ready: 'main' },
  { id: 'pdf_extract', name: 'Extract Pages', route: '/features/pdf/extract', ready: 'main' },
  { id: 'pdf_merge', name: 'Merge PDF', route: '/features/pdf/merge', ready: 'main' },
  { id: 'pdf_split', name: 'Split PDF', route: '/features/pdf/split', ready: 'main' },
  { id: 'pdf_organize', name: 'Organize Pages', route: '/features/pdf/organize', ready: 'main' },
  { id: 'pdf_editor', name: 'PDF Reader & Editor', route: '/features/pdf/editor', ready: 'main' },
  { id: 'pdf_signing', name: 'Sign PDF', route: '/features/pdf/sign', ready: 'main' },
  { id: 'pdf_forms', name: 'Fill & Create Forms', route: '/features/pdf/forms', ready: 'main' },
  { id: 'pdf_security', name: 'Protect & Unlock', route: '/features/pdf/security', ready: 'main' },
  { id: 'doc_converter', name: 'Document Converter', route: '/features/pdf/conversion', ready: 'main' },
  { id: 'batch_images', name: 'Batch Image Tools', route: '/features/batch-images', ready: 'main' },
  { id: 'presets', name: 'Exam & Job Presets', route: '/features/presets', ready: 'main' },
  { id: 'pdf_ocr', name: 'Smart PDF OCR', route: '/features/pdf-ocr', ready: 'main' },
  { id: 'document_scanner', name: 'Document Scanner', route: '/features/document-scanner', ready: 'main' },
  { id: 'document_validator', name: 'Document Validator', route: '/features/document-validator', ready: 'main' },
  { id: 'pdf_compare', name: 'PDF Compare', route: '/features/pdf-compare', ready: 'main' },
  { id: 'pdf_privacy_sanitizer', name: 'Privacy Sanitizer', route: '/features/pdf-privacy-sanitizer', ready: 'main' },
  { id: 'pdf_header_footer', name: 'Header & Footer Studio', route: '/features/pdf-header-footer', ready: 'main' },
  { id: 'pdf_repair', name: 'PDF Repair', route: '/features/pdf-repair', ready: 'main' },
  { id: 'pdf_extractor', name: 'PDF Content Extractor', route: '/features/pdf-extractor', ready: 'main' },
  { id: 'qr_barcode', name: 'QR & Barcode Toolkit', route: '/features/qr-barcode', ready: 'main' },
  { id: 'pdf_intelligence', name: 'PDF Intelligence', route: '/features/pdf-intelligence', ready: 'main' },
];

/** Shared chrome — header, nav, the quota pill. */
export class AppShell {
  constructor(private readonly page: Page) {}

  get header(): Locator {
    return this.page.locator('app-header').first();
  }

  /** "5 left today", or absent for an unlimited account. */
  get quotaPill(): Locator {
    return this.page.locator('a[href*="premium"]').filter({ hasText: /left today/i }).first();
  }

  get membershipTag(): Locator {
    return this.page.locator('.drawer-membership-tag');
  }

  async waitReady(): Promise<void> {
    await this.header.waitFor({ state: 'visible', timeout: 30000 });
  }
}

/** Any tool page. */
export class ToolPage {
  readonly shell: AppShell;

  constructor(
    private readonly page: Page,
    private readonly spec: ToolSpec,
  ) {
    this.shell = new AppShell(page);
  }

  get fileInput(): Locator {
    return this.page.locator('input[type="file"]').first();
  }

  /** Navigates and waits for the tool to be usable, then asserts the URL held. */
  async open(): Promise<void> {
    await this.page.goto(this.spec.route);
    await this.shell.waitReady();
    await this.page.locator(this.spec.ready).first().waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.page, `${this.spec.name} did not stay on its own route`).toHaveURL(
      new RegExp(escapeRoute(this.spec.route)),
    );
  }

  /** True when this tool accepts a file at all — not every one does. */
  async acceptsFiles(): Promise<boolean> {
    return (await this.page.locator('input[type="file"]').count()) > 0;
  }

  async selectFile(absolutePath: string): Promise<void> {
    await this.fileInput.setInputFiles(absolutePath);
  }
}

/** The account screen: sign in, register, sign out, delete. */
export class AccountPage {
  constructor(private readonly page: Page) {}

  get identity(): Locator {
    return this.page.locator('.account-identity');
  }

  get email(): Locator {
    return this.page.locator('.account-email');
  }

  get planValue(): Locator {
    return this.page.locator('.plan-value');
  }

  get modeSwitch(): Locator {
    return this.page.locator('.mode-switch');
  }

  get deleteCard(): Locator {
    return this.page.locator('.account-card--danger');
  }

  async open(): Promise<void> {
    await this.page.goto('/account');
    await this.page.locator('.account-card').first().waitFor({ state: 'visible', timeout: 30000 });
    await this.page
      .locator('.account-identity, .mode-switch')
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.page).toHaveURL(/\/account/);
  }

  async selectMode(mode: 'Sign in' | 'Create account'): Promise<void> {
    const tab = this.page.getByRole('tab', { name: mode });
    await tab.waitFor({ state: 'visible', timeout: 30000 });
    await tab.click({ timeout: 30000 });
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
  }

  async fill(email: string, password: string): Promise<void> {
    const field = this.page.locator('input[type="email"]');
    await field.waitFor({ state: 'visible', timeout: 30000 });
    await field.fill(email);
    await this.page.locator('input[type="password"]').fill(password);
  }

  async submit(mode: 'Sign in' | 'Create account'): Promise<void> {
    await this.page.getByRole('button', { name: mode }).click({ timeout: 30000 });
    await this.identity.waitFor({ state: 'visible', timeout: 30000 });
  }

  async signOut(): Promise<void> {
    await this.page.getByRole('button', { name: 'Sign out' }).click({ timeout: 30000 });
    await this.modeSwitch.waitFor({ state: 'visible', timeout: 30000 });
  }

  async refreshStatus(): Promise<void> {
    await this.page.getByRole('button', { name: 'Refresh status' }).click({ timeout: 30000 });
  }

  /** Walks the typed-confirmation delete flow to completion. */
  async deleteAccount(): Promise<void> {
    await this.deleteCard.scrollIntoViewIfNeeded();
    await this.page.getByRole('button', { name: 'Delete account' }).click({ timeout: 30000 });

    const confirm = this.page.getByRole('button', { name: 'Permanently delete' });
    await confirm.waitFor({ state: 'visible', timeout: 30000 });
    await expect(confirm, 'delete was enabled before the phrase was typed').toBeDisabled();

    await this.page.locator('input[name="deleteConfirmation"]').fill('DELETE');
    await expect(confirm).toBeEnabled();
    await confirm.click({ timeout: 30000 });

    await this.modeSwitch.waitFor({ state: 'visible', timeout: 30000 });
  }
}

/** The paywall. */
export class PremiumPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/features/premium');
    await this.page.locator('main').first().waitFor({ state: 'visible', timeout: 30000 });
    await expect(this.page).toHaveURL(/\/features\/premium/);
  }

  get planCards(): Locator {
    return this.page.locator('.plan-card, [class*="plan-"]');
  }
}

/** Escapes a route for use inside `toHaveURL(new RegExp(...))`. */
export function escapeRoute(route: string): string {
  return route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
