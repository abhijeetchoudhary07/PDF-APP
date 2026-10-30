import { Injectable, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';
import { TranslationService } from './translation.service';

export interface ToolItem {
  id: string;
  category: 'PHOTO' | 'SIGNATURE' | 'PDF' | 'CONVERT' | 'ORGANIZE' | 'EDIT' | 'SIGN' | 'PROTECT' | 'BATCH' | 'PRESETS' | 'intelligence' | 'INTELLIGENCE' | 'scanner' | 'SCANNER' | 'recipes' | 'RECIPES' | 'tools' | 'TOOLS';
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
      relatedIds: ['presets', 'signature_tools', 'batch_images', 'doc_converter', 'id_photo']
    },
    {
      id: 'id_photo',
      category: 'PHOTO',
      title: 'ID & Passport Photo Studio',
      description: 'Face detection, head-height ratio crop, background replacement, and print sheets.',
      route: '/features/photo/id-photo',
      icon: 'person-outline',
      color: 'photo',
      badge: 'Smart Crop',
      keywords: ['id photo', 'passport photo', 'face detection', 'head ratio', 'background replacement', 'print sheet', 'cut marks', 'crop', 'dimensions'],
      relatedIds: ['photo_tools', 'image_blur', 'photo_enhance', 'document_cutout']
    },
    {
      id: 'image_blur',
      category: 'PHOTO',
      title: 'Blur & Redact Image',
      description: 'Blur or pixelate faces, license plates, and sensitive details permanently.',
      route: '/features/photo/blur',
      icon: 'eye-off-outline',
      color: 'photo',
      badge: 'Privacy',
      keywords: ['blur', 'pixelate', 'redact', 'hide details', 'face blur', 'license plate', 'privacy', 'censor'],
      relatedIds: ['photo_tools', 'id_photo', 'document_cutout', 'pdf_privacy_sanitizer']
    },
    {
      id: 'document_cutout',
      category: 'PHOTO',
      title: 'Document Background Cutout',
      description: 'Remove paper background from documents and signatures for a transparent PNG.',
      route: '/features/photo/cutout',
      icon: 'cut-outline',
      color: 'photo',
      keywords: ['cutout', 'transparent png', 'background removal', 'signature cutout', 'document cutout', 'plain background', 'ink preserve'],
      relatedIds: ['signature_tools', 'photo_tools', 'id_photo', 'image_blur']
    },
    {
      id: 'photo_enhance',
      category: 'PHOTO',
      title: 'Upscale & Enhance',
      description: 'Sharpen low-resolution scans and text photos with bicubic scaling and unsharp masking.',
      route: '/features/photo/enhance',
      icon: 'sparkles-outline',
      color: 'photo',
      keywords: ['enhance', 'upscale', 'sharpen', 'bicubic', 'unsharp mask', 'resolution', 'text clarity', 'scan enhance'],
      relatedIds: ['photo_tools', 'id_photo', 'document_scanner', 'document_cutout']
    },
    {
      id: 'photo_metadata',
      category: 'PHOTO',
      title: 'Image Metadata & Date Repair',
      description: 'View EXIF, camera specs, GPS coordinates, and shift capture timestamps.',
      route: '/features/photo/metadata',
      icon: 'time-outline',
      color: 'photo',
      keywords: ['metadata', 'exif', 'gps', 'camera', 'date repair', 'timestamp', 'clock drift', 'strip exif'],
      relatedIds: ['photo_tools', 'photo_watermark', 'id_photo', 'pdf_privacy_sanitizer']
    },
    {
      id: 'photo_watermark',
      category: 'PHOTO',
      title: 'Photo Watermark',
      description: 'Add custom text or logo watermarks with 9-point anchors, continuous tiling, and presets.',
      route: '/features/photo/watermark',
      icon: 'water-outline',
      color: 'photo',
      keywords: ['watermark', 'text watermark', 'logo watermark', 'tile watermark', 'confidential', 'sample', 'draft'],
      relatedIds: ['photo_tools', 'photo_metadata', 'photo_sheet', 'pdf_header_footer']
    },
    {
      id: 'photo_sheet',
      category: 'PHOTO',
      title: 'Photo Sheet Layout',
      description: 'Arrange multiple photos onto A4 or 4x6 print sheets with cut marks and PDF export.',
      route: '/features/photo/sheet',
      icon: 'grid-outline',
      color: 'photo',
      keywords: ['photo sheet', 'print sheet', 'a4', '4x6', 'grid layout', 'cut marks', 'passport sheet', 'tiling'],
      relatedIds: ['photo_tools', 'id_photo', 'photo_watermark', 'images_to_pdf']
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
      description: '1-click pixel and KB sizes for common upload forms.',
      route: '/features/presets',
      icon: 'school-outline',
      color: 'presets',
      badge: 'Popular',
      keywords: ['presets', 'ssc', 'upsc', 'ibps', 'gate', 'cat', 'railway', 'neet', 'job application', 'portal'],
      relatedIds: ['document_validator', 'photo_tools', 'signature_tools', 'pdf_dashboard', 'preset-builder', 'profile-transfer', 'preset-batch-check']
    },
    {
      id: 'preset-builder',
      category: 'PRESETS',
      title: 'Preset Builder from Instructions',
      description: 'Scan or OCR guideline sheets to automatically extract dimension, file size, and format specification profiles.',
      route: '/features/presets/builder',
      icon: 'preset-builder',
      color: 'presets',
      badge: 'Smart OCR',
      keywords: ['preset builder', 'instruction', 'guidelines', 'extract specs', 'ocr preset', 'upload instructions', 'rules'],
      relatedIds: ['presets', 'pdf_ocr', 'document_validator', 'profile-transfer', 'preset-batch-check']
    },
    {
      id: 'profile-transfer',
      category: 'PRESETS',
      title: 'Profile Transfer & JSON Sync',
      description: 'Export, share, and import specification profiles as standardized versioned JSON files.',
      route: '/features/presets/manage',
      icon: 'profile-json',
      color: 'presets',
      badge: 'JSON Schema',
      keywords: ['profile transfer', 'export preset', 'import preset', 'json profile', 'share preset', 'backup preset'],
      relatedIds: ['presets', 'preset-builder', 'preset-batch-check']
    },
    {
      id: 'preset-batch-check',
      category: 'PRESETS',
      title: 'Batch Profile Compliance Check',
      description: 'Audit multiple documents and photos against a selected profile with 1-click batch auto-fixing.',
      route: '/features/presets/batch-check',
      icon: 'batch-check',
      color: 'presets',
      badge: '1-Click Fix',
      keywords: ['batch check', 'profile compliance', 'auto-fix', 'audit scorecard', 'resize batch', 'compress batch', 'portal requirements'],
      relatedIds: ['presets', 'preset-builder', 'profile-transfer']
    },
    {
      id: 'recipe-editor',
      category: 'recipes',
      title: 'Recipe Pipeline Editor',
      description: 'Chain multiple PDF tools into an automated single-tap workflow.',
      route: '/features/recipes/editor',
      icon: 'recipe-pipeline',
      color: 'batch',
      badge: 'Automation',
      keywords: ['recipe', 'pipeline', 'workflow', 'automate', 'chain', 'multi-step', 'sequential'],
      relatedIds: ['recipe-batch', 'pdf_organize', 'batch_convert', 'preset-batch-check']
    },
    {
      id: 'recipe-batch',
      category: 'recipes',
      title: 'Batch Recipe Runner',
      description: 'Run automated recipe pipelines across multiple PDF documents with fault tolerance and starter recipes.',
      route: '/features/recipes/batch',
      icon: 'recipe-batch',
      color: 'batch',
      badge: 'Batch',
      keywords: ['recipe batch', 'batch runner', 'starter recipes', 'pipeline batch', 'multi-file automation', 'workflow queue'],
      relatedIds: ['recipe-editor', 'preset-batch-check', 'pdf_organize']
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
      relatedIds: ['document_scanner', 'pdf_dashboard', 'doc_converter', 'ocr-handwriting']
    },
    {
      id: 'ocr-handwriting',
      category: 'PDF',
      title: 'Handwriting OCR',
      description: 'Recognize handwritten notes, forms, and signatures with side-by-side visual verification.',
      route: '/features/ocr/handwriting',
      icon: 'pen-tool',
      color: 'pdf',
      badge: 'Handwriting',
      keywords: ['handwriting', 'handwritten', 'notes', 'pen', 'pencil', 'ocr', 'signatures', 'sauvola', 'split view', 'extract text'],
      relatedIds: ['pdf_ocr', 'document_scanner', 'signature_tools', 'ocr-confidence']
    },
    {
      id: 'ocr-confidence',
      category: 'PDF',
      title: 'OCR Confidence & Dictionary',
      description: 'Audit word confidence heatmaps, correct misreads, and build a persistent OCR correction dictionary.',
      route: '/features/ocr/correct',
      icon: 'spellcheck',
      color: 'pdf',
      badge: 'Heatmap',
      keywords: ['ocr', 'confidence', 'audit', 'heatmap', 'dictionary', 'correction', 'spellcheck', 'replace', 'accuracy'],
      relatedIds: ['pdf_ocr', 'ocr-handwriting', 'scanned-table-ocr', 'doc_converter']
    },
    {
      id: 'scanned-table-ocr',
      category: 'PDF',
      title: 'Table OCR to Excel',
      description: 'Detect tabular layouts in photos and scans, OCR individual cells, and export directly to Excel (.xlsx) and CSV.',
      route: '/features/ocr/table-to-excel',
      icon: 'table-excel',
      color: 'pdf',
      badge: 'Excel',
      keywords: ['table', 'excel', 'xlsx', 'csv', 'table ocr', 'spreadsheet', 'grid', 'receipt', 'invoice', 'scanned table'],
      relatedIds: ['pdf_ocr', 'ocr-confidence', 'doc_converter']
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
      description: 'Check photos, signatures and PDFs against a size you choose, with 1-click auto-fix.',
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
    },
    {
      id: 'structured-extractor',
      category: 'intelligence',
      title: 'Structured Field Extraction',
      description: 'Automatically pull key/value pairs out of receipts, invoices, bills, IDs, and statements on-device.',
      route: '/features/pdf/intelligence/extract-structured',
      icon: 'structured-extract',
      color: 'pdf',
      badge: 'Smart OCR',
      keywords: ['structured', 'extract', 'receipt', 'invoice', 'id', 'bill', 'statement', 'totals', 'tax', 'date', 'key value', 'ocr'],
      relatedIds: ['contact-calendar-extract', 'scanned-table-ocr', 'pdf_intelligence', 'pdf_ocr']
    },
    {
      id: 'contact-calendar-extract',
      category: 'intelligence',
      title: 'Contact & Calendar Extractor',
      description: 'Convert business card photos into .vcf vCards and document schedules into .ics iCalendar events.',
      route: '/features/pdf/intelligence/contact-calendar',
      icon: 'contact-calendar',
      color: 'pdf',
      badge: 'vCard & .ics',
      keywords: ['contact', 'calendar', 'vcard', 'vcf', 'ics', 'icalendar', 'business card', 'schedule', 'event', 'meeting'],
      relatedIds: ['structured-extractor', 'qr_barcode', 'pdf_intelligence', 'photo_tools']
    },
    {
      id: 'barcode-batch',
      category: 'scanner',
      title: 'Barcode Batch Mode & 1D Generation',
      description: 'Continuous batch camera scanning, deduplication, and bulk 1D barcode generator to PDF label sheets and ZIP.',
      route: '/features/qr-barcode/batch',
      icon: 'barcode-scanner',
      color: 'pdf',
      badge: 'Batch & 1D',
      keywords: ['barcode', 'batch', 'continuous', 'scan', 'code 128', 'ean 13', 'code 39', 'labels', 'generator', 'zip'],
      relatedIds: ['qr_barcode', 'document_scanner', 'structured-extractor']
    },
    {
      id: 'multi-doc-qa',
      category: 'intelligence',
      title: 'Multi-Document Q&A',
      description: 'Query across multiple PDF documents simultaneously with on-device BM25 ranking and dual citation attribution.',
      route: '/features/pdf/intelligence/multi-qa',
      icon: 'multi-qa',
      color: 'pdf',
      badge: 'BM25 Search',
      keywords: ['multi-doc', 'qa', 'corpus', 'citations', 'search', 'bm25', 'cross-document', 'question answering', 'intelligence'],
      relatedIds: ['pdf_intelligence', 'structured-extractor', 'contact-calendar-extract']
    },
    {
      id: 'auto-classifier',
      category: 'intelligence',
      title: 'Auto-Organize & Classifier',
      description: 'Auto-classify, semantic tag, and suggest content-based renames to organize messy PDF vaults locally.',
      route: '/features/pdf/intelligence/organize',
      icon: 'smart-tag',
      color: 'pdf',
      badge: 'Auto-Organize',
      keywords: ['organize', 'classifier', 'tagger', 'rename', 'vault', 'smart tag', 'auto categorize', 'batch organize', 'semantic tags'],
      relatedIds: ['structured-extractor', 'multi-doc-qa', 'pdf_intelligence']
    },
    {
      id: 'entity-clause-extractor',
      category: 'intelligence',
      title: 'Entity & Clause Extractor',
      description: 'Detect dates, amounts, parties, deadlines, and obligation clauses with clickable page coordinate anchors.',
      route: '/features/pdf/intelligence/entities',
      icon: 'clause-search',
      color: 'pdf',
      badge: 'Page Anchors',
      keywords: ['entity', 'clause', 'contract', 'obligation', 'parties', 'deadlines', 'amounts', 'dates', 'anchors', 'penalties', 'rights'],
      relatedIds: ['structured-extractor', 'multi-doc-qa', 'auto-classifier', 'pdf_intelligence']
    },
    {
      id: 'readability-analyzer',
      category: 'intelligence',
      title: 'Reading Time & Readability',
      description: 'Calculate silent reading and speaking times, Flesch reading ease, grade levels, and complexity bands.',
      route: '/features/pdf/intelligence/readability',
      icon: 'book-open',
      color: 'pdf',
      badge: 'Readability',
      keywords: ['reading time', 'readability', 'flesch', 'gunning fog', 'speaking time', 'words per minute', 'complexity', 'wpm', 'grade level'],
      relatedIds: ['entity-clause-extractor', 'structured-extractor', 'pdf_intelligence']
    },
    {
      id: 'translation-reader',
      category: 'intelligence',
      title: 'Side-by-Side Translation Reader',
      description: 'Dual-pane synchronized scroll reader with Indic translations, summary export, and docx/PDF generation.',
      route: '/features/pdf/intelligence/translation-reader',
      icon: 'split-view',
      color: 'pdf',
      badge: 'Dual Pane',
      keywords: ['translation', 'dual pane', 'side by side', 'reader', 'summary', 'docx', 'word', 'scroll lock', 'pdf translate', 'indic'],
      relatedIds: ['pdf_intelligence', 'multi-doc-qa', 'structured-extractor']
    },
    {
      id: 'pdf-accessibility',
      category: 'tools',
      title: 'PDF Accessibility & Structure Tags',
      description: 'Enhance PDFs with ISO 32000-1 structure tags (/StructTreeRoot), image alt-text, reading order editor, and read-aloud preview.',
      route: '/features/pdf/accessibility',
      icon: 'accessibility',
      color: 'pdf',
      badge: 'Tagged PDF',
      keywords: ['accessibility', 'tagged pdf', 'structtreeroot', 'alt text', 'reading order', 'screen reader', 'read aloud', 'parent tree', 'iso 32000'],
      relatedIds: ['pdf_intelligence', 'pdf_ocr', 'translation-reader']
    },
    /*
     * Part C and Part D. Each of these is a route the hub did not have, so
     * nothing above changes: the organizer still owns the quick merge, split
     * and page organize, and these are the screens for what it does not do.
     *
     * The keywords carry the sub-operations deliberately. The Layout Studio is
     * one screen with seven tabs, and someone searching for "crop" or
     * "booklet" has to find it without a separate catalogue entry per tab.
     */
    {
      id: 'pdf_layout',
      category: 'ORGANIZE',
      title: 'Page Size & Layout Studio',
      description: 'Resize pages to one size, crop margins, add binding space, print 2-up or as a booklet, or stack a document into one long page.',
      route: '/features/pdf/layout',
      icon: 'resize-outline',
      color: 'organize',
      keywords: [
        'layout', 'page size', 'resize pdf', 'a4', 'a5', 'letter', 'legal', 'normalize',
        'crop', 'crop pdf', 'trim margins', 'auto crop', 'whitespace',
        'margins', 'binding margin', 'padding',
        'n-up', 'nup', '2 up', '4 up', 'multiple pages per sheet',
        'booklet', 'saddle stitch', 'imposition', 'fold',
        'long page', 'single page', 'tall page', 'scroll',
        'grayscale', 'greyscale', 'black and white', 'invert', 'dark mode', 'high contrast'
      ],
      relatedIds: ['pdf_organize', 'pdf_combine', 'pdf_overlay', 'pdf_compress']
    },
    {
      id: 'pdf_combine',
      category: 'ORGANIZE',
      title: 'Combine Studio',
      description: 'Merge with per-file page ranges, generated bookmarks and a contents page, alternate two scans page by page, or insert pages at an exact position.',
      route: '/features/pdf/combine',
      icon: 'git-merge-outline',
      color: 'organize',
      keywords: [
        'combine', 'merge pdf', 'advanced merge', 'page subset', 'page range per file',
        'sort files', 'bookmarks', 'outline', 'table of contents', 'toc', 'cover page', 'separator',
        'alternate', 'mix', 'interleave', 'front and back', 'duplex scan',
        'insert pages', 'insert pdf', 'insert blank page', 'add page',
        'form fields', 'acroform', 'signature warning'
      ],
      relatedIds: ['pdf_merge', 'pdf_organize', 'pdf_layout', 'pdf_overlay']
    },
    {
      id: 'pdf_overlay',
      category: 'ORGANIZE',
      title: 'Overlay & Underlay',
      description: 'Lay one PDF over or under another: letterhead, a pre-printed form, a watermark sheet or a stamp page.',
      route: '/features/pdf/overlay',
      icon: 'albums-outline',
      color: 'organize',
      keywords: [
        'overlay', 'underlay', 'letterhead', 'stationery', 'pre-printed form', 'preprinted',
        'watermark sheet', 'stamp', 'background pdf', 'foreground', 'combine layers', 'imprint'
      ],
      relatedIds: ['pdf_layout', 'pdf_combine', 'pdf_editor', 'pdf_organize']
    },
    {
      id: 'pdf_navigation',
      category: 'ORGANIZE',
      title: 'Navigation & Page Labels',
      description: 'Create and edit bookmarks, auto-generate outlines from headings, and set logical page numbering.',
      route: '/features/pdf/bookmarks',
      icon: 'bookmark-outline',
      color: 'organize',
      keywords: [
        'navigation', 'bookmarks', 'outline', 'table of contents', 'toc', 'headings',
        'page labels', 'page numbering', 'roman numerals', 'bates', 'logical pages'
      ],
      relatedIds: ['pdf_header_footer', 'pdf_organize', 'pdf_combine', 'pdf_reader']
    },
    {
      id: 'pdf_optimize',
      category: 'PDF',
      title: 'Size & Structure Optimizer',
      description: 'Lossless structure cleanup, DPI downsampling with visual proof, image deduplication, and scan tone compression.',
      route: '/features/pdf/optimize',
      icon: 'speedometer-outline',
      color: 'pdf',
      keywords: [
        'optimize', 'optimizer', 'dpi', 'downsample', 'resolution', 'dedupe',
        'duplicate images', 'grayscale', 'mono', 'black and white', '1-bit',
        // Not "fast web view": pdf-lib has no linearizing writer, so the
        // structure pass must not be searchable under a guarantee it cannot
        // keep. It is an object-level cleanup and is labelled as one.
        'proof', 'structure', 'upload limit', 'fit size', 'shrink', 'reduce size'
      ],
      relatedIds: ['pdf_compress', 'pdf_organize', 'pdf_layout', 'pdf_repair']
    },
    {
      id: 'pdf_fingerprint',
      category: 'PDF',
      title: 'Document Fingerprint',
      description: 'Generate cryptographic SHA-256 integrity receipt and per-page fingerprint audit.',
      route: '/features/pdf/fingerprint',
      icon: 'fingerprint',
      color: 'pdf',
      badge: 'Audit Receipt',
      keywords: ['fingerprint', 'sha256', 'hash', 'integrity', 'receipt', 'audit'],
      relatedIds: ['pdf_preflight', 'pdf_inspect', 'pdf_signature_status', 'pdf_repair']
    },
    {
      id: 'pdf_preflight',
      category: 'PDF',
      title: 'Preflight & Submission Check',
      description: 'Check PDFs against portal and print submission requirements with 1-click fixes.',
      route: '/features/pdf/preflight',
      icon: 'shield-checkmark-outline',
      color: 'pdf',
      badge: 'Auto-Fix',
      keywords: ['preflight', 'portal', 'submission', 'check', 'fix', 'page size', 'fonts'],
      relatedIds: ['document_validator', 'pdf_optimize', 'pdf_fingerprint', 'pdf_inspect']
    },
    {
      id: 'pdf_inspect',
      category: 'PROTECT',
      title: 'Embedded Object Inspector',
      description: 'Inspect attachments, scripts, stream encodings, and links without risk of execution.',
      route: '/features/pdf/inspect',
      icon: 'code',
      color: 'protect',
      badge: 'Security',
      keywords: ['inspect', 'attachments', 'javascript', 'links', 'embedded', 'extract', 'streams'],
      relatedIds: ['pdf_privacy_sanitizer', 'pdf_repair', 'pdf_signature_status', 'pdf_fingerprint']
    },
    {
      id: 'pdf_signature_status',
      category: 'SIGN',
      title: 'Signature Status Panel',
      description: 'Report-only analysis of cryptographic signature structures and byte-range coverage.',
      route: '/features/pdf/signature-status',
      icon: 'ribbon',
      color: 'sign',
      badge: 'Diagnostic',
      keywords: ['signature', 'status', 'signer', 'byte range', 'coverage', 'appended', 'revisions'],
      relatedIds: ['pdf_signing', 'pdf_fingerprint', 'pdf_inspect', 'pdf_privacy_sanitizer']
    },
    {
      id: 'pdf_archival',
      category: 'PDF',
      title: 'Archival Preparation',
      description: 'Prepare documents for long-term preservation with sRGB intent, font embedding, and conforming XMP metadata.',
      route: '/features/pdf/archival',
      icon: 'archive',
      color: 'pdf',
      badge: 'Preservation',
      keywords: ['archival', 'pdf/a', 'pdf/a-2b', 'preservation', 'xmp', 'srgb', 'embed fonts'],
      relatedIds: ['pdf_preflight', 'pdf_fingerprint', 'pdf_repair', 'pdf_optimize']
    },
    {
      id: 'form-builder',
      category: 'EDIT',
      title: 'Form Builder',
      description: 'Create, position, configure, and save interactive AcroForm fields on PDF documents.',
      route: '/features/pdf/forms/build',
      icon: 'form-builder',
      color: 'edit',
      badge: 'Interactive',
      keywords: ['form builder', 'create fields', 'acroform', 'text field', 'checkbox', 'radio', 'dropdown', 'listbox', 'signature', 'date picker', 'forms'],
      relatedIds: ['pdf_forms', 'pdf_signing', 'pdf_reader']
    },
    {
      id: 'form-data-transfer',
      category: 'EDIT',
      title: 'Form Data Transfer',
      description: 'Export and import PDF form values across FDF, XFDF, CSV, and JSON formats.',
      route: '/features/pdf/forms/data',
      icon: 'form-data',
      color: 'edit',
      badge: 'Data Bridge',
      keywords: ['form data', 'fdf', 'xfdf', 'csv', 'json', 'import form', 'export form', 'acroform data', 'field values'],
      relatedIds: ['form-builder', 'pdf_forms', 'pdf_signing']
    },
    {
      id: 'form-mail-merge',
      category: 'EDIT',
      title: 'Form Mail-Merge',
      description: 'Generate personalized PDF documents in batch from a PDF template and CSV data sheet.',
      route: '/features/pdf/forms/mail-merge',
      icon: 'mail-merge',
      color: 'edit',
      badge: 'Batch Merge',
      keywords: ['mail merge', 'batch merge', 'csv merge', 'personalized pdf', 'bulk certificates', 'invoices', 'forms'],
      relatedIds: ['form-data-transfer', 'form-builder', 'pdf_forms']
    },
    {
      id: 'signature-templates',
      category: 'SIGN',
      title: 'Signature Templates',
      description: 'Create formal signature appearance stamps, metadata blocks, and typed cursive calligraphy.',
      route: '/features/pdf/sign/templates',
      icon: 'signature-template',
      color: 'sign',
      badge: 'Appearance',
      keywords: ['signature templates', 'typed signature', 'calligraphy', 'signature stamp', 'digital seal', 'initials badge', 'sign'],
      relatedIds: ['pdf_signing', 'signature_tools', 'form-builder']
    },
    {
      id: 'signing-packet',
      category: 'SIGN',
      title: 'Multi-Party Signing Packet',
      description: 'Orchestrate sequential and parallel multi-party document signing workflows on-device without cloud accounts.',
      route: '/features/pdf/sign/packet',
      icon: 'signing-packet',
      color: 'sign',
      badge: 'Multi-Party',
      keywords: ['signing packet', 'multi party', 'signing order', 'sequential signing', 'parallel signing', 'on-device packet', 'audit trail'],
      relatedIds: ['pdf_signing', 'signature-templates', 'form-builder']
    },
    {
      id: 'crypto-sign',
      category: 'SIGN',
      title: 'Digital Certificate Sign',
      description: 'Sign PDF documents cryptographically with X.509 PKCS#12 certificates (.p12/.pfx) and CMS SignedData.',
      route: '/features/pdf/sign/certificate',
      icon: 'certificate-sign',
      color: 'sign',
      badge: 'PKCS#12',
      keywords: ['certificate sign', 'digital signature', 'pkcs12', 'pfx', 'p12', 'x509', 'crypto sign', 'cms signed data', 'tamper evident'],
      relatedIds: ['pdf_signing', 'signature-templates', 'signing-packet']
    },
    {
      id: 'pdf-protect',
      category: 'PROTECT',
      title: 'Encrypt & Protect PDF',
      description: 'Upgrade document security with AES-256 (R6) and AES-128 (R4) encryption with granular permissions.',
      route: '/features/pdf/security/protect',
      icon: 'shield-lock',
      color: 'protect',
      badge: 'AES-256',
      keywords: ['pdf-protect', 'security', 'protect', 'aes-256', 'aes-128', 'r6', 'encryption', 'password', 'permissions'],
      relatedIds: ['pdf_security', 'crypto-sign', 'pdf_privacy_sanitizer']
    },
    {
      id: 'batch-security',
      category: 'PROTECT',
      title: 'Batch PDF Security',
      description: 'Protect or unlock multiple PDF documents in a single high-performance pass.',
      route: '/features/pdf/security/batch',
      icon: 'batch-shield',
      color: 'protect',
      badge: 'Batch',
      keywords: ['batch-security', 'batch protect', 'batch unlock', 'bulk encryption', 'multi-file security', 'aes-256'],
      relatedIds: ['pdf-protect', 'pdf_security', 'batch_pdf']
    },
    {
      id: 'redact-verify',
      category: 'PROTECT',
      title: 'Verified Redaction Audit',
      description: 'Audit and prove sensitive data is permanently purged from PDF streams with region rasterization fallback.',
      route: '/features/pdf/security/redact-verify',
      icon: 'verified-stamp',
      color: 'protect',
      badge: 'Audit',
      keywords: ['redact-verify', 'redaction audit', 'verify redaction', 'sanitize', 'rasterize region', 'privacy verification', 'permanently removed'],
      relatedIds: ['pdf-protect', 'pdf_privacy_sanitizer', 'batch-security']
    },
    {
      id: 'search-redact',
      category: 'PROTECT',
      title: 'Search-and-Redact by Pattern',
      description: 'Automatically detect and permanently purge sensitive patterns (Emails, Phones, Aadhaar, PAN, Credit Cards) with ReDoS safety.',
      route: '/features/pdf/security/search-redact',
      icon: 'search-redact',
      color: 'protect',
      badge: 'Pattern',
      keywords: ['search-redact', 'pattern redaction', 'redact email', 'redact phone', 'redact aadhaar', 'redact pan', 'luhn credit card', 'regex redaction'],
      relatedIds: ['redact-verify', 'pdf-protect', 'pdf_privacy_sanitizer']
    },
    {
      id: 'metadata-editor',
      category: 'PROTECT',
      title: 'PDF Metadata Editor',
      description: 'Inspect, correct, and synchronize PDF document attributes in Info dictionary and XMP streams.',
      route: '/features/pdf/security/metadata',
      icon: 'metadata-edit',
      color: 'protect',
      badge: 'Editor',
      keywords: ['metadata-editor', 'pdf metadata', 'info dictionary', 'xmp stream', 'author', 'title', 'subject', 'keywords', 'creator', 'producer'],
      relatedIds: ['pdf_privacy_sanitizer', 'pdf-protect', 'redact-verify']
    },
    {
      id: 'hidden-content-audit',
      category: 'PROTECT',
      title: 'Hidden-Content Audit',
      description: 'Scan and generate a forensic breakdown of concealed layers, off-page objects, invisible text, and scripts.',
      route: '/features/pdf/security/audit',
      icon: 'forensic-scan',
      color: 'protect',
      badge: 'Audit',
      keywords: ['hidden-content-audit', 'forensic scan', 'ocg layers', 'invisible text', 'white on white', 'off page', 'hidden content', 'privacy risk'],
      relatedIds: ['pdf_privacy_sanitizer', 'redact-verify', 'metadata-editor']
    },
    {
      id: 'app-lock',
      category: 'PROTECT',
      title: 'App Lock & Panic Clear',
      description: 'Biometric/PIN authentication, vault auto-lock, and emergency one-tap storage purge.',
      route: '/features/settings/security-lock',
      icon: 'lock-closed',
      color: 'protect',
      badge: 'Security',
      keywords: ['app lock', 'panic clear', 'biometric', 'fingerprint', 'pin', 'emergency wipe', 'vault lock', 'auto lock'],
      relatedIds: ['pdf_privacy_sanitizer', 'hidden-content-audit', 'local-data-storage']
    },
    {
      id: 'privacy-card',
      category: 'PROTECT',
      title: 'Privacy Report Card',
      description: 'Plain-language audit and letter grade (A+ to F) summarizing what a PDF reveals about its creator, device, and location.',
      route: '/features/pdf/security/privacy-card',
      icon: 'report-card',
      color: 'protect',
      badge: 'Report Card',
      keywords: ['privacy card', 'privacy report', 'letter grade', 'exif gps', 'exposure risk', 'creator', 'software traces', 'layman report'],
      relatedIds: ['pdf_privacy_sanitizer', 'hidden-content-audit', 'metadata-editor']
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
