import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString
} from 'pdf-lib';
import {
  CombineNotice,
  CombineSource,
  FieldCollision,
  MergePreflightReport,
  MergeResolution,
  SignatureFinding
} from '../models/pdf-combine.types';

/** One field found by walking the AcroForm tree. */
interface AcroFieldNode {
  /** Fully qualified name — the name that has to be unique in a document. */
  name: string;
  /** Field type, inherited from an ancestor when the field does not declare one. */
  fieldType?: string;
  ref: PDFRef;
  dict: PDFDict;
  /** True when the field holds a value. */
  hasValue: boolean;
  /** Widget annotation refs this field renders through. */
  widgetRefs: PDFRef[];
}

/**
 * The two things that silently break when documents are merged — C5.
 *
 * **Field names.** AcroForm field names are document-global. Merge two filled
 * application forms that both call a field `applicant.name` and a reader has
 * two widgets claiming one field: typing in either changes both, and which
 * value survives a save is undefined. The merge looks fine and the form is
 * wrong, which is the worst failure available for a document somebody is about
 * to submit.
 *
 * **Signatures.** A digital signature covers a byte range of the file it was
 * made in. Merging rewrites every byte, so the signature is invalid the moment
 * the output is written — and a reader showing "signature invalid" on a
 * document somebody believes is signed is worse than no signature at all.
 *
 * Both are read by walking the /AcroForm dictionary rather than through
 * pdf-lib's form API. That API builds a typed object per field and quietly
 * drops any type it does not model — signature fields among them — so a
 * document whose only interactive element is a signature looks completely
 * clean through it. Walking the tree sees every field, whatever its type.
 *
 * Both checks run before anything is written. A document with no fields and no
 * signatures gives `clean: true`, and the screen goes straight through.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfMergePreflightService {
  /** Depth limit for the field tree, so a cyclic /Parent cannot hang a phone. */
  private readonly MAX_FIELD_DEPTH = 32;

  // ════════════════════════════════════════════════════════════════════
  // Reading the form
  // ════════════════════════════════════════════════════════════════════

  /** Decoded text of a /T entry, whichever string flavour it was written as. */
  private textOf(value: unknown): string | undefined {
    if (value instanceof PDFString || value instanceof PDFHexString) {
      try {
        return value.decodeText();
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /** The /AcroForm dictionary, or undefined when the document has no form. */
  private acroFormOf(doc: PDFDocument): PDFDict | undefined {
    try {
      return doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
    } catch {
      return undefined;
    }
  }

  /**
   * Every field in a document, with its fully qualified name.
   *
   * A field's name is its /T joined to its ancestors' by dots, which is the
   * name a reader resolves and therefore the name that can collide. Two fields
   * called `name` under different parents are `bank.name` and `school.name`
   * and do not collide — reporting them as a collision would send people
   * hunting for a problem that is not there.
   *
   * A node with /Kids is a parent when its kids carry /T of their own, and a
   * terminal field whose kids are widget annotations otherwise. Both shapes
   * are legal and both appear in forms produced by real tools.
   */
  readFields(doc: PDFDocument): AcroFieldNode[] {
    const form = this.acroFormOf(doc);
    if (!form) return [];

    const roots = form.lookupMaybe(PDFName.of('Fields'), PDFArray);
    if (!roots) return [];

    const found: AcroFieldNode[] = [];
    const visited = new Set<string>();

    const walk = (
      ref: PDFRef,
      prefix: string,
      inheritedType: string | undefined,
      depth: number
    ): void => {
      if (depth > this.MAX_FIELD_DEPTH) return;
      const key = ref.toString();
      if (visited.has(key)) return;
      visited.add(key);

      const dict = doc.context.lookupMaybe(ref, PDFDict);
      if (!dict) return;

      const partial = this.textOf(dict.get(PDFName.of('T')));
      const name = partial ? (prefix ? `${prefix}.${partial}` : partial) : prefix;

      const declaredType = dict.lookupMaybe(PDFName.of('FT'), PDFName)?.asString();
      const fieldType = declaredType ?? inheritedType;

      const kids = dict.lookupMaybe(PDFName.of('Kids'), PDFArray);
      const kidRefs: PDFRef[] = [];
      const widgetRefs: PDFRef[] = [];

      if (kids) {
        for (let i = 0; i < kids.size(); i++) {
          const entry = kids.get(i);
          if (!(entry instanceof PDFRef)) continue;

          const kid = doc.context.lookupMaybe(entry, PDFDict);
          if (!kid) continue;

          // A kid with its own /T is a field; one without is this field's widget.
          if (kid.get(PDFName.of('T')) !== undefined) {
            kidRefs.push(entry);
          } else {
            widgetRefs.push(entry);
          }
        }
      }

      if (kidRefs.length > 0) {
        for (const kidRef of kidRefs) {
          walk(kidRef, name, fieldType, depth + 1);
        }
        return;
      }

      // Terminal field. A field with no name at all is not addressable and
      // cannot collide, so it is not reported.
      if (name.length === 0) return;

      const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
      const isSelfWidget = subtype === '/Widget';

      found.push({
        name,
        fieldType,
        ref,
        dict,
        hasValue: dict.get(PDFName.of('V')) !== undefined,
        widgetRefs: isSelfWidget ? [ref, ...widgetRefs] : widgetRefs
      });
    };

    for (let i = 0; i < roots.size(); i++) {
      const entry = roots.get(i);
      if (entry instanceof PDFRef) walk(entry, '', undefined, 0);
    }

    return found;
  }

  /**
   * Reads every source's form fields and signatures.
   *
   * Signature fields are kept out of the collision list on purpose: two
   * documents that both call their signature `Signature1` are not a problem to
   * rename, because the signatures are not surviving the merge either way.
   */
  async inspect(sources: CombineSource[]): Promise<MergePreflightReport> {
    const fieldsBySource: MergePreflightReport['fieldsBySource'] = [];
    const signatures: SignatureFinding[] = [];
    let totalFieldCount = 0;

    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      let fieldNames: string[] = [];
      let signatureFields: string[] = [];
      let hasDocumentPermissions = false;
      let hasSignedValue = false;

      try {
        const doc = await PDFDocument.load(source.buffer.slice(0), {
          ignoreEncryption: true
        });

        for (const field of this.readFields(doc)) {
          if (field.fieldType === '/Sig') {
            signatureFields.push(field.name);
            if (field.hasValue) hasSignedValue = true;
          } else {
            fieldNames.push(field.name);
          }
        }

        hasDocumentPermissions = doc.catalog.get(PDFName.of('Perms')) !== undefined;
      } catch {
        /*
         * A document whose form cannot be parsed contributes no names.
         * Reporting nothing is right: this check only adds warnings, and a
         * file that cannot be inspected is not evidence of a collision.
         */
        fieldNames = [];
        signatureFields = [];
      }

      fieldsBySource.push({ sourceIndex: index, sourceName: source.name, fieldNames });
      totalFieldCount += fieldNames.length;

      if (signatureFields.length > 0 || hasDocumentPermissions) {
        signatures.push({
          sourceIndex: index,
          sourceName: source.name,
          fieldNames: signatureFields,
          hasDocumentPermissions,
          hasSignedValue
        });
      }
    }

    const collisions = this.findCollisions(fieldsBySource);

    return {
      clean: collisions.length === 0 && signatures.length === 0,
      fieldsBySource,
      collisions,
      signatures,
      totalFieldCount
    };
  }

  /** Field names that more than one source declares. */
  findCollisions(
    fieldsBySource: MergePreflightReport['fieldsBySource']
  ): FieldCollision[] {
    const byName = new Map<string, { indexes: number[]; names: string[] }>();

    for (const entry of fieldsBySource) {
      // A name repeated inside one document is that document's own business.
      for (const fieldName of new Set(entry.fieldNames)) {
        let bucket = byName.get(fieldName);
        if (!bucket) {
          bucket = { indexes: [], names: [] };
          byName.set(fieldName, bucket);
        }
        bucket.indexes.push(entry.sourceIndex);
        bucket.names.push(entry.sourceName);
      }
    }

    return Array.from(byName.entries())
      .filter(([, bucket]) => bucket.indexes.length > 1)
      .map(([fieldName, bucket]) => ({
        fieldName,
        sourceIndexes: bucket.indexes,
        sourceNames: bucket.names
      }));
  }

  // ════════════════════════════════════════════════════════════════════
  // Resolving
  // ════════════════════════════════════════════════════════════════════

  /**
   * A per-file suffix for renaming, taken from the file name.
   *
   * The file stem is what makes a renamed field recognisable later —
   * `applicant.name_bank_form` says where it came from, `applicant.name_2`
   * does not. The index is the fallback for a name that sanitizes to nothing,
   * which a fully non-Latin file name does.
   */
  suffixFor(source: CombineSource, index: number): string {
    const stem = source.name
      .replace(/\.pdf$/i, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);
    return stem.length > 0 ? stem : `file${index + 1}`;
  }

  /**
   * Applies a resolution to one source and returns its new bytes.
   *
   * Everything happens in the source document before any page is copied,
   * which is the only point at which the fields are still reachable: once a
   * page has been copied into the merged document its widgets are annotations
   * on a page, not entries in a form.
   *
   * A source with nothing to resolve gets its original buffer back —
   * the same object, so it is not even re-serialised.
   */
  async applyResolution(
    source: CombineSource,
    sourceIndex: number,
    resolution: MergeResolution,
    collisions: FieldCollision[],
    signatures: SignatureFinding[]
  ): Promise<{ buffer: ArrayBuffer; notices: CombineNotice[] }> {
    const notices: CombineNotice[] = [];
    const collidingNames = new Set(
      collisions
        .filter(collision => collision.sourceIndexes.includes(sourceIndex))
        .map(collision => collision.fieldName)
    );
    const signedHere = signatures.some(finding => finding.sourceIndex === sourceIndex);

    const needsFieldWork = collidingNames.size > 0 && resolution.fields !== 'cancel';
    const needsSignatureWork = resolution.signatures === 'strip' && signedHere;

    if (!needsFieldWork && !needsSignatureWork) {
      return { buffer: source.buffer, notices };
    }

    const doc = await PDFDocument.load(source.buffer.slice(0), { ignoreEncryption: true });

    if (needsSignatureWork) {
      const stripped = this.stripSignatures(doc);
      if (stripped > 0) {
        notices.push({ kind: 'signatures-stripped', count: stripped, detail: source.name });
      }
    }

    if (needsFieldWork && resolution.fields === 'flatten') {
      try {
        doc.getForm().flatten({ updateFieldAppearances: true });
        notices.push({
          kind: 'fields-flattened',
          count: collidingNames.size,
          detail: source.name
        });
      } catch {
        /*
         * Flattening a form whose appearance streams pdf-lib cannot regenerate
         * throws rather than producing a half-flattened document. Renaming is
         * the safe fallback, and is reported as what actually happened.
         */
        const renamed = this.renameFields(
          doc,
          collidingNames,
          this.suffixFor(source, sourceIndex)
        );
        if (renamed > 0) {
          notices.push({ kind: 'fields-renamed', count: renamed, detail: source.name });
        }
      }
    } else if (needsFieldWork) {
      const renamed = this.renameFields(
        doc,
        collidingNames,
        this.suffixFor(source, sourceIndex)
      );
      if (renamed > 0) {
        notices.push({ kind: 'fields-renamed', count: renamed, detail: source.name });
      }
    }

    const bytes = await doc.save({ useObjectStreams: false });
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    return { buffer, notices };
  }

  /**
   * Renames the named fields by appending a suffix to their /T entry.
   *
   * Only /T is written, so /V — the value somebody typed — is untouched, and
   * only the field's own terminal name changes, so a hierarchy stays intact.
   * The returned count is how many were actually renamed, which is what the
   * report states rather than how many were asked for.
   */
  renameFields(doc: PDFDocument, names: Set<string>, suffix: string): number {
    let renamed = 0;

    for (const field of this.readFields(doc)) {
      if (!names.has(field.name)) continue;

      const partial = this.textOf(field.dict.get(PDFName.of('T')));
      if (partial === undefined) continue;

      // Hex, not a literal string: a field name may be in any script.
      field.dict.set(
        PDFName.of('T'),
        PDFHexString.fromText(`${partial}_${suffix}`)
      );
      renamed++;
    }

    return renamed;
  }

  /**
   * Removes signature fields, their widget annotations and the document-level
   * permissions entry.
   *
   * The widgets go too: leaving a signature's appearance on the page with its
   * value removed produces a document that *looks* signed and is not, which is
   * the one outcome worth more effort to avoid than either alternative.
   */
  stripSignatures(doc: PDFDocument): number {
    let removed = 0;

    try {
      const signatureFields = this.readFields(doc).filter(
        field => field.fieldType === '/Sig'
      );
      if (signatureFields.length === 0 && doc.catalog.get(PDFName.of('Perms')) === undefined) {
        return 0;
      }

      const widgetKeys = new Set<string>();
      const fieldKeys = new Set<string>();

      for (const field of signatureFields) {
        fieldKeys.add(field.ref.toString());
        for (const widgetRef of field.widgetRefs) {
          widgetKeys.add(widgetRef.toString());
        }
        removed++;
      }

      if (widgetKeys.size > 0) this.removeAnnotations(doc, widgetKeys);
      if (fieldKeys.size > 0) this.removeFormFields(doc, fieldKeys);

      if (doc.catalog.get(PDFName.of('Perms')) !== undefined) {
        doc.catalog.delete(PDFName.of('Perms'));
      }

      const acroForm = this.acroFormOf(doc);
      if (acroForm?.get(PDFName.of('SigFlags')) !== undefined) {
        acroForm.delete(PDFName.of('SigFlags'));
      }
    } catch {
      // Nothing removed, nothing claimed: the caller reports the count.
    }

    return removed;
  }

  /** Drops the given refs from every page's /Annots array. */
  private removeAnnotations(doc: PDFDocument, refKeys: Set<string>): void {
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      if (!annots) continue;

      // Walk backwards: removing shifts every index above the one removed.
      for (let i = annots.size() - 1; i >= 0; i--) {
        const entry = annots.get(i);
        if (entry instanceof PDFRef && refKeys.has(entry.toString())) {
          annots.remove(i);
        }
      }
    }
  }

  /** Drops the given refs from /AcroForm /Fields. */
  private removeFormFields(doc: PDFDocument, refKeys: Set<string>): void {
    const acroForm = this.acroFormOf(doc);
    const fields = acroForm?.lookupMaybe(PDFName.of('Fields'), PDFArray);
    if (!fields) return;

    for (let i = fields.size() - 1; i >= 0; i--) {
      const entry = fields.get(i);
      if (entry instanceof PDFRef && refKeys.has(entry.toString())) {
        fields.remove(i);
      }
    }
  }

  /**
   * Re-registers the form fields of a merged document.
   *
   * `copyPages` brings a page's widget annotations across but does not touch
   * the target's /AcroForm, so a merged form has widgets no reader can find:
   * they render, and nothing can be typed into them. This walks the finished
   * document's pages, collects the field dictionaries its widgets belong to,
   * and writes them into /AcroForm /Fields.
   *
   * /NeedAppearances goes on at the same time, which asks the reader to
   * regenerate each field's appearance from its value — the cheapest correct
   * answer when the appearance streams came from several documents with
   * different default resources.
   *
   * Returns 0 for a document with no widgets, and leaves it untouched, so a
   * merge of documents with no forms is unchanged down to the byte.
   */
  rebuildAcroForm(doc: PDFDocument): number {
    const fieldRefs: PDFRef[] = [];
    const seen = new Set<string>();

    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      if (!annots) continue;

      for (let i = 0; i < annots.size(); i++) {
        const entry = annots.get(i);
        if (!(entry instanceof PDFRef)) continue;

        const annot = doc.context.lookupMaybe(entry, PDFDict);
        if (!annot) continue;

        const subtype = annot.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
        if (subtype !== '/Widget') continue;

        /*
         * A widget is either the field itself (it carries /T) or a kid of one
         * (the field is its /Parent). Register the topmost ancestor that still
         * has a /T, which is the node a reader resolves the name from.
         */
        let fieldRef: PDFRef = entry;
        let fieldDict: PDFDict = annot;

        for (let depth = 0; depth < this.MAX_FIELD_DEPTH; depth++) {
          const parentRef = fieldDict.get(PDFName.of('Parent'));
          if (!(parentRef instanceof PDFRef)) break;

          const parent = doc.context.lookupMaybe(parentRef, PDFDict);
          if (!parent || parent.get(PDFName.of('T')) === undefined) break;

          fieldRef = parentRef;
          fieldDict = parent;
        }

        const key = fieldRef.toString();
        if (seen.has(key)) continue;
        seen.add(key);
        fieldRefs.push(fieldRef);
      }
    }

    if (fieldRefs.length === 0) return 0;

    const acroForm = this.acroFormOf(doc);
    if (acroForm) {
      acroForm.set(PDFName.of('Fields'), doc.context.obj(fieldRefs));
      acroForm.set(PDFName.of('NeedAppearances'), doc.context.obj(true));
    } else {
      const ref = doc.context.register(
        doc.context.obj({
          Fields: fieldRefs,
          NeedAppearances: true
        })
      );
      doc.catalog.set(PDFName.of('AcroForm'), ref);
    }

    return fieldRefs.length;
  }
}
