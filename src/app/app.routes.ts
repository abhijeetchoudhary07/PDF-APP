import { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then( m => m.HomePageModule)
  },
  {
    path: 'features/photo',
    loadComponent: () => import('./features/photo/photo.page').then(m => m.PhotoPage)
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
    path: 'features/pdf/forms',
    loadComponent: () => import('./features/pdf-forms/pdf-forms.page').then(m => m.PdfFormsPage)
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
    loadComponent: () => import('./features/pdf-security/pdf-security.page').then(m => m.PdfSecurityPage),
    data: { mode: 'protect' }
  },
  {
    path: 'features/pdf/flatten',
    loadComponent: () => import('./features/pdf-flatten/pdf-flatten.page').then(m => m.PdfFlattenPage)
  },
  {
    path: 'features/pdf/signature-request',
    loadComponent: () => import('./features/signature-request/signature-request.page').then(m => m.SignatureRequestPage)
  },
  {
    path: 'features/presets',
    loadComponent: () => import('./features/presets/presets.page').then(m => m.PresetsPage)
  },
  {
    path: 'features/pdf-ocr',
    loadComponent: () => import('./features/pdf-ocr/pdf-ocr.page').then(m => m.PdfOcrPage)
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
    path: 'features/pdf-privacy-sanitizer',
    loadComponent: () => import('./features/pdf-privacy-sanitizer/pdf-privacy-sanitizer.page').then(m => m.PdfPrivacySanitizerPage)
  },
  {
    path: 'features/pdf-header-footer',
    loadComponent: () => import('./features/pdf-header-footer/pdf-header-footer.page').then(m => m.PdfHeaderFooterPage)
  },
  {
    path: 'features/pdf-repair',
    loadComponent: () => import('./features/pdf-repair/pdf-repair.page').then(m => m.PdfRepairPage)
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
    path: 'features/pdf-intelligence',
    loadComponent: () => import('./features/pdf-intelligence/pdf-intelligence.page').then(m => m.PdfIntelligencePage)
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
    path: 'features/history',
    loadComponent: () => import('./features/history/history.page').then(m => m.HistoryPage)
  },
  {
    path: 'features/batch',
    loadComponent: () => import('./features/batch/batch.page').then(m => m.BatchPage)
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
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
];
