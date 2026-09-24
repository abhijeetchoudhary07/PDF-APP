import { Injectable, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';
import { TranslationService } from './translation.service';

export interface ToolItem {
  id: string;
  category: 'PHOTO' | 'SIGNATURE' | 'PDF' | 'CONVERT' | 'ORGANIZE' | 'EDIT' | 'SIGN' | 'PROTECT' | 'BATCH' | 'PRESETS';
  title: string;
  description: string;
  route: string;
  icon: string;
  color: string;
  badge?: string;
  keywords: string[];
  relatedIds: string[];
}

const RECENT_TOOLS_KEY = 'IFH_RECENT_TOOLS';
const FAVORITE_TOOLS_KEY = 'IFH_FAVORITE_TOOLS';

/**
 * The tool catalogue.
 *
 * Module-level rather than a class field so that the i18n suite can check
 * every id against the translation dictionaries without constructing the
 * service — which needs an Angular injection context and Capacitor storage
 * for what is a question about a static list. Nine tools shipped
 * untranslated in all five languages because nothing compared the two.
 */
const TOOL_CATALOGUE: ToolItem[] = [
    {
      id: 'photo_tools',
      category: 'PHOTO',
      title: 'Photo Tools',
      description: 'Compress, resize, and crop passport photos to exact KB and dimensions.',
      route: '/features/photo',
      icon: 'camera-outline',
      color: 'photo',
      keywords: ['photo', 'compress', 'resize', 'crop', 'image', 'passport', 'jpg', 'jpeg', 'png', 'kb', 'dimensions'],
      relatedIds: ['presets', 'signature_tools', 'batch_images', 'doc_converter']
    },
    {
      id: 'signature_tools',
      category: 'SIGNATURE',
      title: 'Signature Tools',
      description: 'Clean backgrounds, auto-crop, and compress signatures to exact specs.',
      route: '/features/signature',
      icon: 'create-outline',
      color: 'signature',
      keywords: ['signature', 'sign', 'clean background', 'crop', 'black ink', 'white background', 'contrast'],
      relatedIds: ['presets', 'photo_tools', 'doc_converter']
    },
    {
      id: 'pdf_compress',
      category: 'PDF',
      title: 'Compress PDF',
      description: 'Reduce PDF file size while maintaining readability.',
      route: '/features/pdf-compress',
      icon: 'contract-outline',
      color: 'pdf',
      keywords: ['pdf', 'compress', 'shrink', 'reduce size', 'kb', 'mb'],
      relatedIds: ['pdf_dashboard', 'pdf_merge', 'pdf_split']
    },
    {
      id: 'images_to_pdf',
      category: 'PDF',
      title: 'Images to PDF',
      description: 'Convert JPG, PNG, and WebP images into a single PDF document.',
      route: '/features/images-to-pdf',
      icon: 'images-outline',
      color: 'pdf',
      keywords: ['images to pdf', 'jpg to pdf', 'png to pdf', 'photos to pdf', 'combine images'],
      relatedIds: ['pdf_dashboard', 'pdf_compress', 'batch_images']
    },
    {
      id: 'pdf_extract',
      category: 'PDF',
      title: 'Extract Pages',
      description: 'Extract specific pages or page ranges from a PDF document.',
      route: '/features/pdf/extract',
      icon: 'document-text-outline',
      color: 'pdf',
      keywords: ['extract', 'pages', 'split pages', 'save pages', 'subset'],
      relatedIds: ['pdf_dashboard', 'pdf_split', 'pdf_organize']
    },
    {
      id: 'pdf_dashboard',
      category: 'PDF',
      title: 'PDF Studio',
      description: 'Complete PDF toolkit — view, edit, annotate, sign, and organize pages.',
      route: '/features/pdf',
      icon: 'document-attach-outline',
      color: 'pdf',
      badge: 'All-in-One',
      keywords: ['pdf', 'view', 'edit', 'annotate', 'sign', 'organize', 'pages', 'merge', 'split', 'rotate'],
      relatedIds: ['pdf_compress', 'images_to_pdf', 'pdf_security']
    },
    {
      id: 'pdf_merge',
      category: 'ORGANIZE',
      title: 'Merge PDF',
      description: 'Combine multiple PDF documents into a single organized file.',
      route: '/features/pdf/merge',
      icon: 'duplicate-outline',
      color: 'organize',
      keywords: ['merge', 'combine', 'join', 'append', 'multiple pdfs'],
      relatedIds: ['pdf_split', 'pdf_organize', 'pdf_dashboard']
    },
    {
      id: 'pdf_split',
      category: 'ORGANIZE',
      title: 'Split PDF',
      description: 'Split a PDF into multiple separate files by page ranges.',
      route: '/features/pdf/split',
      icon: 'cut-outline',
      color: 'organize',
      keywords: ['split', 'divide', 'separate', 'break', 'parts', 'ranges'],
      relatedIds: ['pdf_merge', 'pdf_extract', 'pdf_organize']
    },
    {
      id: 'pdf_organize',
      category: 'ORGANIZE',
      title: 'Organize Pages',
      description: 'Reorder, rotate, delete, and duplicate pages visually.',
      route: '/features/pdf/organize',
      icon: 'grid-outline',
      color: 'organize',
      keywords: ['organize', 'reorder', 'rotate', 'delete', 'duplicate', 'sort', 'pages'],
      relatedIds: ['pdf_merge', 'pdf_split', 'pdf_dashboard']
    },
    {
      id: 'pdf_reader',
      category: 'EDIT',
      title: 'PDF Reader & Editor',
      description: 'View and edit PDFs with zoom, thumbnails, text, and freehand tools.',
      route: '/features/pdf/editor',
      icon: 'book-outline',
      color: 'edit',
      keywords: ['reader', 'viewer', 'read', 'open pdf', 'view pages'],
      relatedIds: ['pdf_annotations', 'pdf_signing', 'pdf_dashboard']
    },
    {
      id: 'pdf_annotations',
      category: 'EDIT',
      title: 'Annotate PDF',
      description: 'Add text notes, highlights, freehand drawings, stamps, and shapes.',
      route: '/features/pdf/editor',
      icon: 'pencil-outline',
      color: 'edit',
      keywords: ['annotate', 'highlight', 'draw', 'stamp', 'notes', 'markup', 'shapes', 'arrow'],
      relatedIds: ['pdf_reader', 'pdf_signing', 'pdf_dashboard']
    },
    {
      id: 'pdf_signing',
      category: 'SIGN',
      title: 'Sign PDF',
      description: 'Add digital drawn signatures or signature images to your PDF pages.',
      route: '/features/pdf/sign',
      icon: 'pencil-sharp',
      color: 'sign',
      keywords: ['sign', 'signature', 'sign pdf', 'initial', 'date', 'draw signature'],
      relatedIds: ['signature_tools', 'pdf_reader', 'pdf_forms']
    },
    {
      id: 'pdf_forms',
      category: 'EDIT',
      title: 'Fill & Create Forms',
      description: 'Fill out interactive PDF forms or flatten form fields for submission.',
      route: '/features/pdf/forms',
      icon: 'clipboard-outline',
      color: 'edit',
      keywords: ['forms', 'fill form', 'form fields', 'acroform', 'flatten form', 'text fields'],
      relatedIds: ['pdf_reader', 'pdf_signing', 'pdf_security']
    },
    {
      id: 'pdf_security',
      category: 'PROTECT',
      title: 'Protect & Unlock PDF',
      description: 'Encrypt with password, set permissions, unlock, or sanitize metadata.',
      route: '/features/pdf/security',
      icon: 'lock-closed-outline',
      color: 'protect',
      keywords: ['security', 'password', 'encrypt', 'decrypt', 'unlock', 'permissions', 'sanitize', 'redact'],
      relatedIds: ['pdf_dashboard', 'pdf_forms']
    },
    {
      id: 'doc_converter',
      category: 'CONVERT',
      title: 'Document Converter',
      description: 'Convert between PDF, Word, Excel, PowerPoint, Text, and Images.',
      route: '/features/pdf/conversion',
      icon: 'swap-horizontal-outline',
      color: 'convert',
      keywords: ['convert', 'word to pdf', 'pdf to word', 'excel', 'powerpoint', 'pdf to image', 'docx', 'xlsx', 'pptx'],
      relatedIds: ['images_to_pdf', 'pdf_dashboard', 'batch_images']
    },
    {
      id: 'batch_images',
      category: 'BATCH',
      title: 'Batch Image Tools',
      description: 'Process hundreds of images at once — compress, resize, rename, format.',
      route: '/features/batch-images',
      icon: 'layers-outline',
      color: 'batch',
      badge: 'Fast',
      keywords: ['batch', 'bulk', 'multi image', 'mass compress', 'batch resize', 'rename'],
      relatedIds: ['photo_tools', 'images_to_pdf', 'doc_converter']
    },
    {
      id: 'presets',
      category: 'PRESETS',
      title: 'Exam & Job Presets',
      description: '1-click specs for SSC, UPSC, IBPS, GATE, CAT, State PSC, and exams.',
      route: '/features/presets',
      icon: 'school-outline',
      color: 'presets',
      badge: 'Popular',
      keywords: ['presets', 'ssc', 'upsc', 'ibps', 'gate', 'cat', 'railway', 'neet', 'job application', 'portal'],
      relatedIds: ['document_validator', 'photo_tools', 'signature_tools', 'pdf_dashboard']
    },
    {
      id: 'pdf_ocr',
      category: 'PDF',
      title: 'Smart PDF OCR',
      description: 'Recognize and extract text from scanned PDFs and images. Generate searchable PDFs with invisible text layer.',
      route: '/features/pdf-ocr',
      icon: 'scan-outline',
      color: 'pdf',
      badge: 'Local AI',
      keywords: ['ocr', 'text', 'extract text', 'searchable pdf', 'scanned pdf', 'hindi', 'bengali', 'marathi', 'punjabi', 'english', 'recognize'],
      relatedIds: ['document_scanner', 'pdf_dashboard', 'doc_converter', 'document_validator']
    },
    {
      id: 'document_scanner',
      category: 'PHOTO',
      title: 'Document Scanner',
      description: 'Scan multi-page documents with camera, auto-detect corners, perspective warp, and enhance text clarity.',
      route: '/features/document-scanner',
      icon: 'camera-outline',
      color: 'photo',
      badge: 'Auto Crop',
      keywords: ['scan', 'scanner', 'camera', 'document', 'edge detection', 'perspective', 'enhance', 'multipage', 'pdf'],
      relatedIds: ['pdf_ocr', 'photo_tools', 'pdf_dashboard', 'document_validator']
    },
    {
      id: 'document_validator',
      category: 'PRESETS',
      title: 'Exam Document Validator',
      description: 'Verify photos, signatures, and PDFs against SSC, UPSC, and portal requirements with 1-click auto-fix.',
      route: '/features/document-validator',
      icon: 'shield-checkmark-outline',
      color: 'presets',
      badge: '1-Click Fix',
      keywords: ['validate', 'validator', 'exam', 'ssc', 'upsc', 'ibps', 'check', 'portal', 'auto fix', 'requirements'],
      relatedIds: ['presets', 'photo_tools', 'signature_tools', 'pdf_ocr']
    },
    {
      id: 'pdf_compare',
      category: 'PDF',
      title: 'PDF Compare',
      description: 'Compare two PDFs side-by-side to detect additions, removals, and changes.',
      route: '/features/pdf-compare',
      icon: 'git-compare-outline',
      color: 'pdf',
      badge: 'Diff Checker',
      keywords: ['compare', 'diff', 'difference', 'compare pdf', 'changes', 'side by side', 'text diff', 'visual diff'],
      relatedIds: ['pdf_reader', 'pdf_dashboard', 'pdf_extractor']
    },
    {
      id: 'pdf_privacy_sanitizer',
      category: 'PROTECT',
      title: 'Privacy Sanitizer',
      description: 'Scan and remove metadata, comments, attachments, form data, scripts, and hidden layers.',
      route: '/features/pdf-privacy-sanitizer',
      icon: 'shield-outline',
      color: 'protect',
      badge: 'Deep Clean',
      keywords: ['privacy', 'sanitize', 'clean metadata', 'remove author', 'remove comments', 'strip attachments', 'remove forms', 'redact'],
      relatedIds: ['pdf_security', 'pdf_dashboard', 'pdf_repair']
    },
    {
      id: 'pdf_header_footer',
      category: 'EDIT',
      title: 'Header & Footer Studio',
      description: 'Add dynamic page numbers, dates, titles, and headers or footers across your PDF.',
      route: '/features/pdf-header-footer',
      icon: 'text-outline',
      color: 'edit',
      badge: 'Studio',
      keywords: ['header', 'footer', 'page numbers', 'numbering', 'date', 'title', 'studio', 'page n of m'],
      relatedIds: ['pdf_reader', 'pdf_organize', 'pdf_dashboard']
    },
    {
      id: 'pdf_repair',
      category: 'PDF',
      title: 'PDF Repair & Recovery',
      description: 'Diagnose damaged or corrupted PDFs and safely recover readable pages and structures.',
      route: '/features/pdf-repair',
      icon: 'medkit-outline',
      color: 'pdf',
      badge: 'Diagnostic',
      keywords: ['repair', 'recovery', 'fix pdf', 'corrupt pdf', 'damaged', 'unreadable', 'salvage', 'restore'],
      relatedIds: ['pdf_dashboard', 'pdf_security', 'pdf_extractor']
    },
    {
      id: 'pdf_extractor',
      category: 'CONVERT',
      title: 'PDF Content Extractor',
      description: 'Extract text, embedded images, tables, pages, and attachments in one unified tool.',
      route: '/features/pdf-extractor',
      icon: 'file-tray-full-outline',
      color: 'convert',
      badge: 'All-in-One',
      keywords: ['extract', 'extractor', 'extract images', 'extract text', 'extract tables', 'csv', 'xlsx', 'zip', 'attachments'],
      relatedIds: ['pdf_ocr', 'pdf_intelligence', 'doc_converter', 'pdf_compare', 'pdf_organize']
    },
    {
      id: 'qr_barcode',
      category: 'PDF',
      title: 'QR Code & Barcode Toolkit',
      description: 'Scan and decode codes from camera, images, and PDF pages, or generate custom QR codes.',
      route: '/features/qr-barcode',
      icon: 'qr-code-outline',
      color: 'pdf',
      badge: 'Scan & Gen',
      keywords: ['qr', 'barcode', 'scan qr', 'generate qr', 'code 128', 'ean 13', 'upc', 'pdf417', 'decode', 'wifi qr'],
      relatedIds: ['document_scanner', 'pdf_dashboard', 'pdf_intelligence', 'pdf_extractor']
    },
    {
      id: 'pdf_intelligence',
      category: 'PDF',
      title: 'PDF Intelligence & Translation',
      description: 'Summarize documents, grounded question answering with page citations, and 5-language translation.',
      route: '/features/pdf-intelligence',
      icon: 'bulb-outline',
      color: 'pdf',
      badge: '100% Private',
      keywords: ['intelligence', 'summarize', 'summary', 'translate', 'qa', 'question answering', 'citations', 'hindi', 'marathi', 'bengali', 'punjabi', 'ai'],
      relatedIds: ['pdf_ocr', 'pdf_extractor', 'qr_barcode', 'pdf_compare']
    }
];

/** Every registered tool id, for coverage checks over `tools.<id>` keys. */
export const TOOL_IDS: readonly string[] = TOOL_CATALOGUE.map(tool => tool.id);

@Injectable({
  providedIn: 'root'
})
export class ToolRegistryService {
  private readonly rawTools: ToolItem[] = TOOL_CATALOGUE;

  /**
   * The catalogue's ids, as a plain array.
   *
   * Exposed so the i18n suite can check that every tool has a `tools.<id>`
   * entry without constructing the service — which would pull in Capacitor
   * Preferences and an Angular injector for what is a question about a static
   * list. Nine tools shipped untranslated in every language because nothing
   * compared these two things.
   */
  get toolIds(): string[] {
    return this.rawTools.map(tool => tool.id);
  }

  public recentTools$ = new BehaviorSubject<ToolItem[]>([]);
  public favoriteTools$ = new BehaviorSubject<ToolItem[]>([]);

  private recentIds: string[] = [];
  private favoriteIds: string[] = [];
  private translationService = inject(TranslationService, { optional: true }) ?? new TranslationService();

  constructor() {
    this.initStoredLists();
    this.translationService.currentLang$.subscribe(() => {
      this.updateRecentToolsSubject();
      this.updateFavoriteToolsSubject();
    });
  }

  get tools(): ToolItem[] {
    return this.rawTools.map(t => this.localizeTool(t));
  }

  private localizeTool(tool: ToolItem): ToolItem {
    const titleKey = `tools.${tool.id}.title`;
    const descKey = `tools.${tool.id}.description`;

    const translatedTitle = this.translationService.translate(titleKey);
    const translatedDesc = this.translationService.translate(descKey);

    return {
      ...tool,
      title: translatedTitle !== titleKey ? translatedTitle : tool.title,
      description: translatedDesc !== descKey ? translatedDesc : tool.description
    };
  }

  private async initStoredLists() {
    try {
      const recentsRes = await Preferences.get({ key: RECENT_TOOLS_KEY });
      if (recentsRes.value) {
        this.recentIds = JSON.parse(recentsRes.value);
        this.updateRecentToolsSubject();
      }

      const favsRes = await Preferences.get({ key: FAVORITE_TOOLS_KEY });
      if (favsRes.value) {
        this.favoriteIds = JSON.parse(favsRes.value);
        this.updateFavoriteToolsSubject();
      }
    } catch (e) {
      console.warn('Failed to load tool preferences', e);
    }
  }

  getToolById(id: string): ToolItem | undefined {
    return this.tools.find(t => t.id === id);
  }

  getToolByRoute(route: string): ToolItem | undefined {
    return this.tools.find(t => t.route === route || route.startsWith(t.route));
  }

  search(query: string): ToolItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return this.tools.filter(t => {
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.keywords.some(k => k.toLowerCase().includes(q))
      );
    });
  }

  getRelatedTools(toolIdOrCategory: string, limit: number = 4): ToolItem[] {
    const current = this.getToolById(toolIdOrCategory) || this.tools.find(t => t.category === toolIdOrCategory);
    if (!current) {
      return this.tools.slice(0, limit);
    }

    // First pick from specific relatedIds
    const explicitRelated = current.relatedIds
      .map(id => this.getToolById(id))
      .filter((t): t is ToolItem => !!t);

    if (explicitRelated.length >= limit) {
      return explicitRelated.slice(0, limit);
    }

    // Fill remaining with same category or other tools
    const otherTools = this.tools.filter(
      t => t.id !== current.id && !explicitRelated.some(r => r.id === t.id)
    );

    return [...explicitRelated, ...otherTools].slice(0, limit);
  }

  async recordToolUsage(toolId: string): Promise<void> {
    const tool = this.getToolById(toolId);
    if (!tool) return;

    this.recentIds = [toolId, ...this.recentIds.filter(id => id !== toolId)].slice(0, 6);
    this.updateRecentToolsSubject();

    await Preferences.set({
      key: RECENT_TOOLS_KEY,
      value: JSON.stringify(this.recentIds)
    });
  }

  async toggleFavorite(toolId: string): Promise<boolean> {
    const exists = this.favoriteIds.includes(toolId);
    if (exists) {
      this.favoriteIds = this.favoriteIds.filter(id => id !== toolId);
    } else {
      this.favoriteIds = [...this.favoriteIds, toolId];
    }

    this.updateFavoriteToolsSubject();

    await Preferences.set({
      key: FAVORITE_TOOLS_KEY,
      value: JSON.stringify(this.favoriteIds)
    });

    return !exists;
  }

  isFavorite(toolId: string): boolean {
    return this.favoriteIds.includes(toolId);
  }

  private updateRecentToolsSubject() {
    const items = this.recentIds
      .map(id => this.getToolById(id))
      .filter((t): t is ToolItem => !!t);
    this.recentTools$.next(items);
  }

  private updateFavoriteToolsSubject() {
    const items = this.favoriteIds
      .map(id => this.getToolById(id))
      .filter((t): t is ToolItem => !!t);
    this.favoriteTools$.next(items);
  }
}
