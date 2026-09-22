import { Injectable } from '@angular/core';
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

@Injectable({
  providedIn: 'root'
})
export class ToolRegistryService {
  private readonly rawTools: ToolItem[] = [
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
      keywords: ['signature', 'sign', 'clean', 'crop', 'background', 'black and white', 'contrast', 'compress', 'kb'],
      relatedIds: ['sign_pdf', 'photo_tools', 'presets', 'signature_request']
    },
    {
      id: 'pdf_dashboard',
      category: 'PDF',
      title: 'PDF Tools Hub',
      description: 'Compress to exact KB, convert images to PDF, and extract pages.',
      route: '/features/pdf',
      icon: 'document-text-outline',
      color: 'pdf',
      keywords: ['pdf', 'compress', 'reduce', 'shrink', 'target size', 'kb', 'image to pdf'],
      relatedIds: ['pdf_organize', 'doc_converter', 'sign_pdf', 'pdf_protect', 'batch_pdf']
    },
    {
      id: 'doc_converter',
      category: 'CONVERT',
      title: 'Document Converter',
      description: 'Convert PDF to Word, Excel, PPT, PNG, PDF/A, and compile office files to PDF.',
      route: '/features/pdf/conversion',
      icon: 'sync-outline',
      color: 'convert',
      badge: '15+ Formats',
      keywords: ['convert', 'conversion', 'word', 'docx', 'excel', 'xlsx', 'powerpoint', 'pptx', 'pdf to jpg', 'pdf to png', 'pdf/a', 'txt'],
      relatedIds: ['pdf_dashboard', 'pdf_organize', 'pdf_editor', 'pdf_flatten']
    },
    {
      id: 'pdf_organize',
      category: 'ORGANIZE',
      title: 'PDF Page Organizer',
      description: 'Visually rearrange, merge multiple files, split, rotate, and delete pages.',
      route: '/features/pdf/organize',
      icon: 'grid-outline',
      color: 'organize',
      keywords: ['organize', 'merge', 'combine', 'split', 'rotate', 'delete pages', 'extract', 'reorder'],
      relatedIds: ['pdf_dashboard', 'doc_converter', 'pdf_editor', 'pdf_protect']
    },
    {
      id: 'pdf_editor',
      category: 'EDIT',
      title: 'PDF Reader & Editor',
      description: 'Annotate, draw, highlight, crop pages, add watermarks, and securely redact.',
      route: '/features/pdf/editor',
      icon: 'color-palette-outline',
      color: 'edit',
      keywords: ['editor', 'edit', 'annotate', 'draw', 'highlight', 'watermark', 'redact', 'text', 'crop'],
      relatedIds: ['sign_pdf', 'pdf_forms', 'pdf_flatten', 'pdf_organize']
    },
    {
      id: 'sign_pdf',
      category: 'SIGN',
      title: 'Sign PDF',
      description: 'Draw, upload, or reuse signatures with interactive positioning, rotation, and multi-signing.',
      route: '/features/pdf/sign',
      icon: 'pencil-outline',
      color: 'sign',
      keywords: ['sign', 'signature', 'sign pdf', 'place signature', 'stamp', 'initials'],
      relatedIds: ['signature_tools', 'signature_request', 'pdf_forms', 'pdf_protect']
    },
    {
      id: 'signature_request',
      category: 'SIGN',
      title: 'Request Signatures',
      description: 'Prepare multi-party signing workflows, configure recipients, and export manifests.',
      route: '/features/pdf/signature-request',
      icon: 'send-outline',
      color: 'sign',
      keywords: ['request signatures', 'multi-party', 'recipients', 'audit trail', 'manifest'],
      relatedIds: ['sign_pdf', 'signature_tools', 'pdf_protect']
    },
    {
      id: 'pdf_forms',
      category: 'SIGN',
      title: 'PDF Form Filler',
      description: 'Fill native AcroForms or place text, checkbox, and date entries manually.',
      route: '/features/pdf/forms',
      icon: 'reader-outline',
      color: 'sign',
      keywords: ['form', 'fill', 'acroform', 'checkbox', 'text field', 'date', 'application form'],
      relatedIds: ['sign_pdf', 'pdf_flatten', 'pdf_editor']
    },
    {
      id: 'pdf_protect',
      category: 'PROTECT',
      title: 'Protect PDF',
      description: 'Encrypt documents with passwords and customize print/copy/edit permissions.',
      route: '/features/pdf/protect',
      icon: 'lock-closed-outline',
      color: 'security',
      keywords: ['protect', 'lock', 'password', 'encrypt', 'permissions', 'security'],
      relatedIds: ['pdf_unlock', 'pdf_dashboard', 'sign_pdf', 'pdf_flatten']
    },
    {
      id: 'pdf_unlock',
      category: 'PROTECT',
      title: 'Unlock PDF',
      description: 'Remove passwords and permissions restrictions from authorized documents.',
      route: '/features/pdf/unlock',
      icon: 'lock-open-outline',
      color: 'security',
      keywords: ['unlock', 'decrypt', 'remove password', 'strip security'],
      relatedIds: ['pdf_protect', 'pdf_dashboard', 'pdf_organize']
    },
    {
      id: 'pdf_flatten',
      category: 'PROTECT',
      title: 'Flatten PDF',
      description: 'Make form fields, annotations, and overlays into permanent static content.',
      route: '/features/pdf/flatten',
      icon: 'layers-outline',
      color: 'security',
      keywords: ['flatten', 'static', 'lock fields', 'rasterize', 'burn in annotations'],
      relatedIds: ['pdf_forms', 'sign_pdf', 'pdf_editor', 'pdf_protect']
    },
    {
      id: 'batch_images',
      category: 'BATCH',
      title: 'Batch Image Processing',
      description: 'Resize and compress multiple photos or signatures simultaneously.',
      route: '/features/batch',
      icon: 'images-outline',
      color: 'batch',
      keywords: ['batch', 'multiple', 'bulk', 'bulk photos', 'batch compress', 'bulk resize'],
      relatedIds: ['photo_tools', 'signature_tools', 'batch_pdf', 'presets']
    },
    {
      id: 'batch_pdf',
      category: 'BATCH',
      title: 'Batch PDF Processing',
      description: 'Batch compress, convert, and protect multiple PDF documents in one click.',
      route: '/features/batch-pdf',
      icon: 'documents-outline',
      color: 'batch',
      keywords: ['batch pdf', 'bulk pdf', 'multiple pdfs', 'batch compress pdf'],
      relatedIds: ['pdf_dashboard', 'batch_images', 'pdf_organize']
    },
    {
      id: 'presets',
      category: 'PRESETS',
      title: 'Exam & Job Presets',
      description: 'Pre-configured dimensions and KB limits for SSC, UPSC, IBPS, and state portals.',
      route: '/features/presets',
      icon: 'bookmark-outline',
      color: 'presets',
      keywords: ['presets', 'ssc', 'upsc', 'ibps', 'gate', 'cat', 'railway', 'neet', 'job application', 'portal'],
      relatedIds: ['photo_tools', 'signature_tools', 'pdf_dashboard']
    }
  ];

  public recentTools$ = new BehaviorSubject<ToolItem[]>([]);
  public favoriteTools$ = new BehaviorSubject<ToolItem[]>([]);

  private recentIds: string[] = [];
  private favoriteIds: string[] = [];
  private translationService: TranslationService;

  constructor(translationService?: TranslationService) {
    this.translationService = translationService || new TranslationService();
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
