import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  PrivacySupportNavComponent,
  AppButtonComponent
} from '../../shared/components/ui';

export interface FaqItem {
  id: string;
  category: 'photo' | 'pdf' | 'exam' | 'security' | 'troubleshooting';
  question: string;
  answer: string;
  isOpen?: boolean;
}

@Component({
  selector: 'app-help-faq',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './help-faq.page.html',
  styleUrls: ['./help-faq.page.scss'],
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
export class HelpFaqPage {
  searchQuery = '';
  selectedCategory = 'all';

  readonly categories = [
    { id: 'all', label: 'All Questions' },
    { id: 'photo', label: 'Photo & Signature' },
    { id: 'pdf', label: 'PDF Tools' },
    { id: 'exam', label: 'Exam Portal Specs' },
    { id: 'security', label: 'Security & Offline' },
    { id: 'troubleshooting', label: 'Troubleshooting' }
  ];

  faqs: FaqItem[] = [
    {
      id: 'faq-1',
      category: 'photo',
      question: 'How do I compress a photo to an exact KB (e.g. 20 KB to 50 KB)?',
      answer: 'Go to Photo Compress, choose your photo, and enter your target size (e.g. 50 KB). Our engine uses an iterative bisection algorithm that tests quality levels in memory until the output matches your exact KB target without excessive blurring.',
      isOpen: true
    },
    {
      id: 'faq-2',
      category: 'photo',
      question: 'How do I remove the yellowish or grey paper background from my signature?',
      answer: 'Use the Signature Cleanup tool. It features adaptive thresholding and contrast enhancement designed specifically for pen-and-paper signatures. You can adjust the threshold slider and toggle "Transparent Background" to output a crisp black signature on transparent or white PNG.',
      isOpen: false
    },
    {
      id: 'faq-3',
      category: 'exam',
      question: 'Why does the recruitment portal reject my photo or signature dimensions?',
      answer: 'Many portals (such as SSC, UPSC, and IBPS) require strict pixel dimensions in addition to KB size (e.g. 200x230 pixels for passport photos, 140x60 pixels for signatures). Use the "Presets" tool or the dimension lock in Photo Tools to set exact pixel width and height before downloading.',
      isOpen: false
    },
    {
      id: 'faq-4',
      category: 'pdf',
      question: 'How can I merge multiple certificates or marksheets into a single PDF under 500 KB?',
      answer: 'Use the PDF Organizer & Merge tool to arrange your documents in order and merge them into one file. Then, pass the resulting file into the PDF Compress tool and enter 500 KB to optimize the images and stream objects to your target size.',
      isOpen: false
    },
    {
      id: 'faq-5',
      category: 'security',
      question: 'Are my confidential documents uploaded to any remote server?',
      answer: 'Absolutely not. Indian Form Helper is 100% client-side. Every operation runs inside your browser sandbox via WebAssembly and Canvas 2D. You can even disconnect your internet entirely and every tool will continue to work.',
      isOpen: false
    },
    {
      id: 'faq-6',
      category: 'pdf',
      question: 'Can I sign a PDF offline and place multiple signatures on different pages?',
      answer: 'Yes! Navigate to the PDF Sign tool. You can draw your signature, upload a signature image, or reuse saved signatures. Drag, resize, rotate, and burn them permanently into any page with zero data leaving your device.',
      isOpen: false
    },
    {
      id: 'faq-7',
      category: 'pdf',
      question: 'What document formats can I convert to PDF without Microsoft Office?',
      answer: 'Our Document Converter supports Word (.docx), Excel (.xlsx), PowerPoint (.pptx), text (.txt), and image formats (.jpg, .png, .webp). The conversion is performed directly in client-side JavaScript without requiring external software.',
      isOpen: false
    },
    {
      id: 'faq-8',
      category: 'troubleshooting',
      question: 'My uploaded PDF gives a "Password Protected" warning. How can I edit it?',
      answer: 'Use the PDF Security tool with "Unlock" mode. Enter the document password once, and the engine will decrypt and export an unencrypted copy so you can compress, merge, or reorder pages freely.',
      isOpen: false
    },
    {
      id: 'faq-9',
      category: 'security',
      question: 'How do I restore my Lifetime PRO purchase on a new device or browser?',
      answer: 'Go to Settings & Preferences and click "Restore Purchases". If you purchased on Android (Google Play) or iOS (App Store), your active license will sync automatically through the store account logged in on your device.',
      isOpen: false
    }
  ];

  get filteredFaqs(): FaqItem[] {
    return this.faqs.filter(f => {
      const matchesCat = this.selectedCategory === 'all' || f.category === this.selectedCategory;
      if (!this.searchQuery.trim()) return matchesCat;
      const q = this.searchQuery.toLowerCase();
      const matchesQuery = f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }

  toggleFaq(faq: FaqItem): void {
    faq.isOpen = !faq.isOpen;
  }
}
