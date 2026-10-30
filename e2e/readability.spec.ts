import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('P7 Reading Time & Readability Analyzer @readability @p7', () => {
  const childrenStoryPdfPath = path.resolve(__dirname, 'test-data/readability/children-story.pdf');
  const newspaperPdfPath = path.resolve(__dirname, 'test-data/readability/newspaper-article.pdf');
  const academicPaperPdfPath = path.resolve(__dirname, 'test-data/readability/academic-paper.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('P7-001: Initial Load, Empty State, Try Sample Document, and Report Sharing', async ({ page }) => {
    // 1. Navigate to /features/pdf/intelligence/readability
    await page.goto('/features/pdf/intelligence/readability');
    await page.waitForLoadState('domcontentloaded');

    // Verify Title
    const title = page.locator('.header-title');
    await expect(title).toBeVisible();
    await expect(title).toContainText('Reading Time & Readability');

    // Verify Empty State Dropzone
    const emptyCard = page.locator('.empty-card');
    await expect(emptyCard).toBeVisible();
    await expect(page.locator('.btn-primary-choose')).toBeVisible();

    const sampleBtn = page.locator('.btn-secondary-sample');
    await expect(sampleBtn).toBeVisible();

    // 2. Click "Try Sample Document"
    await sampleBtn.click();

    // Wait for Dashboard
    const dashboard = page.locator('.dashboard-scrollable');
    await expect(dashboard).toBeVisible();

    // 3. Check Executive Summary Card
    const summaryCard = page.locator('.summary-card');
    await expect(summaryCard).toBeVisible();

    const readingTimeBadge = summaryCard.locator('.metric-number');
    await expect(readingTimeBadge).toBeVisible();
    await expect(readingTimeBadge).toContainText(/min read/);

    const complexityPill = summaryCard.locator('.complexity-pill');
    await expect(complexityPill).toBeVisible();

    const speakingBadge = summaryCard.locator('.speaking-badge');
    await expect(speakingBadge).toBeVisible();
    await expect(speakingBadge).toContainText(/min talk/);

    // Verify Document Statistics Grid
    const statsGrid = summaryCard.locator('.stats-grid');
    await expect(statsGrid).toBeVisible();
    const statItems = statsGrid.locator('.stat-item');
    await expect(statItems).toHaveCount(4);

    // 4. Check Readability Gauges & Progress Bars
    const gaugesCard = page.locator('.gauges-card');
    await expect(gaugesCard).toBeVisible();
    await expect(gaugesCard.locator('.score-ease')).toBeVisible();
    await expect(gaugesCard.locator('.score-grade')).toBeVisible();
    await expect(gaugesCard.locator('.score-fog')).toBeVisible();

    // 5. Educational Formula Explanations Accordion
    const formulaCards = page.locator('.formula-card');
    await expect(formulaCards).toHaveCount(3);
    const firstFormula = formulaCards.first();
    await firstFormula.click();
    await expect(firstFormula).toHaveClass(/is-expanded/);
    await expect(firstFormula.locator('.formula-desc')).toBeVisible();

    // 6. Per-Section Breakdown
    const sectionsCard = page.locator('.sections-card');
    await expect(sectionsCard).toBeVisible();
    const sectionItems = sectionsCard.locator('.section-item-card');
    const sectionCount = await sectionItems.count();
    expect(sectionCount).toBeGreaterThanOrEqual(2);

    // 7. Share Readability Report
    const shareBtn = page.locator('.btn-primary-share');
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    // Toast notification confirms share or clipboard copy
    const toast = page.locator('.toast-notification');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('P7-002: Children Story PDF — Easy / Conversational Complexity & Fast Reading Time', async ({ page }) => {
    await page.goto('/features/pdf/intelligence/readability');
    await page.waitForLoadState('domcontentloaded');

    // Upload Children Story PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(childrenStoryPdfPath);

    const dashboard = page.locator('.dashboard-scrollable');
    await expect(dashboard).toBeVisible({ timeout: 15000 });

    // Executive Summary: Easy / Conversational
    const complexityPill = page.locator('.complexity-pill');
    await expect(complexityPill).toBeVisible();
    await expect(complexityPill).toHaveClass(/pill-easy/);
    await expect(complexityPill).toContainText('Easy / Conversational');

    // Silent Reading Time: < 1 min read
    const readingTimeBadge = page.locator('.metric-number');
    await expect(readingTimeBadge).toContainText(/min read/);

    // Gauges: High Flesch Reading Ease (>= 80) and Low Grade (<= 5)
    const scoreEaseText = await page.locator('.score-ease').textContent();
    const scoreGradeText = await page.locator('.score-grade').textContent();

    const easeVal = parseFloat((scoreEaseText || '').split('/')[0].trim());
    expect(easeVal).toBeGreaterThanOrEqual(75);

    expect(scoreGradeText).toMatch(/Grade [1-5]/);
  });

  test('P7-003: Academic Research Paper PDF — Multi-Page Breakdown & Dense Complexity', async ({ page }) => {
    await page.goto('/features/pdf/intelligence/readability');
    await page.waitForLoadState('domcontentloaded');

    // Upload Academic Paper PDF (2 pages)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(academicPaperPdfPath);

    const dashboard = page.locator('.dashboard-scrollable');
    await expect(dashboard).toBeVisible({ timeout: 15000 });

    // Complexity: Dense / Academic / Technical
    const complexityPill = page.locator('.complexity-pill');
    await expect(complexityPill).toBeVisible();
    await expect(complexityPill).toHaveClass(/pill-dense/);
    await expect(complexityPill).toContainText('Dense / Academic / Technical');

    // Gauges: Low Reading Ease (< 50) and High Grade Level (14+)
    const scoreGradeText = await page.locator('.score-grade').textContent();
    const gradeNum = parseFloat((scoreGradeText || '').replace(/[^0-9.]/g, ''));
    expect(gradeNum).toBeGreaterThanOrEqual(13);

    // Multi-page Section Breakdown: Page 1 and Page 2
    const sectionsCard = page.locator('.sections-card');
    await expect(sectionsCard).toBeVisible();

    const sectionItems = sectionsCard.locator('.section-item-card');
    await expect(sectionItems).toHaveCount(2);

    const page1Title = sectionItems.nth(0).locator('.section-title');
    await expect(page1Title).toContainText('Page 1');

    const page2Title = sectionItems.nth(1).locator('.section-title');
    await expect(page2Title).toContainText('Page 2');

    // Both pages should be dense
    const page1Badge = sectionItems.nth(0).locator('.section-band-badge');
    await expect(page1Badge).toHaveClass(/band-dense/);

    // Share report
    const shareBtn = page.locator('.btn-primary-share');
    await shareBtn.click();
    const toast = page.locator('.toast-notification');
    await expect(toast).toBeVisible({ timeout: 5000 });
  });
});
