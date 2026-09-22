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
