import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('P2 Contact & Calendar Event Extractor (Business Card -> vCard, Document -> .ics) @contact-calendar @p2', () => {
  const horizontalCardPdf = path.resolve(__dirname, 'test-data/contact-calendar/business-card-horizontal.pdf');
  const verticalCardPdf = path.resolve(__dirname, 'test-data/contact-calendar/business-card-vertical.pdf');
  const webinarPdf = path.resolve(__dirname, 'test-data/contact-calendar/webinar-schedule.pdf');
  const confSchedulePdf = path.resolve(__dirname, 'test-data/contact-calendar/conference-schedule.pdf');
  const ambiguousDatePdf = path.resolve(__dirname, 'test-data/contact-calendar/ambiguous-date.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('P2-001: Contact Workflow — Upload Business Card, Verify Fields, Inline Edit, and Download .vcf', async ({ page }) => {
    // 1. Navigate to /features/pdf/intelligence/contact-calendar
    await page.goto('/features/pdf/intelligence/contact-calendar');
    await page.waitForLoadState('domcontentloaded');

    // Verify header and dropzone
    const headerTitle = page.locator('.header-title');
    await expect(headerTitle).toBeVisible();

    const emptyCard = page.locator('.empty-card');
    await expect(emptyCard).toBeVisible();

    // 2. Upload Business Card Document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(horizontalCardPdf);

    // Verify dual card layout is rendered
    const previewCard = page.locator('.source-preview-card');
    await expect(previewCard).toBeVisible({ timeout: 15000 });

    const fieldsCard = page.locator('.fields-review-card');
    await expect(fieldsCard).toBeVisible();

    // Verify active mode is Contact
    const contactModeBtn = page.locator('.mode-btn-contact');
    await expect(contactModeBtn).toHaveClass(/is-active/);

    // 3. Verify extracted contact fields
    const nameInput = page.locator('input[placeholder*="John Doe"]');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue(/Dr\. Ananya Roy/i);

    const titleInput = page.locator('input[placeholder*="Managing Director"]');
    await expect(titleInput).toHaveValue(/Chief Technology Officer/i);

    const orgInput = page.locator('input[placeholder*="Acme Corp"]');
    await expect(orgInput).toHaveValue(/Apex AI Technologies/i);

    const mobileInput = page.locator('input[placeholder*="+91 98765 43210"]');
    await expect(mobileInput).toHaveValue(/\+91\s*98765\s*43210/);

    const emailInput = page.locator('input[placeholder*="john@example.com"]');
    await expect(emailInput).toHaveValue('ananya.roy@apexai.example.com');

    const webInput = page.locator('input[placeholder*="https://example.com"]');
    await expect(webInput).toHaveValue(/apexai\.example\.com/);

    // 4. Inline Edit parsed field
    await nameInput.fill('Dr. Ananya Roy-Verma');
    await expect(nameInput).toHaveValue('Dr. Ananya Roy-Verma');

    // 5. Save Contact (.vcf)
    const saveVcfBtn = page.locator('.btn-save-vcf');
    await expect(saveVcfBtn).toBeVisible();

    const [vcfDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      saveVcfBtn.click()
    ]);

    expect(vcfDownload.suggestedFilename()).toMatch(/\.vcf$/i);
    const downloadPath = await vcfDownload.path();
    if (downloadPath) {
      const vcfContent = fs.readFileSync(downloadPath, 'utf8');
      expect(vcfContent).toContain('BEGIN:VCARD');
      expect(vcfContent).toContain('VERSION:3.0');
      expect(vcfContent).toContain('FN:Dr. Ananya Roy-Verma');
      expect(vcfContent).toContain('EMAIL;TYPE=INTERNET:ananya.roy@apexai.example.com');
      expect(vcfContent).toContain('END:VCARD');
    }

    // 6. Native Contact Sharing
    const openContactsBtn = page.locator('.btn-open-contacts');
    await expect(openContactsBtn).toBeVisible();
    await openContactsBtn.click();
    // Toast notification confirms opening contact
    const toast = page.locator('.toast-notification');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('P2-002: Calendar Event Workflow — Upload Schedule, Verify Extracted Event, Edit, and Download .ics', async ({ page }) => {
    // 1. Navigate to tool
    await page.goto('/features/pdf/intelligence/contact-calendar');
    await page.waitForLoadState('domcontentloaded');

    // 2. Upload Webinar Schedule
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(webinarPdf);

    // Automatic mode inference to calendar
    const calendarModeBtn = page.locator('.mode-btn-calendar');
    await expect(calendarModeBtn).toHaveClass(/is-active/, { timeout: 15000 });

    // 3. Verify extracted calendar event fields
    const titleInput = page.locator('input[placeholder*="Project Sync Meeting"]');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue(/AI Microservices Architecture Webinar/i);

    const startDateInput = page.locator('input[type="date"]').first();
    await expect(startDateInput).toHaveValue('2026-11-15');

    const startTimeInput = page.locator('input[type="time"]').first();
    await expect(startTimeInput).toHaveValue('14:00');

    const endTimeInput = page.locator('input[type="time"]').nth(1);
    await expect(endTimeInput).toHaveValue('15:30');

    const meetingLinkInput = page.locator('input[placeholder*="zoom.us"]');
    await expect(meetingLinkInput).toHaveValue(/zoom\.us\/j\/9876543210/);

    // 4. Inline Edit Event Title
    await titleInput.fill('AI Microservices Architecture Masterclass 2026');
    await expect(titleInput).toHaveValue('AI Microservices Architecture Masterclass 2026');

    // 5. Save Event (.ics)
    const saveIcsBtn = page.locator('.btn-save-ics');
    await expect(saveIcsBtn).toBeVisible();

    const [icsDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      saveIcsBtn.click()
    ]);

    expect(icsDownload.suggestedFilename()).toMatch(/\.ics$/i);
    const downloadPath = await icsDownload.path();
    if (downloadPath) {
      const icsContent = fs.readFileSync(downloadPath, 'utf8');
      expect(icsContent).toContain('BEGIN:VCALENDAR');
      expect(icsContent).toContain('VERSION:2.0');
      expect(icsContent).toContain('BEGIN:VEVENT');
      expect(icsContent).toContain('SUMMARY:AI Microservices Architecture Masterclass 2026');
      expect(icsContent).toContain('URL:https://zoom.us/j/9876543210');
      expect(icsContent).toContain('END:VEVENT');
      expect(icsContent).toContain('END:VCALENDAR');
    }

    // 6. Native Calendar Sharing
    const addCalendarBtn = page.locator('.btn-add-calendar');
    await expect(addCalendarBtn).toBeVisible();
    await addCalendarBtn.click();
    const toast = page.locator('.toast-notification');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('P2-003: Ambiguous Date Disambiguation — Prompts "May 6 or June 5?" and Resolves with 1-Tap Chip', async ({ page }) => {
    // 1. Navigate to tool
    await page.goto('/features/pdf/intelligence/contact-calendar');
    await page.waitForLoadState('domcontentloaded');

    // 2. Upload Document with Ambiguous Date (05/06/2026)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(ambiguousDatePdf);

    // 3. Ambiguous Date Banner must be rendered with prompt
    const banner = page.locator('.ambiguous-date-banner');
    await expect(banner).toBeVisible({ timeout: 15000 });

    const promptText = page.locator('.ambiguity-prompt');
    await expect(promptText).toBeVisible();
    await expect(promptText).toContainText('Is this May 6 or June 5?');

    // Two disambiguation option chips
    const chipBtns = page.locator('.chip-btn');
    await expect(chipBtns).toHaveCount(2);
    await expect(chipBtns.first()).toContainText('May 6, 2026');
    await expect(chipBtns.nth(1)).toContainText('June 5, 2026');

    // 4. Tap the second option: June 5, 2026 (DD/MM/YYYY)
    await chipBtns.nth(1).click();

    // Verify option is selected
    await expect(chipBtns.nth(1)).toHaveClass(/selected/);

    // Verify start date field updated to 2026-06-05
    const startDateInput = page.locator('input[type="date"]').first();
    await expect(startDateInput).toHaveValue('2026-06-05');

    // Confirmation toast
    const toast = page.locator('.toast-notification');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/Date (resolved|confirmed) to 2026-06-05/);
  });

  test('P2-004: Seamless Mode Switching Between Contact and Calendar Modes', async ({ page }) => {
    // 1. Navigate to tool
    await page.goto('/features/pdf/intelligence/contact-calendar');
    await page.waitForLoadState('domcontentloaded');

    // 2. Upload Conference Schedule PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(confSchedulePdf);

    // Calendar mode should be active
    const calendarModeBtn = page.locator('.mode-btn-calendar');
    await expect(calendarModeBtn).toHaveClass(/is-active/, { timeout: 15000 });

    const eventTitle = page.locator('input[placeholder*="Project Sync Meeting"]');
    await expect(eventTitle).toBeVisible();
    await expect(eventTitle).toHaveValue(/Annual Tech Conclave/i);

    // 3. Switch to Contact Mode
    const contactModeBtn = page.locator('.mode-btn-contact');
    await contactModeBtn.click();
    await expect(contactModeBtn).toHaveClass(/is-active/);

    // Contact fields should now be visible
    const nameInput = page.locator('input[placeholder*="John Doe"]');
    await expect(nameInput).toBeVisible();

    // 4. Switch back to Calendar Mode
    await calendarModeBtn.click();
    await expect(calendarModeBtn).toHaveClass(/is-active/);
    await expect(eventTitle).toBeVisible();
  });
});
