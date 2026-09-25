import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ProfileService } from '../../core/services/profile.service';
import { ToastService } from '../../core/services/toast.service';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  PrivacySupportNavComponent,
  AppButtonComponent
} from '../../shared/components/ui';

@Component({
  selector: 'app-contact-support',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './contact-support.page.html',
  styleUrls: ['./contact-support.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    PrivacySupportNavComponent,
    AppButtonComponent
  ]
})
export class ContactSupportPage implements OnInit {
  category = 'bug';
  name = '';
  email = '';
  subject = '';
  message = '';
  includeDiagnostics = true;

  isSubmitting = false;
  submittedTicketId: string | null = null;

  diagnostics = {
    appVersion: '1.0.0 (Build 2026.9)',
    engine: 'Client-Side WebAssembly (Zero-Server)',
    browser: '',
    platform: '',
    screenResolution: '',
    isOnline: true
  };

  readonly portalRequests = [
    { name: 'SSC CGL / CHSL', query: 'SSC CGL 2026 Photo & Signature Requirements' },
    { name: 'UPSC Civil Services', query: 'UPSC CSE 2026 Photo with Name & Date' },
    { name: 'IBPS PO / Clerk', query: 'IBPS Left Thumb Impression & Declaration Spec' },
    { name: 'NTA JEE / NEET', query: 'NTA Postcard Photo & Signature Specs' },
    { name: 'State PSCs (BPSC, UPPSC, MPSC)', query: 'State PSC Application Preset' }
  ];

  constructor(
    private profileService: ProfileService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.profileService.profile$.subscribe(p => {
      if (p?.displayName && !this.name && p.displayName !== 'Offline User') {
        this.name = p.displayName;
      }
      if (p?.email && !this.email) {
        this.email = p.email;
      }
    });

    if (typeof window !== 'undefined') {
      this.diagnostics.browser = navigator.userAgent;
      this.diagnostics.platform = navigator.platform;
      this.diagnostics.screenResolution = `${window.screen.width}x${window.screen.height}`;
      this.diagnostics.isOnline = navigator.onLine;
    }
  }

  quickRequestPortal(portalName: string): void {
    this.category = 'preset';
    this.subject = `Portal Spec Request: ${portalName}`;
    this.message = `Hi Support Team,\n\nPlease add or update the official upload specifications for ${portalName} in the Exam Presets tool.`;
    this.toastService.info(`Prefilled form for ${portalName}.`);
  }

  onSubmit(): void {
    if (!this.email || !this.message) {
      this.toastService.error('Please enter your email and message.');
      return;
    }

    this.isSubmitting = true;

    // Build mailto URI as a direct, zero-tracking communication method
    const diagText = this.includeDiagnostics
      ? `\n\n--- System Diagnostics (Anonymous) ---\nApp Version: ${this.diagnostics.appVersion}\nScreen: ${this.diagnostics.screenResolution}\nEngine: ${this.diagnostics.engine}\nPlatform: ${this.diagnostics.platform}`
      : '';

    const body = `${this.message}\n\nSender: ${this.name || 'Candidate'}\nEmail: ${this.email}${diagText}`;
    const mailtoUrl = `mailto:Officialpostflow360@gmail.com?subject=${encodeURIComponent(`[${this.category.toUpperCase()}] ${this.subject || 'Support Inquiry'}`)}&body=${encodeURIComponent(body)}`;

    setTimeout(() => {
      this.isSubmitting = false;
      const ticketId = 'IFH-' + Math.floor(100000 + Math.random() * 900000);
      this.submittedTicketId = ticketId;
      this.toastService.success(`Inquiry generated! Reference #${ticketId}`);

      // Open email client with pre-populated message
      window.location.href = mailtoUrl;
    }, 600);
  }

  resetForm(): void {
    this.submittedTicketId = null;
    this.subject = '';
    this.message = '';
  }
}
