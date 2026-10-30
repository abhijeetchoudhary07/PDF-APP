import { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then(m => m.HomePage)
  },
  {
    path: 'features/photo',
    loadComponent: () => import('./features/photo/photo.page').then(m => m.PhotoPage)
  },
  {
    path: 'features/photo/id-photo',
    loadComponent: () => import('./features/photo/id-photo/id-photo.page').then(m => m.IdPhotoPage)
  },
  {
    path: 'features/id-photo',
    redirectTo: 'features/photo/id-photo',
    pathMatch: 'full'
  },
  {
    path: 'features/photo/blur',
    loadComponent: () => import('./features/photo/blur/photo-blur.page').then(m => m.PhotoBlurPage)
  },
  {
    path: 'features/photo-blur',
    redirectTo: 'features/photo/blur',
    pathMatch: 'full'
  },
  {
    path: 'features/photo/cutout',
    loadComponent: () => import('./features/photo/cutout/photo-cutout.page').then(m => m.PhotoCutoutPage)
  },
  {
    path: 'features/photo-cutout',
    redirectTo: 'features/photo/cutout',
    pathMatch: 'full'
  },
  {
    path: 'features/document-cutout',
    redirectTo: 'features/photo/cutout',
    pathMatch: 'full'
  },
  {
    path: 'features/photo/enhance',
    loadComponent: () => import('./features/photo/enhance/photo-enhance.page').then(m => m.PhotoEnhancePage)
  },
  {
    path: 'features/photo-enhance',
    redirectTo: 'features/photo/enhance',
    pathMatch: 'full'
  },
  {
    path: 'features/photo/metadata',
    loadComponent: () => import('./features/photo/metadata/photo-metadata.page').then(m => m.PhotoMetadataPage)
  },
  {
    path: 'features/photo-metadata',
    redirectTo: 'features/photo/metadata',
    pathMatch: 'full'
  },
  {
    path: 'features/photo/watermark',
    loadComponent: () => import('./features/photo/watermark/photo-watermark.page').then(m => m.PhotoWatermarkPage)
  },
  {
    path: 'features/photo-watermark',
    redirectTo: 'features/photo/watermark',
    pathMatch: 'full'
  },
  {
    path: 'features/photo/sheet',
    loadComponent: () => import('./features/photo/sheet/photo-sheet.page').then(m => m.PhotoSheetPage)
  },
  {
    path: 'features/photo-sheet',
    redirectTo: 'features/photo/sheet',
    pathMatch: 'full'
  },
  {
    path: 'features/signature',
    loadComponent: () => import('./features/signature/signature.page').then(m => m.SignaturePage)
  },
  {
    path: 'features/pdf',
    loadComponent: () => import('./features/pdf/pdf.page').then(m => m.PdfPage)
  },
  {
    path: 'features/pdf-compress',
    loadComponent: () => import('./features/pdf/pdf.page').then(m => m.PdfPage),
    data: { mode: 'compress' }
  },
  {
    path: 'features/images-to-pdf',
    loadComponent: () => import('./features/pdf/pdf.page').then(m => m.PdfPage),
    data: { mode: 'create' }
  },
  {
    path: 'features/pdf-dashboard',
    redirectTo: 'features/pdf',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-extract',
    redirectTo: 'features/pdf/extract',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-merge',
    redirectTo: 'features/pdf/merge',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-split',
    redirectTo: 'features/pdf/split',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-organize',
    redirectTo: 'features/pdf/organize',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-organizer',
    redirectTo: 'features/pdf/organize',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-rotate',
    redirectTo: 'features/pdf/rotate',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-delete',
    redirectTo: 'features/pdf/delete',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-reader',
    redirectTo: 'features/pdf/editor',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-editor',
    redirectTo: 'features/pdf/editor',
    pathMatch: 'full'
  },
  {
    path: 'features/editor',
    redirectTo: 'features/pdf/editor',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-annotations',
    redirectTo: 'features/pdf/editor',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-signing',
    redirectTo: 'features/pdf/sign',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-sign',
    redirectTo: 'features/pdf/sign',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-forms',
    redirectTo: 'features/pdf/forms',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-security',
    redirectTo: 'features/pdf/security',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-protect',
    redirectTo: 'features/pdf/security/protect',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-batch-security',
    redirectTo: 'features/pdf/security/batch',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-unlock',
    redirectTo: 'features/pdf/unlock',
    pathMatch: 'full'
  },
  {
    path: 'features/converter',
    redirectTo: 'features/pdf/conversion',
    pathMatch: 'full'
  },
  {
    path: 'features/converter/:converterId',
    redirectTo: 'features/pdf/conversion/:converterId',
    pathMatch: 'full'
  },
  {
    path: 'features/conversion',
    redirectTo: 'features/pdf/conversion',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-conversion',
    redirectTo: 'features/pdf/conversion',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/editor',
    loadComponent: () => import('./features/pdf-editor/pdf-editor.page').then(m => m.PdfEditorPage)
  },
  {
    path: 'features/pdf/organize',
    loadComponent: () => import('./features/pdf-organizer/pdf-organizer.page').then(m => m.PdfOrganizerPage)
  },
  {
    path: 'features/pdf/merge',
    loadComponent: () => import('./features/pdf-organizer/pdf-organizer.page').then(m => m.PdfOrganizerPage)
  },
  {
    path: 'features/pdf/split',
    loadComponent: () => import('./features/pdf-organizer/pdf-organizer.page').then(m => m.PdfOrganizerPage)
  },
  {
    path: 'features/pdf/rotate',
    loadComponent: () => import('./features/pdf-organizer/pdf-organizer.page').then(m => m.PdfOrganizerPage)
  },
  {
    path: 'features/pdf/delete',
    loadComponent: () => import('./features/pdf-organizer/pdf-organizer.page').then(m => m.PdfOrganizerPage)
  },
  {
    path: 'features/pdf/extract',
    loadComponent: () => import('./features/pdf-organizer/pdf-organizer.page').then(m => m.PdfOrganizerPage)
  },
  {
    path: 'features/pdf/conversion',
    loadComponent: () => import('./features/pdf-conversion/conversion-hub.page').then(m => m.ConversionHubPage)
  },
  {
    path: 'features/pdf/conversion/:converterId',
    loadComponent: () => import('./features/pdf-conversion/converter.page').then(m => m.ConverterPage)
  },
  {
    path: 'features/pdf/forms/build',
    loadComponent: () => import('./features/forms-build/forms-build.page').then(m => m.FormsBuildPage)
  },
  {
    path: 'features/pdf/forms/data',
    loadComponent: () => import('./features/forms-data/forms-data.page').then(m => m.FormsDataPage)
  },
  {
    path: 'features/pdf/forms/mail-merge',
    loadComponent: () => import('./features/forms-mail-merge/forms-mail-merge.page').then(m => m.FormsMailMergePage)
  },
  {
    path: 'features/pdf/forms',
    loadComponent: () => import('./features/pdf-forms/pdf-forms.page').then(m => m.PdfFormsPage)
  },
  {
    path: 'features/pdf/sign/templates',
    loadComponent: () => import('./features/sign-templates/sign-templates.page').then(m => m.SignTemplatesPage)
  },
  {
    path: 'features/pdf/sign/packet',
    loadComponent: () => import('./features/sign-packet/sign-packet.page').then(m => m.SignPacketPage)
  },
  {
    path: 'features/pdf/sign/certificate',
    loadComponent: () => import('./features/sign-certificate/sign-certificate.page').then(m => m.SignCertificatePage)
  },
  {
    path: 'features/pdf/sign',
    loadComponent: () => import('./features/pdf-sign/pdf-sign.page').then(m => m.PdfSignPage)
  },
  {
    path: 'features/pdf/security',
    loadComponent: () => import('./features/pdf-security/pdf-security.page').then(m => m.PdfSecurityPage)
  },
  {
    path: 'features/pdf/unlock',
    loadComponent: () => import('./features/pdf-security/pdf-security.page').then(m => m.PdfSecurityPage),
    data: { mode: 'unlock' }
  },
  {
    path: 'features/pdf/protect',
    redirectTo: 'features/pdf/security/protect',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/security/protect',
    loadComponent: () => import('./features/security-protect/security-protect.page').then(m => m.SecurityProtectPage)
  },
  {
    path: 'features/pdf/security/batch',
    loadComponent: () => import('./features/security-batch/security-batch.page').then(m => m.SecurityBatchPage)
  },
  {
    path: 'features/pdf/security/redact-verify',
    loadComponent: () => import('./features/redact-verify/redact-verify.page').then(m => m.RedactVerifyPage)
  },
  {
    path: 'features/pdf/security/search-redact',
    loadComponent: () => import('./features/search-redact/search-redact.page').then(m => m.SearchRedactPage)
  },
  {
    path: 'features/pdf/search-redact',
    redirectTo: 'features/pdf/security/search-redact',
    pathMatch: 'full'
  },
  {
    path: 'features/search-redact',
    redirectTo: 'features/pdf/security/search-redact',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/security/metadata',
    loadComponent: () => import('./features/metadata-editor/metadata-editor.page').then(m => m.MetadataEditorPage)
  },
  {
    path: 'features/pdf/metadata',
    redirectTo: 'features/pdf/security/metadata',
    pathMatch: 'full'
  },
  {
    path: 'features/metadata-editor',
    redirectTo: 'features/pdf/security/metadata',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/security/audit',
    loadComponent: () => import('./features/security-audit/security-audit.page').then(m => m.SecurityAuditPage)
  },
  {
    path: 'features/pdf/security-audit',
    redirectTo: 'features/pdf/security/audit',
    pathMatch: 'full'
  },
  {
    path: 'features/security-audit',
    redirectTo: 'features/pdf/security/audit',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/audit',
    redirectTo: 'features/pdf/security/audit',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/security/privacy-card',
    loadComponent: () => import('./features/privacy-card/privacy-card.page').then(m => m.PrivacyCardPage)
  },
  {
    path: 'features/pdf/privacy-card',
    redirectTo: 'features/pdf/security/privacy-card',
    pathMatch: 'full'
  },
  {
    path: 'features/privacy-card',
    redirectTo: 'features/pdf/security/privacy-card',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/security/privacy-sanitizer',
    redirectTo: 'features/pdf/privacy-sanitizer',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/privacy-sanitizer',
    loadComponent: () => import('./features/pdf-privacy-sanitizer/pdf-privacy-sanitizer.page').then(m => m.PdfPrivacySanitizerPage)
  },
  {
    path: 'features/pdf/redact-verify',
    redirectTo: 'features/pdf/security/redact-verify',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-batch-security',
    redirectTo: 'features/pdf/security/batch',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-redact-verify',
    redirectTo: 'features/pdf/security/redact-verify',
    pathMatch: 'full'
  },
  {
    path: 'features/redact-verify',
    redirectTo: 'features/pdf/security/redact-verify',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/flatten',
    loadComponent: () => import('./features/pdf-flatten/pdf-flatten.page').then(m => m.PdfFlattenPage)
  },
  {
    path: 'features/pdf/signature-request',
    loadComponent: () => import('./features/signature-request/signature-request.page').then(m => m.SignatureRequestPage)
  },
  /*
   * Part D — the Page Size & Layout Studio. One screen, seven operations; the
   * route's `mode` picks which tab opens, the same way the security page's
   * unlock/protect routes do. Every one of these is a new path, so nothing
   * that already resolves is affected.
   */
  {
    path: 'features/pdf/layout',
    loadComponent: () => import('./features/pdf-layout/pdf-layout.page').then(m => m.PdfLayoutPage)
  },
  {
    path: 'features/pdf/layout/crop',
    loadComponent: () => import('./features/pdf-layout/pdf-layout.page').then(m => m.PdfLayoutPage),
    data: { mode: 'crop' }
  },
  {
    path: 'features/pdf/layout/margins',
    loadComponent: () => import('./features/pdf-layout/pdf-layout.page').then(m => m.PdfLayoutPage),
    data: { mode: 'margins' }
  },
  {
    path: 'features/pdf/layout/nup',
    loadComponent: () => import('./features/pdf-layout/pdf-layout.page').then(m => m.PdfLayoutPage),
    data: { mode: 'nup' }
  },
  {
    path: 'features/pdf/layout/booklet',
    loadComponent: () => import('./features/pdf-layout/pdf-layout.page').then(m => m.PdfLayoutPage),
    data: { mode: 'booklet' }
  },
  {
    path: 'features/pdf/layout/long-page',
    loadComponent: () => import('./features/pdf-layout/pdf-layout.page').then(m => m.PdfLayoutPage),
    data: { mode: 'long-page' }
  },
  {
    path: 'features/pdf/layout/tone',
    loadComponent: () => import('./features/pdf-layout/pdf-layout.page').then(m => m.PdfLayoutPage),
    data: { mode: 'tone' }
  },
  /*
   * Part C — the Combine Studio and the overlay tool. The organizer's own
   * /features/pdf/merge route is untouched and is still the quick merge; these
   * are the cases it does not cover.
   */
  {
    path: 'features/pdf/combine',
    loadComponent: () => import('./features/pdf-combine/pdf-combine.page').then(m => m.PdfCombinePage)
  },
  {
    path: 'features/pdf/combine/interleave',
    loadComponent: () => import('./features/pdf-combine/pdf-combine.page').then(m => m.PdfCombinePage),
    data: { mode: 'interleave' }
  },
  {
    path: 'features/pdf/combine/insert',
    loadComponent: () => import('./features/pdf-combine/pdf-combine.page').then(m => m.PdfCombinePage),
    data: { mode: 'insert' }
  },
  {
    path: 'features/pdf/overlay',
    loadComponent: () => import('./features/pdf-overlay/pdf-overlay.page').then(m => m.PdfOverlayPage)
  },
  /*
   * Part E — Navigation & Page Labels Studio (E1 Bookmarks & E2 Logical Page Labels).
   */
  {
    path: 'features/pdf/navigation',
    loadComponent: () => import('./features/pdf-navigation/pdf-navigation.page').then(m => m.PdfNavigationPage)
  },
  {
    path: 'features/pdf/bookmarks',
    loadComponent: () => import('./features/pdf-navigation/pdf-navigation.page').then(m => m.PdfNavigationPage),
    data: { mode: 'bookmarks' }
  },
  {
    path: 'features/pdf/page-labels',
    loadComponent: () => import('./features/pdf-navigation/pdf-navigation.page').then(m => m.PdfNavigationPage),
    data: { mode: 'labels' }
  },
  {
    path: 'features/pdf/labels',
    redirectTo: 'features/pdf/page-labels',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/outline',
    redirectTo: 'features/pdf/bookmarks',
    pathMatch: 'full'
  },
  /*
   * Part F — Size & Output Control (F1 - F6)
   * Optimize Studio: DPI downsampling, grayscale/mono scan paths, deduplication,
   * proof view, upload limit fit chain, and structure optimization.
   */
  {
    path: 'features/pdf/optimize',
    loadComponent: () => import('./features/pdf-optimize/pdf-optimize.page').then(m => m.PdfOptimizePage)
  },
  {
    path: 'features/pdf/optimize/:mode',
    loadComponent: () => import('./features/pdf-optimize/pdf-optimize.page').then(m => m.PdfOptimizePage)
  },
  {
    path: 'features/pdf-optimize',
    redirectTo: 'features/pdf/optimize',
    pathMatch: 'full'
  },
  {
    path: 'optimize',
    redirectTo: 'features/pdf/optimize',
    pathMatch: 'full'
  },
  {
    path: 'features/presets',
    loadComponent: () => import('./features/presets/presets.page').then(m => m.PresetsPage)
  },
  {
    path: 'features/presets/builder',
    loadComponent: () => import('./features/preset-builder/preset-builder.page').then(m => m.PresetBuilderPage)
  },
  {
    path: 'features/preset-builder',
    redirectTo: 'features/presets/builder',
    pathMatch: 'full'
  },
  {
    path: 'presets/builder',
    redirectTo: 'features/presets/builder',
    pathMatch: 'full'
  },
  {
    path: 'features/presets/manage',
    loadComponent: () => import('./features/presets-manage/presets-manage.page').then(m => m.PresetsManagePage)
  },
  {
    path: 'features/presets-manage',
    redirectTo: 'features/presets/manage',
    pathMatch: 'full'
  },
  {
    path: 'presets/manage',
    redirectTo: 'features/presets/manage',
    pathMatch: 'full'
  },
  {
    path: 'features/presets/batch-check',
    loadComponent: () => import('./features/preset-batch-check/preset-batch-check.page').then(m => m.PresetBatchCheckPage)
  },
  {
    path: 'features/preset-batch-check',
    redirectTo: 'features/presets/batch-check',
    pathMatch: 'full'
  },
  {
    path: 'presets/batch-check',
    redirectTo: 'features/presets/batch-check',
    pathMatch: 'full'
  },
  {
    path: 'features/recipes/editor',
    loadComponent: () => import('./features/recipe-editor/recipe-editor.page').then(m => m.RecipeEditorPage)
  },
  {
    path: 'features/recipe-editor',
    redirectTo: 'features/recipes/editor',
    pathMatch: 'full'
  },
  {
    path: 'recipes/editor',
    redirectTo: 'features/recipes/editor',
    pathMatch: 'full'
  },
  {
    path: 'features/recipes/batch',
    loadComponent: () => import('./features/recipe-batch/recipe-batch.page').then(m => m.RecipeBatchPage)
  },
  {
    path: 'features/recipe-batch',
    redirectTo: 'features/recipes/batch',
    pathMatch: 'full'
  },
  {
    path: 'recipes/batch',
    redirectTo: 'features/recipes/batch',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-ocr',
    loadComponent: () => import('./features/pdf-ocr/pdf-ocr.page').then(m => m.PdfOcrPage)
  },
  {
    path: 'features/ocr/handwriting',
    loadComponent: () => import('./features/ocr-handwriting/ocr-handwriting.page').then(m => m.OcrHandwritingPage)
  },
  {
    path: 'features/ocr-handwriting',
    redirectTo: 'features/ocr/handwriting',
    pathMatch: 'full'
  },
  {
    path: 'features/ocr/correct',
    loadComponent: () => import('./features/ocr-correct/ocr-correct.page').then(m => m.OcrCorrectPage)
  },
  {
    path: 'features/ocr-correct',
    redirectTo: 'features/ocr/correct',
    pathMatch: 'full'
  },
  {
    path: 'features/ocr/table-to-excel',
    loadComponent: () => import('./features/table-to-excel/table-to-excel.page').then(m => m.TableToExcelPage)
  },
  {
    path: 'features/table-to-excel',
    redirectTo: 'features/ocr/table-to-excel',
    pathMatch: 'full'
  },
  {
    path: 'features/scanner',
    redirectTo: 'features/document-scanner',
    pathMatch: 'full'
  },
  {
    path: 'features/document-scanner',
    loadComponent: () => import('./features/document-scanner/document-scanner.page').then(m => m.DocumentScannerPage)
  },
  {
    path: 'features/document-validator',
    loadComponent: () => import('./features/document-validator/document-validator.page').then(m => m.DocumentValidatorPage)
  },
  {
    path: 'features/pdf-compare',
    loadComponent: () => import('./features/pdf-compare/pdf-compare.page').then(m => m.PdfComparePage)
  },
  {
    path: 'features/pdf/compare',
    redirectTo: 'features/pdf-compare',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-privacy-sanitizer',
    loadComponent: () => import('./features/pdf-privacy-sanitizer/pdf-privacy-sanitizer.page').then(m => m.PdfPrivacySanitizerPage)
  },
  {
    path: 'features/pdf-header-footer',
    loadComponent: () => import('./features/pdf-header-footer/pdf-header-footer.page').then(m => m.PdfHeaderFooterPage)
  },
  {
    path: 'features/pdf-header-footer/bates',
    loadComponent: () => import('./features/pdf-header-footer/pdf-header-footer.page').then(m => m.PdfHeaderFooterPage),
    data: { mode: 'bates' }
  },
  {
    path: 'features/pdf/bates',
    redirectTo: 'features/pdf-header-footer/bates',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-repair',
    loadComponent: () => import('./features/pdf-repair/pdf-repair.page').then(m => m.PdfRepairPage)
  },
  {
    path: 'features/pdf/repair',
    redirectTo: 'features/pdf-repair',
    pathMatch: 'full'
  },
  /*
   * Part G — Diagnostic, Integrity & Trust (G1 - G5)
   * G1: Document Fingerprint & Integrity Receipt
   * G3: Preflight & Submission Check
   * G4: Embedded Object Inspector
   * G5: Signature Status Panel (Report-Only)
   */
  {
    path: 'features/pdf/fingerprint',
    loadComponent: () => import('./features/pdf-fingerprint/pdf-fingerprint.page').then(m => m.PdfFingerprintPage)
  },
  {
    path: 'features/pdf-fingerprint',
    redirectTo: 'features/pdf/fingerprint',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/preflight',
    loadComponent: () => import('./features/pdf-preflight/pdf-preflight.page').then(m => m.PdfPreflightPage)
  },
  {
    path: 'features/pdf-preflight',
    redirectTo: 'features/pdf/preflight',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/inspect',
    loadComponent: () => import('./features/pdf-inspect/pdf-inspect.page').then(m => m.PdfInspectPage)
  },
  {
    path: 'features/pdf-inspect',
    redirectTo: 'features/pdf/inspect',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/signature-status',
    loadComponent: () => import('./features/pdf-signature-status/pdf-signature-status.page').then(m => m.PdfSignatureStatusPage)
  },
  {
    path: 'features/pdf/signatures',
    redirectTo: 'features/pdf/signature-status',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-signature-status',
    redirectTo: 'features/pdf/signature-status',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf/archival',
    loadComponent: () => import('./features/pdf-archival/pdf-archival.page').then(m => m.PdfArchivalPage)
  },
  {
    path: 'features/pdf-archival',
    redirectTo: 'features/pdf/archival',
    pathMatch: 'full'
  },
  {
    path: 'archival',
    redirectTo: 'features/pdf/archival',
    pathMatch: 'full'
  },
  {
    path: 'pdf-archival',
    redirectTo: 'features/pdf/archival',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-extractor',
    loadComponent: () => import('./features/pdf-extractor/pdf-extractor.page').then(m => m.PdfExtractorPage)
  },
  {
    path: 'features/qr-barcode',
    loadComponent: () => import('./features/qr-barcode/qr-barcode.page').then(m => m.QrBarcodePage)
  },
  {
    path: 'features/qr-barcode/batch',
    loadComponent: () => import('./features/qr-barcode-batch/qr-barcode-batch.page').then(m => m.QrBarcodeBatchPage)
  },
  {
    path: 'features/barcode-batch',
    redirectTo: 'features/qr-barcode/batch',
    pathMatch: 'full'
  },
  {
    path: 'qr-barcode/batch',
    redirectTo: 'features/qr-barcode/batch',
    pathMatch: 'full'
  },
  {
    path: 'features/pdf-intelligence',
    loadComponent: () => import('./features/pdf-intelligence/pdf-intelligence.page').then(m => m.PdfIntelligencePage)
  },
  {
    path: 'features/pdf/intelligence/extract-structured',
    loadComponent: () => import('./features/structured-extract/structured-extract.page').then(m => m.StructuredExtractPage)
  },
  {
    path: 'features/pdf/intelligence/contact-calendar',
    loadComponent: () => import('./features/contact-calendar/contact-calendar.page').then(m => m.ContactCalendarPage)
  },
  {
    path: 'features/pdf/intelligence/multi-qa',
    loadComponent: () => import('./features/multi-doc-qa/multi-doc-qa.page').then(m => m.MultiDocQaPage)
  },
  {
    path: 'features/pdf/intelligence/organize',
    loadComponent: () => import('./features/auto-organize/auto-organize.page').then(m => m.AutoOrganizePage)
  },
  {
    path: 'features/pdf/intelligence/entities',
    loadComponent: () => import('./features/entity-clause-extract/entity-clause-extract.page').then(m => m.EntityClauseExtractPage)
  },
  {
    path: 'features/pdf/intelligence/readability',
    loadComponent: () => import('./features/readability/readability.page').then(m => m.ReadabilityPage)
  },
  {
    path: 'features/pdf/intelligence/translation-reader',
    loadComponent: () => import('./features/translation-reader/translation-reader.page').then(m => m.TranslationReaderPage)
  },
  {
    path: 'features/pdf/accessibility',
    loadComponent: () => import('./features/pdf-accessibility/pdf-accessibility.page').then(m => m.PdfAccessibilityPage)
  },
  {
    path: 'features/accessibility',
    redirectTo: 'features/pdf/accessibility',
    pathMatch: 'full'
  },
  {
    path: 'pdf-accessibility',
    redirectTo: 'features/pdf/accessibility',
    pathMatch: 'full'
  },
  {
    path: 'features/translation-reader',
    redirectTo: 'features/pdf/intelligence/translation-reader',
    pathMatch: 'full'
  },
  {
    path: 'translation-reader',
    redirectTo: 'features/pdf/intelligence/translation-reader',
    pathMatch: 'full'
  },
  {
    path: 'features/readability',
    redirectTo: 'features/pdf/intelligence/readability',
    pathMatch: 'full'
  },
  {
    path: 'features/entity-clause-extract',
    redirectTo: 'features/pdf/intelligence/entities',
    pathMatch: 'full'
  },
  {
    path: 'features/entity-extract',
    redirectTo: 'features/pdf/intelligence/entities',
    pathMatch: 'full'
  },
  {
    path: 'features/auto-organize',
    redirectTo: 'features/pdf/intelligence/organize',
    pathMatch: 'full'
  },
  {
    path: 'features/organize',
    redirectTo: 'features/pdf/intelligence/organize',
    pathMatch: 'full'
  },
  {
    path: 'features/multi-doc-qa',
    redirectTo: 'features/pdf/intelligence/multi-qa',
    pathMatch: 'full'
  },
  {
    path: 'features/multi-qa',
    redirectTo: 'features/pdf/intelligence/multi-qa',
    pathMatch: 'full'
  },
  {
    path: 'features/structured-extract',
    redirectTo: 'features/pdf/intelligence/extract-structured',
    pathMatch: 'full'
  },
  {
    path: 'features/contact-calendar',
    redirectTo: 'features/pdf/intelligence/contact-calendar',
    pathMatch: 'full'
  },
  {
    path: 'qr-barcode',
    redirectTo: 'features/qr-barcode',
    pathMatch: 'full'
  },
  {
    path: 'qr',
    redirectTo: 'features/qr-barcode',
    pathMatch: 'full'
  },
  {
    path: 'barcode',
    redirectTo: 'features/qr-barcode',
    pathMatch: 'full'
  },
  {
    path: 'pdf-intelligence',
    redirectTo: 'features/pdf-intelligence',
    pathMatch: 'full'
  },
  {
    path: 'intelligence',
    redirectTo: 'features/pdf-intelligence',
    pathMatch: 'full'
  },
  {
    path: 'pdf-compare',
    redirectTo: 'features/pdf-compare',
    pathMatch: 'full'
  },
  {
    path: 'compare',
    redirectTo: 'features/pdf-compare',
    pathMatch: 'full'
  },
  {
    path: 'pdf-privacy-sanitizer',
    redirectTo: 'features/pdf-privacy-sanitizer',
    pathMatch: 'full'
  },
  {
    path: 'privacy-sanitizer',
    redirectTo: 'features/pdf-privacy-sanitizer',
    pathMatch: 'full'
  },
  {
    path: 'sanitizer',
    redirectTo: 'features/pdf-privacy-sanitizer',
    pathMatch: 'full'
  },
  {
    path: 'pdf-header-footer',
    redirectTo: 'features/pdf-header-footer',
    pathMatch: 'full'
  },
  {
    path: 'header-footer',
    redirectTo: 'features/pdf-header-footer',
    pathMatch: 'full'
  },
  {
    path: 'bates',
    redirectTo: 'features/pdf-header-footer/bates',
    pathMatch: 'full'
  },
  {
    path: 'bookmarks',
    redirectTo: 'features/pdf/bookmarks',
    pathMatch: 'full'
  },
  {
    path: 'page-labels',
    redirectTo: 'features/pdf/page-labels',
    pathMatch: 'full'
  },
  {
    path: 'labels',
    redirectTo: 'features/pdf/page-labels',
    pathMatch: 'full'
  },
  {
    path: 'navigation',
    redirectTo: 'features/pdf/navigation',
    pathMatch: 'full'
  },
  {
    path: 'pdf-repair',
    redirectTo: 'features/pdf-repair',
    pathMatch: 'full'
  },
  {
    path: 'repair',
    redirectTo: 'features/pdf-repair',
    pathMatch: 'full'
  },
  {
    path: 'pdf-extractor',
    redirectTo: 'features/pdf-extractor',
    pathMatch: 'full'
  },
  {
    path: 'extractor',
    redirectTo: 'features/pdf-extractor',
    pathMatch: 'full'
  },
  {
    path: 'pdf-ocr',
    redirectTo: 'features/pdf-ocr',
    pathMatch: 'full'
  },
  {
    path: 'ocr',
    redirectTo: 'features/pdf-ocr',
    pathMatch: 'full'
  },
  {
    path: 'ocr-handwriting',
    redirectTo: 'features/ocr/handwriting',
    pathMatch: 'full'
  },
  {
    path: 'ocr-correct',
    redirectTo: 'features/ocr/correct',
    pathMatch: 'full'
  },
  {
    path: 'ocr-table-to-excel',
    redirectTo: 'features/ocr/table-to-excel',
    pathMatch: 'full'
  },
  {
    path: 'table-to-excel',
    redirectTo: 'features/ocr/table-to-excel',
    pathMatch: 'full'
  },
  {
    path: 'document-scanner',
    redirectTo: 'features/document-scanner',
    pathMatch: 'full'
  },
  {
    path: 'scanner',
    redirectTo: 'features/document-scanner',
    pathMatch: 'full'
  },
  {
    path: 'document-validator',
    redirectTo: 'features/document-validator',
    pathMatch: 'full'
  },
  {
    path: 'validator',
    redirectTo: 'features/document-validator',
    pathMatch: 'full'
  },
  {
    path: 'fingerprint',
    redirectTo: 'features/pdf/fingerprint',
    pathMatch: 'full'
  },
  {
    path: 'pdf-fingerprint',
    redirectTo: 'features/pdf/fingerprint',
    pathMatch: 'full'
  },
  {
    path: 'preflight',
    redirectTo: 'features/pdf/preflight',
    pathMatch: 'full'
  },
  {
    path: 'pdf-preflight',
    redirectTo: 'features/pdf/preflight',
    pathMatch: 'full'
  },
  {
    path: 'inspect',
    redirectTo: 'features/pdf/inspect',
    pathMatch: 'full'
  },
  {
    path: 'pdf-inspect',
    redirectTo: 'features/pdf/inspect',
    pathMatch: 'full'
  },
  {
    path: 'signature-status',
    redirectTo: 'features/pdf/signature-status',
    pathMatch: 'full'
  },
  {
    path: 'signatures',
    redirectTo: 'features/pdf/signature-status',
    pathMatch: 'full'
  },
  {
    path: 'pdf-signatures',
    redirectTo: 'features/pdf/signature-status',
    pathMatch: 'full'
  },
  {
    path: 'features/history',
    loadComponent: () => import('./features/history/history.page').then(m => m.HistoryPage)
  },
  {
    path: 'features/batch',
    loadComponent: () => import('./features/batch/batch.page').then(m => m.BatchPage)
  },
  {
    path: 'features/batch-images',
    loadComponent: () => import('./features/batch/batch.page').then(m => m.BatchPage)
  },
  {
    path: 'batch-images',
    redirectTo: 'features/batch-images',
    pathMatch: 'full'
  },
  {
    path: 'features/batch-pdf',
    loadComponent: () => import('./features/batch-pdf/batch-pdf.page').then(m => m.BatchPdfPage)
  },
  {
    path: 'features/settings',
    loadComponent: () => import('./features/settings/settings.page').then(m => m.SettingsPage)
  },
  {
    path: 'features/settings/security-lock',
    loadComponent: () => import('./features/security-lock/security-lock.page').then(m => m.SecurityLockPage)
  },
  {
    path: 'features/security-lock',
    redirectTo: 'features/settings/security-lock',
    pathMatch: 'full'
  },
  {
    path: 'features/settings/app-lock',
    redirectTo: 'features/settings/security-lock',
    pathMatch: 'full'
  },
  {
    path: 'features/app-lock',
    redirectTo: 'features/settings/security-lock',
    pathMatch: 'full'
  },
  {
    path: 'features/privacy-policy',
    loadComponent: () => import('./features/privacy-policy/privacy-policy.page').then(m => m.PrivacyPolicyPage)
  },
  {
    path: 'features/terms-of-use',
    loadComponent: () => import('./features/terms-of-use/terms-of-use.page').then(m => m.TermsOfUsePage)
  },
  {
    path: 'features/local-data-storage',
    loadComponent: () => import('./features/local-data-storage/local-data-storage.page').then(m => m.LocalDataStoragePage)
  },
  {
    path: 'features/help-faq',
    loadComponent: () => import('./features/help-faq/help-faq.page').then(m => m.HelpFaqPage)
  },
  {
    path: 'features/contact-support',
    loadComponent: () => import('./features/contact-support/contact-support.page').then(m => m.ContactSupportPage)
  },
  {
    path: 'features/about-engine',
    loadComponent: () => import('./features/about-engine/about-engine.page').then(m => m.AboutEnginePage)
  },
  {
    path: 'privacy-policy',
    redirectTo: 'features/privacy-policy',
    pathMatch: 'full'
  },
  {
    path: 'terms-of-use',
    redirectTo: 'features/terms-of-use',
    pathMatch: 'full'
  },
  {
    path: 'local-data-storage',
    redirectTo: 'features/local-data-storage',
    pathMatch: 'full'
  },
  {
    path: 'help-faq',
    redirectTo: 'features/help-faq',
    pathMatch: 'full'
  },
  {
    path: 'contact-support',
    redirectTo: 'features/contact-support',
    pathMatch: 'full'
  },
  {
    path: 'about-engine',
    redirectTo: 'features/about-engine',
    pathMatch: 'full'
  },
  {
    // Optional sign-in. Premium that follows the person rather than the phone,
    // and the route support points someone at when a store purchase goes wrong.
    path: 'account',
    loadComponent: () => import('./features/account/account.page').then(m => m.AccountPage)
  },
  {
    path: 'features/account',
    redirectTo: 'account',
    pathMatch: 'full'
  },
  {
    path: 'features/premium',
    loadComponent: () => import('./features/premium/premium.page').then(m => m.PremiumPage)
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/profile/profile.page').then(m => m.ProfilePage)
  },
  {
    path: 'features/profile',
    redirectTo: 'profile',
    pathMatch: 'full'
  },
  {
    path: 'photo',
    redirectTo: 'features/photo',
    pathMatch: 'full'
  },
  {
    path: 'signature',
    redirectTo: 'features/signature',
    pathMatch: 'full'
  },
  {
    path: 'pdf',
    redirectTo: 'features/pdf',
    pathMatch: 'full'
  },
  {
    path: 'pdf-compress',
    redirectTo: 'features/pdf-compress',
    pathMatch: 'full'
  },
  {
    path: 'compress',
    redirectTo: 'features/pdf-compress',
    pathMatch: 'full'
  },
  {
    path: 'images-to-pdf',
    redirectTo: 'features/images-to-pdf',
    pathMatch: 'full'
  },
  {
    path: 'pdf-dashboard',
    redirectTo: 'features/pdf',
    pathMatch: 'full'
  },
  {
    path: 'pdf-merge',
    redirectTo: 'features/pdf/merge',
    pathMatch: 'full'
  },
  {
    path: 'merge',
    redirectTo: 'features/pdf/merge',
    pathMatch: 'full'
  },
  {
    path: 'pdf-split',
    redirectTo: 'features/pdf/split',
    pathMatch: 'full'
  },
  {
    path: 'split',
    redirectTo: 'features/pdf/split',
    pathMatch: 'full'
  },
  {
    path: 'pdf-organize',
    redirectTo: 'features/pdf/organize',
    pathMatch: 'full'
  },
  {
    path: 'pdf-organizer',
    redirectTo: 'features/pdf/organize',
    pathMatch: 'full'
  },
  {
    path: 'organize',
    redirectTo: 'features/pdf/organize',
    pathMatch: 'full'
  },
  {
    path: 'pdf-reader',
    redirectTo: 'features/pdf/editor',
    pathMatch: 'full'
  },
  {
    path: 'pdf-editor',
    redirectTo: 'features/pdf/editor',
    pathMatch: 'full'
  },
  {
    path: 'editor',
    redirectTo: 'features/pdf/editor',
    pathMatch: 'full'
  },
  {
    path: 'pdf-signing',
    redirectTo: 'features/pdf/sign',
    pathMatch: 'full'
  },
  {
    path: 'pdf-sign',
    redirectTo: 'features/pdf/sign',
    pathMatch: 'full'
  },
  {
    path: 'sign',
    redirectTo: 'features/pdf/sign',
    pathMatch: 'full'
  },
  {
    path: 'pdf-forms',
    redirectTo: 'features/pdf/forms',
    pathMatch: 'full'
  },
  {
    path: 'forms',
    redirectTo: 'features/pdf/forms',
    pathMatch: 'full'
  },
  {
    path: 'pdf-security',
    redirectTo: 'features/pdf/security',
    pathMatch: 'full'
  },
  {
    path: 'converter',
    redirectTo: 'features/pdf/conversion',
    pathMatch: 'full'
  },
  {
    path: 'conversion',
    redirectTo: 'features/pdf/conversion',
    pathMatch: 'full'
  },
  {
    path: 'batch',
    redirectTo: 'features/batch',
    pathMatch: 'full'
  },
  {
    path: 'batch-pdf',
    redirectTo: 'features/batch-pdf',
    pathMatch: 'full'
  },
  {
    path: 'presets',
    redirectTo: 'features/presets',
    pathMatch: 'full'
  },
  {
    path: 'history',
    redirectTo: 'features/history',
    pathMatch: 'full'
  },
  {
    path: 'settings',
    redirectTo: 'features/settings',
    pathMatch: 'full'
  },
  {
    path: 'premium',
    redirectTo: 'features/premium',
    pathMatch: 'full'
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: '404',
    loadComponent: () => import('./features/not-found/not-found.page').then(m => m.NotFoundPage)
  },
  {
    /*
     * An unmatched URL lands on a real page rather than bouncing to the
     * dashboard. Redirecting to home hid the mistake: a stale bookmark or a
     * typo looked like the app had simply reset itself.
     */
    path: '**',
    redirectTo: '404'
  }
];
