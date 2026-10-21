import { EmailParsedData, EmailAttachmentItem, EmailHeaderData } from '../../models/conversion-features.types';

export class EmailParserHelper {
  /**
   * Parses an RFC 822 / MIME format .eml string or ArrayBuffer into structured email data.
   */
  static parseEml(rawInput: string | ArrayBuffer): EmailParsedData {
    let text = typeof rawInput === 'string' ? rawInput : new TextDecoder('utf-8').decode(rawInput);

    const warnings: string[] = [];
    const attachments: EmailAttachmentItem[] = [];
    const inlineImages = new Map<string, EmailAttachmentItem>();

    // Unfold headers: join lines that start with space or tab
    const [headerSection, ...bodyPartsArr] = text.split(/\r?\n\r?\n/);
    const unfoldedHeader = headerSection.replace(/\r?\n[ \t]+/g, ' ');

    const headers: EmailHeaderData = {};
    const headerLines = unfoldedHeader.split(/\r?\n/);
    let contentType = 'text/plain';
    let boundary: string | null = null;

    for (const hLine of headerLines) {
      const colonIdx = hLine.indexOf(':');
      if (colonIdx === -1) continue;

      const key = hLine.substring(0, colonIdx).trim().toLowerCase();
      const val = hLine.substring(colonIdx + 1).trim();

      if (key === 'from') headers.from = val;
      else if (key === 'to') headers.to = val;
      else if (key === 'cc') headers.cc = val;
      else if (key === 'bcc') headers.bcc = val;
      else if (key === 'subject') headers.subject = this.decodeHeader(val);
      else if (key === 'date') headers.date = val;
      else if (key === 'content-type') {
        contentType = val;
        const bMatch = val.match(/boundary="?([^";\s]+)"?/i);
        if (bMatch) boundary = bMatch[1];
      }
    }

    const rawBody = bodyPartsArr.join('\n\n');
    let textBody: string | undefined;
    let htmlBody: string | undefined;

    if (boundary) {
      // Multipart message
      this.parseMultipart(rawBody, boundary, (part) => {
        const pType = (part.headers['content-type'] || 'text/plain').toLowerCase();
        const disposition = (part.headers['content-disposition'] || '').toLowerCase();
        const contentId = (part.headers['content-id'] || '').replace(/[<>]/g, '').trim();

        if (pType.includes('text/html') && !htmlBody && !disposition.includes('attachment')) {
          htmlBody = part.contentString;
        } else if (pType.includes('text/plain') && !textBody && !disposition.includes('attachment')) {
          textBody = part.contentString;
        } else if (disposition.includes('attachment') || disposition.includes('inline') || contentId || pType.startsWith('image/') || pType.includes('pdf')) {
          const filename = part.filename || `attachment_${attachments.length + 1}`;
          const attItem: EmailAttachmentItem = {
            name: filename,
            mimeType: pType.split(';')[0].trim(),
            sizeBytes: part.bytes.length,
            content: part.bytes,
            contentId: contentId || undefined,
            isInline: disposition.includes('inline') || Boolean(contentId)
          };

          attachments.push(attItem);
          if (contentId) {
            inlineImages.set(contentId, attItem);
          }
        }
      });
    } else {
      // Single part message
      if (contentType.toLowerCase().includes('text/html')) {
        htmlBody = rawBody;
      } else {
        textBody = rawBody;
      }
    }

    // Process remote and inline images in HTML body
    if (htmlBody) {
      // Block remote images
      if (/<img[^>]*src=["']https?:\/\//i.test(htmlBody)) {
        warnings.push('Remote images were blocked to preserve privacy and offline operation.');
        htmlBody = htmlBody.replace(
          /<img([^>]*src=["']https?:\/\/[^"']*["'][^>]*)>/gi,
          '<div style="border: 1px dashed #999; padding: 6px; font-size: 11px; color: #666; margin: 4px 0;">[External image blocked for privacy]</div>'
        );
      }

      // Resolve cid: inline images
      htmlBody = htmlBody.replace(/src=["']cid:([^"']+)["']/gi, (match, cid) => {
        const item = inlineImages.get(cid) || attachments.find(a => a.contentId === cid);
        if (item && item.content) {
          const b64 = this.uint8ArrayToBase64(item.content);
          return `src="data:${item.mimeType};base64,${b64}"`;
        }
        return match;
      });
    }

    return {
      headers,
      textBody,
      htmlBody,
      attachments,
      inlineImages,
      warnings
    };
  }

  private static parseMultipart(
    body: string,
    boundary: string,
    onPart: (part: {
      headers: Record<string, string>;
      contentString: string;
      bytes: Uint8Array;
      filename?: string;
    }) => void
  ): void {
    const rawParts = body.split(`--${boundary}`);

    for (let i = 1; i < rawParts.length; i++) {
      const partStr = rawParts[i];
      if (partStr.trim() === '--' || partStr.startsWith('--')) continue; // End boundary

      const [pHeaderStr, ...pBodyArr] = partStr.split(/\r?\n\r?\n/);
      const unfoldedPHeaders = pHeaderStr.replace(/\r?\n[ \t]+/g, ' ');
      const pHeaders: Record<string, string> = {};
      let filename: string | undefined;

      for (const line of unfoldedPHeaders.split(/\r?\n/)) {
        const cIdx = line.indexOf(':');
        if (cIdx === -1) continue;
        const k = line.substring(0, cIdx).trim().toLowerCase();
        const v = line.substring(cIdx + 1).trim();
        pHeaders[k] = v;

        const fnMatch = v.match(/filename="?([^";\r\n]+)"?/i) || v.match(/name="?([^";\r\n]+)"?/i);
        if (fnMatch) filename = fnMatch[1];
      }

      const pBody = pBodyArr.join('\n\n').replace(/\r?\n$/, '');
      const encoding = (pHeaders['content-transfer-encoding'] || '').toLowerCase();
      const pContentType = (pHeaders['content-type'] || '').toLowerCase();

      // Check sub-boundary (multipart/related or multipart/alternative inside multipart/mixed)
      const subBoundaryMatch = pContentType.match(/boundary="?([^";\s]+)"?/i);
      if (subBoundaryMatch) {
        this.parseMultipart(pBody, subBoundaryMatch[1], onPart);
        continue;
      }

      let bytes: Uint8Array;
      let contentString = '';

      if (encoding === 'base64') {
        const cleanB64 = pBody.replace(/\s+/g, '');
        try {
          const binStr = atob(cleanB64);
          bytes = new Uint8Array(binStr.length);
          for (let b = 0; b < binStr.length; b++) bytes[b] = binStr.charCodeAt(b);
          contentString = new TextDecoder('utf-8').decode(bytes);
        } catch {
          bytes = new Uint8Array(0);
          contentString = pBody;
        }
      } else if (encoding === 'quoted-printable') {
        contentString = this.decodeQuotedPrintable(pBody);
        bytes = new TextEncoder().encode(contentString);
      } else {
        contentString = pBody;
        bytes = new TextEncoder().encode(pBody);
      }

      onPart({
        headers: pHeaders,
        contentString,
        bytes,
        filename
      });
    }
  }

  private static decodeQuotedPrintable(str: string): string {
    return str
      .replace(/=\r?\n/g, '') // Soft line breaks
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  private static decodeHeader(val: string): string {
    // Decode MIME encoded-word syntax =?utf-8?B?...?= or =?utf-8?Q?...?=
    return val.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, charset, enc, content) => {
      try {
        if (enc.toUpperCase() === 'B') {
          return atob(content);
        } else if (enc.toUpperCase() === 'Q') {
          return this.decodeQuotedPrintable(content.replace(/_/g, ' '));
        }
      } catch {
        return content;
      }
      return content;
    });
  }

  private static uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
