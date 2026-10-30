import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import {
  PDFDocument,
  PDFPage,
  PDFForm,
  PDFSignature,
  PDFAcroSignature,
  PDFName,
  PDFHexString,
  PDFString,
  PDFNumber,
  PDFDict,
  PDFArray,
  PDFRef,
  StandardFonts,
  degrees
} from 'pdf-lib';
import { PdfFormService } from './pdf-form.service';
import { StorageService } from './storage.service';
import {
  FormBuilderField,
  PdfFieldCoordinates,
  CoordinateTransformOptions
} from '../models/pdf-forms.types';

// Augment PDFForm and PDFSignature prototypes if not present
if (!(PDFForm.prototype as any).createSignature) {
  (PDFForm.prototype as any).createSignature = function (name: string): PDFSignature {
    const context = (this as any).doc.context;
    const sigDict = context.obj({
      FT: 'Sig',
      T: PDFHexString.fromText(name),
      Kids: []
    });
    const sigRef = context.register(sigDict);
    const acroForm = (this as any).doc.catalog.getOrCreateAcroForm();
    acroForm.addField(sigRef);
    return PDFSignature.of(PDFAcroSignature.fromDict(sigDict, sigRef), sigRef, (this as any).doc);
  };
}

if (!(PDFSignature.prototype as any).addToPage) {
  (PDFSignature.prototype as any).addToPage = function (
    page: PDFPage,
    options?: { x?: number; y?: number; width?: number; height?: number; rotate?: any }
  ) {
    const context = (this as any).doc.context;
    const x = options?.x ?? 0;
    const y = options?.y ?? 0;
    const width = options?.width ?? 200;
    const height = options?.height ?? 60;

    const apStream = context.formXObject([], {
      BBox: context.obj([0, 0, width, height]),
      Matrix: context.obj([1, 0, 0, 1, 0, 0])
    });
    const apStreamRef = context.register(apStream);
    const apDict = context.obj({ N: apStreamRef });

    const widgetDict = context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      Rect: [x, y, x + width, y + height],
      P: page.ref,
      F: 4,
      AP: apDict
    });
    const widgetRef = context.register(widgetDict);
    (this as any).acroField.addWidget(widgetRef);
    page.node.addAnnot(widgetRef);
    return widgetRef;
  };
}

@Injectable({
  providedIn: 'root'
})
export class PdfFormBuilderService extends PdfFormService {
  private storageService = inject(StorageService, { optional: true });

  /**
   * Sanitizes text strings against XSS injection, dangerous script tags,
   * inline event handlers (onerror, onload), and non-printable control characters.
   */
  sanitizeInput(value: any): string {
    if (value == null) return '';
    let str = String(value);

    // Strip script and style blocks entirely
    str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    str = str.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Strip HTML tags
    str = str.replace(/<[^>]+>/g, '');

    // Strip dangerous protocol and event handler patterns
    str = str.replace(/\b(javascript|vbscript|data):/gi, '');
    str = str.replace(/\bon\w+\s*=/gi, '');

    // Strip null bytes and non-printable control characters (except \n, \r, \t)
    str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return str.trim();
  }

  /**
   * Sanitizes field names into safe, unambiguous PDF AcroForm field identifiers.
   * Restricts to alphanumeric, underscore, hyphen, and period.
   */
  sanitizeFieldName(name: string): string {
    const cleaned = this.sanitizeInput(name)
      .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!cleaned || cleaned.length === 0) {
      return `field_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    // Limit maximum field name length to 128 characters
    return cleaned.slice(0, 128);
  }

  /**
   * Normalizes and validates ISO 8601 date format (YYYY-MM-DD).
   */
  formatIsoDate(val: any): string {
    if (!val) return '';
    const sanitized = this.sanitizeInput(val);
    if (!sanitized) return '';

    // Direct YYYY-MM-DD match
    const isoMatch = sanitized.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      if (year >= 1000 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      }
    }

    // Try parsing as Date
    const parsed = new Date(sanitized);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return sanitized.slice(0, 10);
  }

  /**
   * Guards against adversarial or corrupted AcroForm structures by verifying
   * tree depth and detecting circular references in /Kids arrays.
   */
  validateAcroFormStructure(pdfDoc: PDFDocument, maxDepth = 32): void {
    const acroForm = pdfDoc.catalog.lookup(PDFName.of('AcroForm'));
    if (!acroForm || !(acroForm instanceof PDFDict)) return;

    const fieldsEntry = acroForm.lookup(PDFName.of('Fields'));
    if (!fieldsEntry || !(fieldsEntry instanceof PDFArray)) return;

    const visitedRefs = new Set<string>();
    const stack: Array<{ ref?: PDFRef; dict: PDFDict; depth: number }> = [];

    for (let i = 0; i < fieldsEntry.size(); i++) {
      const fieldRef = fieldsEntry.get(i);
      if (fieldRef instanceof PDFRef) {
        const key = `${fieldRef.objectNumber}-${fieldRef.generationNumber}`;
        visitedRefs.add(key);
        const resolved = pdfDoc.context.lookup(fieldRef);
        if (resolved instanceof PDFDict) {
          stack.push({ ref: fieldRef, dict: resolved, depth: 1 });
        }
      }
    }

    while (stack.length > 0) {
      const { dict, depth } = stack.pop()!;
      if (depth >= maxDepth) {
        // Depth limit exceeded: prune further /Kids to prevent parser stack overflow
        if (dict.has(PDFName.of('Kids'))) {
          dict.delete(PDFName.of('Kids'));
        }
        continue;
      }

      const kids = dict.lookup(PDFName.of('Kids'));
      if (kids instanceof PDFArray) {
        const safeKidsIndices: number[] = [];
        for (let k = 0; k < kids.size(); k++) {
          const kidRef = kids.get(k);
          if (kidRef instanceof PDFRef) {
            const kidKey = `${kidRef.objectNumber}-${kidRef.generationNumber}`;
            if (visitedRefs.has(kidKey)) {
              // Circular reference detected! Drop this child to break cycle
              continue;
            }
            visitedRefs.add(kidKey);
            const kidDict = pdfDoc.context.lookup(kidRef);
            if (kidDict instanceof PDFDict) {
              stack.push({ ref: kidRef, dict: kidDict, depth: depth + 1 });
              safeKidsIndices.push(k);
            }
          }
        }
        // If cycles were pruned, rewrite the kids array
        if (safeKidsIndices.length < kids.size()) {
          const newKids = pdfDoc.context.obj(safeKidsIndices.map(idx => kids.get(idx)));
          dict.set(PDFName.of('Kids'), newKids);
        }
      }
    }
  }

  /**
   * Translates mobile touch/canvas coordinates (CSS pixels from top-left)
   * into PDF Points (72 DPI, bottom-left origin), accounting for page scale,
   * DPR, and page rotation (0, 90, 180, 270 degrees).
   * Clamps output strictly within valid page coordinate bounds.
   */
  cssToPdfCoordinates(options: CoordinateTransformOptions): PdfFieldCoordinates {
    const scale = (options.scale && options.scale > 0) ? options.scale : 1.0;
    const dpr = (options.dpr && options.dpr > 0) ? options.dpr : 1.0;
    const rotation = ((options.rotation || 0) % 360 + 360) % 360;

    const pw = options.pageWidth;
    const ph = options.pageHeight;

    const isRotated90or270 = rotation === 90 || rotation === 270;
    const dispWidth = isRotated90or270 ? ph : pw;
    const dispHeight = isRotated90or270 ? pw : ph;

    const factor = scale * dpr;
    const rawVx = options.x / factor;
    const rawVy = options.y / factor;
    const rawVw = Math.max(1, options.width / factor);
    const rawVh = Math.max(1, options.height / factor);

    // Bounds clamp in displayed viewport space
    const vw = Math.min(dispWidth, rawVw);
    const vh = Math.min(dispHeight, rawVh);
    const vx = Math.max(0, Math.min(dispWidth - vw, rawVx));
    const vy = Math.max(0, Math.min(dispHeight - vh, rawVy));

    let x = 0;
    let y = 0;
    let width = vw;
    let height = vh;

    switch (rotation) {
      case 0:
        x = vx;
        y = ph - (vy + vh);
        width = vw;
        height = vh;
        break;

      case 90:
        x = vy;
        y = vx;
        width = vh;
        height = vw;
        break;

      case 180:
        x = pw - (vx + vw);
        y = vy;
        width = vw;
        height = vh;
        break;

      case 270:
        x = pw - (vy + vh);
        y = ph - (vx + vw);
        width = vh;
        height = vw;
        break;

      default:
        x = vx;
        y = ph - (vy + vh);
        width = vw;
        height = vh;
        break;
    }

    // Clamp strictly within PDF user space
    const clampedW = Math.max(1, Math.min(pw, width));
    const clampedH = Math.max(1, Math.min(ph, height));
    const clampedX = Math.max(0, Math.min(pw - clampedW, x));
    const clampedY = Math.max(0, Math.min(ph - clampedH, y));

    return {
      pageNumber: 1,
      x: Math.round(clampedX * 100) / 100,
      y: Math.round(clampedY * 100) / 100,
      width: Math.round(clampedW * 100) / 100,
      height: Math.round(clampedH * 100) / 100
    };
  }

  /**
   * Translates PDF Points (bottom-left origin) back into CSS pixels
   * from top-left of the rendered canvas.
   */
  pdfToCssCoordinates(options: CoordinateTransformOptions): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const scale = (options.scale && options.scale > 0) ? options.scale : 1.0;
    const dpr = (options.dpr && options.dpr > 0) ? options.dpr : 1.0;
    const rotation = ((options.rotation || 0) % 360 + 360) % 360;

    const pw = options.pageWidth;
    const ph = options.pageHeight;

    const isRotated90or270 = rotation === 90 || rotation === 270;
    const dispWidth = isRotated90or270 ? ph : pw;
    const dispHeight = isRotated90or270 ? pw : ph;

    // Bounds clamp PDF inputs
    const clampedW = Math.max(1, Math.min(pw, options.width));
    const clampedH = Math.max(1, Math.min(ph, options.height));
    const clampedX = Math.max(0, Math.min(pw - clampedW, options.x));
    const clampedY = Math.max(0, Math.min(ph - clampedH, options.y));

    let vx = 0;
    let vy = 0;
    let vw = clampedW;
    let vh = clampedH;

    switch (rotation) {
      case 0:
        vx = clampedX;
        vy = ph - (clampedY + clampedH);
        vw = clampedW;
        vh = clampedH;
        break;

      case 90:
        vx = clampedY;
        vy = clampedX;
        vw = clampedH;
        vh = clampedW;
        break;

      case 180:
        vx = pw - (clampedX + clampedW);
        vy = clampedY;
        vw = clampedW;
        vh = clampedH;
        break;

      case 270:
        vx = ph - (clampedY + clampedH);
        vy = pw - (clampedX + clampedW);
        vw = clampedH;
        vh = clampedW;
        break;

      default:
        vx = clampedX;
        vy = ph - (clampedY + clampedH);
        vw = clampedW;
        vh = clampedH;
        break;
    }

    const factor = scale * dpr;
    const cssX = Math.max(0, Math.min(dispWidth - vw, vx)) * factor;
    const cssY = Math.max(0, Math.min(dispHeight - vh, vy)) * factor;

    return {
      x: Math.round(cssX * 100) / 100,
      y: Math.round(cssY * 100) / 100,
      width: Math.round(vw * factor * 100) / 100,
      height: Math.round(vh * factor * 100) / 100
    };
  }

  /**
   * Ensures standard font resources (/Helv, /ZaDb) are registered in
   * the AcroForm default resources (/DR) and sets a compliant /DA string.
   */
  async ensureStandardFormResources(pdfDoc: PDFDocument): Promise<void> {
    const helv = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
    const zapf = await pdfDoc.embedStandardFont(StandardFonts.ZapfDingbats);

    const acroForm = pdfDoc.catalog.getOrCreateAcroForm();
    let dr = acroForm.dict.lookup(PDFName.of('DR'));
    if (!dr || !(dr instanceof PDFDict)) {
      dr = pdfDoc.context.obj({});
      acroForm.dict.set(PDFName.of('DR'), dr);
    }

    let fontDict = (dr as PDFDict).lookup(PDFName.of('Font'));
    if (!fontDict || !(fontDict instanceof PDFDict)) {
      fontDict = pdfDoc.context.obj({});
      (dr as PDFDict).set(PDFName.of('Font'), fontDict);
    }

    (fontDict as PDFDict).set(PDFName.of('Helv'), helv.ref);
    (fontDict as PDFDict).set(PDFName.of('ZaDb'), zapf.ref);

    // /DA must be a PDFString, NOT a PDFName
    if (!acroForm.dict.has(PDFName.of('DA'))) {
      acroForm.dict.set(PDFName.of('DA'), PDFString.of('/Helv 12 Tf 0 g'));
    }
  }

  /**
   * Adds an interactive form field to the PDF document on the specified page,
   * applying coordinate clamping, property sanitization, and tooltip accessibility.
   */
  createFieldOnForm(pdfDoc: PDFDocument, page: PDFPage, field: FormBuilderField): void {
    const form = pdfDoc.getForm();
    const pageW = page.getWidth();
    const pageH = page.getHeight();

    // Sanitize field name, label, and tooltip
    const rawName = field.name || `field_${Date.now()}`;
    const sanitizedName = this.sanitizeFieldName(rawName);
    const label = field.label ? this.sanitizeInput(field.label) : undefined;
    const tooltipText = field.tooltip ? this.sanitizeInput(field.tooltip) : (label || undefined);

    // Bounds clamp coordinates
    const rawCoords = field.coordinates || {
      pageNumber: 1,
      x: 50,
      y: 50,
      width: 150,
      height: 30
    };
    const minSize = 5;
    const width = Math.max(minSize, Math.min(pageW, Math.abs(rawCoords.width || 100)));
    const height = Math.max(minSize, Math.min(pageH, Math.abs(rawCoords.height || 30)));
    const x = Math.max(0, Math.min(pageW - width, rawCoords.x || 0));
    const y = Math.max(0, Math.min(pageH - height, rawCoords.y || 0));

    const coords: PdfFieldCoordinates = {
      pageNumber: rawCoords.pageNumber || 1,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100
    };

    const rotDegrees = degrees(0);

    switch (field.type) {
      case 'text': {
        const tf = form.createTextField(sanitizedName);
        const defVal = field.defaultValue != null && field.defaultValue !== ''
          ? this.sanitizeInput(field.defaultValue)
          : (field.value != null && field.value !== '' ? this.sanitizeInput(field.value) : '');

        if (defVal) {
          tf.setText(defVal);
        }
        if (field.isMultiline) {
          tf.enableMultiline();
        } else {
          tf.disableMultiline();
        }
        if (field.maxLength != null && field.maxLength > 0) {
          tf.setMaxLength(field.maxLength);
        }
        if (field.fontSize != null && field.fontSize > 0) {
          tf.setFontSize(field.fontSize);
        }
        if (field.isRequired) tf.enableRequired();
        if (field.isReadOnly) tf.enableReadOnly();
        if (tooltipText) {
          tf.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tooltipText));
        }
        tf.addToPage(page, {
          x: coords.x,
          y: coords.y,
          width: coords.width,
          height: coords.height,
          rotate: rotDegrees
        });
        break;
      }

      case 'date': {
        const tf = form.createTextField(sanitizedName);
        const dateVal = this.formatIsoDate(field.defaultValue || field.value);
        if (dateVal) {
          tf.setText(dateVal);
        }
        if (field.maxLength != null && field.maxLength > 0) {
          tf.setMaxLength(field.maxLength);
        } else {
          tf.setMaxLength(10); // Standard ISO YYYY-MM-DD
        }
        if (field.fontSize != null && field.fontSize > 0) {
          tf.setFontSize(field.fontSize);
        }
        if (field.isRequired) tf.enableRequired();
        if (field.isReadOnly) tf.enableReadOnly();
        if (tooltipText) {
          tf.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tooltipText));
        }
        tf.addToPage(page, {
          x: coords.x,
          y: coords.y,
          width: coords.width,
          height: coords.height,
          rotate: rotDegrees
        });
        break;
      }

      case 'checkbox': {
        const cb = form.createCheckBox(sanitizedName);
        const isChecked = field.defaultValue === true || field.value === true;
        if (isChecked) {
          cb.check();
        } else {
          cb.uncheck();
        }
        if (field.isRequired) cb.enableRequired();
        if (field.isReadOnly) cb.enableReadOnly();
        if (tooltipText) {
          cb.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tooltipText));
        }
        cb.addToPage(page, {
          x: coords.x,
          y: coords.y,
          width: coords.width,
          height: coords.height,
          rotate: rotDegrees
        });
        break;
      }

      case 'radio': {
        const rg = form.createRadioGroup(sanitizedName);
        const rawOptions = field.options && field.options.length > 0 ? field.options : ['Option 1', 'Option 2'];
        const options = rawOptions.map(opt => this.sanitizeInput(opt)).filter(opt => opt.length > 0);
        const safeOptions = options.length > 0 ? options : ['Option 1', 'Option 2'];

        for (let i = 0; i < safeOptions.length; i++) {
          const opt = safeOptions[i];
          const rawOptY = safeOptions.length > 1 ? coords.y - (i * (coords.height + 8)) : coords.y;
          const optY = Math.max(0, Math.min(pageH - coords.height, rawOptY));
          rg.addOptionToPage(opt, page, {
            x: coords.x,
            y: optY,
            width: coords.width,
            height: coords.height,
            rotate: rotDegrees
          });
        }

        const selectedVal = field.defaultValue || field.value;
        if (selectedVal && safeOptions.includes(selectedVal)) {
          rg.select(selectedVal);
        }

        if (field.isRequired) rg.enableRequired();
        if (field.isReadOnly) rg.enableReadOnly();
        if (tooltipText) {
          rg.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tooltipText));
        }
        break;
      }

      case 'dropdown': {
        const dd = form.createDropdown(sanitizedName);
        const rawOptions = field.options && field.options.length > 0 ? field.options : ['Option 1', 'Option 2'];
        const options = rawOptions.map(opt => this.sanitizeInput(opt)).filter(opt => opt.length > 0);
        const safeOptions = options.length > 0 ? options : ['Option 1', 'Option 2'];
        dd.setOptions(safeOptions);

        const selectedVal = field.defaultValue || field.value;
        if (selectedVal && safeOptions.includes(selectedVal)) {
          dd.select(selectedVal);
        } else if (safeOptions.length > 0) {
          dd.select(safeOptions[0]);
        }

        if (field.fontSize != null && field.fontSize > 0) {
          dd.setFontSize(field.fontSize);
        }
        if (field.isRequired) dd.enableRequired();
        if (field.isReadOnly) dd.enableReadOnly();
        if (tooltipText) {
          dd.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tooltipText));
        }
        dd.addToPage(page, {
          x: coords.x,
          y: coords.y,
          width: coords.width,
          height: coords.height,
          rotate: rotDegrees
        });
        break;
      }

      case 'listbox': {
        const ol = form.createOptionList(sanitizedName);
        const rawOptions = field.options && field.options.length > 0 ? field.options : ['Option 1', 'Option 2'];
        const options = rawOptions.map(opt => this.sanitizeInput(opt)).filter(opt => opt.length > 0);
        const safeOptions = options.length > 0 ? options : ['Option 1', 'Option 2'];
        ol.setOptions(safeOptions);

        if (field.multiselect) {
          ol.enableMultiselect();
        } else {
          ol.disableMultiselect();
        }

        const activeSelection = field.defaultValue ?? field.value;
        if (activeSelection) {
          const sel = Array.isArray(activeSelection) ? activeSelection : [activeSelection];
          const validSel = sel.map(s => this.sanitizeInput(s)).filter((s: string) => safeOptions.includes(s));
          if (validSel.length > 0) {
            ol.select(validSel);
          }
        }

        if (field.fontSize != null && field.fontSize > 0) {
          ol.setFontSize(field.fontSize);
        }
        if (field.isRequired) ol.enableRequired();
        if (field.isReadOnly) ol.enableReadOnly();
        if (tooltipText) {
          ol.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tooltipText));
        }
        ol.addToPage(page, {
          x: coords.x,
          y: coords.y,
          width: coords.width,
          height: coords.height,
          rotate: rotDegrees
        });
        break;
      }

      case 'signature': {
        const sig = (form as any).createSignature(sanitizedName);
        if (tooltipText) {
          sig.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tooltipText));
        }
        let flags = 0;
        if (field.isReadOnly) flags |= 1;
        if (field.isRequired) flags |= 2;
        if (flags > 0) {
          sig.acroField.dict.set(PDFName.of('Ff'), PDFNumber.of(flags));
        }
        (sig as any).addToPage(page, {
          x: coords.x,
          y: coords.y,
          width: coords.width,
          height: coords.height,
          rotate: rotDegrees
        });
        break;
      }
    }
  }

  /**
   * Non-destructively generates a PDF containing the original document content
   * and appends new interactive AcroForm fields into the AcroForm dictionary.
   * Handles duplicate field name collisions, deep dictionary nesting, and tab order normalization.
   */
  async buildFormPdf(
    originalBytes: ArrayBuffer,
    fields: FormBuilderField[]
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(originalBytes.slice(0), { ignoreEncryption: true });

    // Validate and guard against circular or deeply nested AcroForm trees
    this.validateAcroFormStructure(pdfDoc);

    await this.ensureStandardFormResources(pdfDoc);

    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      pdfDoc.addPage([595, 842]);
    }

    // Index existing field names to prevent name collisions
    const existingFieldNames = new Set<string>();
    try {
      const existingFields = pdfDoc.getForm().getFields();
      for (const ef of existingFields) {
        existingFieldNames.add(ef.getName());
      }
    } catch {
      // Form may not yet have fields
    }

    // Sort fields by tabOrder (clean numeric sort, stable fallback)
    const sortedFields = [...fields].sort((a, b) => {
      const aVal = typeof a.tabOrder === 'number' && !isNaN(a.tabOrder) ? a.tabOrder : Number.MAX_SAFE_INTEGER;
      const bVal = typeof b.tabOrder === 'number' && !isNaN(b.tabOrder) ? b.tabOrder : Number.MAX_SAFE_INTEGER;
      return aVal - bVal;
    });

    const usedNames = new Set<string>(existingFieldNames);

    for (let i = 0; i < sortedFields.length; i++) {
      const field = sortedFields[i];

      // Disambiguate field name if duplicate exists
      let candidateName = this.sanitizeFieldName(field.name || `field_${i + 1}`);
      if (usedNames.has(candidateName)) {
        let counter = 1;
        let altName = `${candidateName}_${counter}`;
        while (usedNames.has(altName)) {
          counter++;
          altName = `${candidateName}_${counter}`;
        }
        candidateName = altName;
      }
      usedNames.add(candidateName);
      field.name = candidateName;

      // Assign monotonic sequential tabOrder
      field.tabOrder = i + 1;

      const pageIdx = (field.coordinates?.pageNumber ?? 1) - 1;
      const targetPage = pageIdx >= 0 && pageIdx < pages.length ? pages[pageIdx] : pages[0];

      // Set /Tabs /W (Widget order) on target page so standard viewers follow annotation tab order
      targetPage.node.set(PDFName.of('Tabs'), PDFName.of('W'));

      this.createFieldOnForm(pdfDoc, targetPage, field);
    }

    return await pdfDoc.save({ useObjectStreams: false });
  }

  /**
   * Builds the PDF with interactive form fields and saves the file via
   * StorageService for quota tracking and download/storage.
   */
  async saveFormPdf(
    originalBytes: ArrayBuffer,
    fields: FormBuilderField[],
    fileName = 'form_document.pdf'
  ): Promise<{ file: File; blob: Blob; sizeBytes: number; uri?: string }> {
    const pdfBytes = await this.buildFormPdf(originalBytes, fields);
    const safeName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const file = new File([blob], safeName, { type: 'application/pdf' });

    let uri: string | undefined;
    if (this.storageService) {
      try {
        uri = await this.storageService.saveFile(file, 'forms');
      } catch (err) {
        console.warn('StorageService.saveFile error:', err);
      }
    }

    return {
      file,
      blob,
      sizeBytes: file.size,
      uri
    };
  }
}
