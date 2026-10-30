import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';
import { ShareService } from './share.service';
import {
  AmbiguousDateInfo,
  ContactCalendarExtractionResult,
  ContactCalendarMode,
  ExtractedCalendarEvent,
  ExtractedContact
} from '../models/contact-calendar.types';

@Injectable({
  providedIn: 'root'
})
export class ContactCalendarExtractorService {
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);

  /**
   * Main extractor: processes text in either 'contact' or 'calendar' mode.
   */
  extract(
    rawText: string,
    forcedMode?: ContactCalendarMode
  ): ContactCalendarExtractionResult {
    const cleanRaw = this.sanitizeInputText(rawText || '');
    const mode = forcedMode || this.inferMode(cleanRaw);
    const ambiguousDates = this.detectAmbiguousDates(cleanRaw);

    let contact: ExtractedContact | undefined;
    let calendarEvent: ExtractedCalendarEvent | undefined;
    let vCardString: string | undefined;
    let iCalString: string | undefined;

    if (mode === 'contact') {
      contact = this.extractContact(cleanRaw);
      vCardString = this.buildVCard(contact);
    } else {
      calendarEvent = this.extractCalendarEvent(cleanRaw);
      iCalString = this.buildICal(calendarEvent);
    }

    return {
      mode,
      contact,
      calendarEvent,
      ambiguousDates,
      rawText: cleanRaw,
      vCardString,
      iCalString
    };
  }

  /**
   * Infers whether the input text looks more like a business card or a calendar schedule.
   */
  inferMode(text: string): ContactCalendarMode {
    const lower = text.toLowerCase();
    const eventKeywords = [
      'meeting', 'webinar', 'conference', 'schedule', 'am -', 'pm -', 'zoom', 'google meet',
      'teams.microsoft', 'agenda', 'dtstart', 'session', 'workshop', 'invitation', 'venue:', 'time:'
    ];
    let eventScore = 0;
    for (const kw of eventKeywords) {
      if (lower.includes(kw)) eventScore += 10;
    }

    const contactKeywords = [
      'director', 'manager', 'founder', 'ceo', 'consultant', 'advocate', 'engineer',
      'mob:', 'cell:', 'tel:', 'pvt ltd', 'corp', 'associate', 'ph:', 'designation:', 'office:'
    ];
    let contactScore = 0;
    for (const kw of contactKeywords) {
      if (lower.includes(kw)) contactScore += 10;
    }

    return eventScore > contactScore ? 'calendar' : 'contact';
  }

  /**
   * Business Card Extractor:
   * Extracts Full Name, Job Title, Organization, Phones (Mobile, Work), Email, Website, and Address.
   */
  extractContact(text: string): ExtractedContact {
    const lines = text
      .split(/\r?\n/)
      .map(l => this.sanitizeInputText(l.trim()))
      .filter(l => l.length > 0);

    let fullName = '';
    let jobTitle = '';
    let organization = '';
    let mobilePhone = '';
    let workPhone = '';
    let email = '';
    let websiteUrl = '';
    let street = '';
    let city = '';
    let state = '';
    let postalCode = '';
    let country = '';
    let fullAddress = '';

    // Regex patterns
    const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/i;
    const urlRegex = /\b(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?\b/i;
    // Multi-country phone support: +91 (India), +1 (US), +44 (UK), etc.
    const phoneRegex = /(?:\+(?:91|1|44|61|81|49|33|86)[\s\-]?)?(?:(?:\(\d{1,4}\)|\d{1,4})[\s\-]?)?\d{3,5}[\s\-]?\d{3,5}|\b[6-9]\d{9}\b|\+?\d{1,3}[\s\-\.]?\(?\d{2,4}\)?[\s\-\.]?\d{3,5}[\s\-\.]?\d{3,5}/g;
    const pinRegex = /\b([1-9][0-9]{5}|\b[0-9]{5}(?:-[0-9]{4})?|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
    const titleKeywords = /\b(CEO|CTO|CFO|COO|President|Director|Manager|Architect|Engineer|Developer|Consultant|Founder|Co-Founder|Partner|Advocate|Doctor|Dr\.|Professor|Designer|Lead|Officer|Chief|Head|Specialist|Scientist|Executive)\b/i;
    const orgKeywords = /\b(Technologies|Solutions|Services|Corp|Corporation|Inc|LLC|Pvt\s*Ltd|Limited|Enterprises|Industries|Labs|Studio|Agency|Group|Holdings)\b/i;

    const matchedPhones: { type: 'mobile' | 'work'; number: string }[] = [];

    // First pass: Email, URLs, and Phones
    for (const line of lines) {
      // Email
      if (!email) {
        const eMatch = line.match(emailRegex);
        if (eMatch) email = this.stripNewlines(eMatch[0]);
      }

      // Website URL
      if (!websiteUrl) {
        const uMatch = line.match(urlRegex);
        if (uMatch) {
          websiteUrl = this.sanitizeUrl(uMatch[0]);
        }
      }

      // Phones
      const pMatches = line.match(phoneRegex);
      if (pMatches) {
        for (const p of pMatches) {
          const clean = this.formatPhoneNumber(p);
          if (clean.length >= 8) {
            const isWork = /\b(work|office|tel|fax|landline|desk)\b/i.test(line);
            matchedPhones.push({
              type: isWork ? 'work' : 'mobile',
              number: clean
            });
          }
        }
      }
    }

    if (matchedPhones.length > 0) {
      const mob = matchedPhones.find(p => p.type === 'mobile');
      mobilePhone = mob ? mob.number : matchedPhones[0].number;

      const wrk = matchedPhones.find(p => p.type === 'work' && p.number !== mobilePhone);
      if (wrk) {
        workPhone = wrk.number;
      } else if (matchedPhones.length > 1 && matchedPhones[1].number !== mobilePhone) {
        workPhone = matchedPhones[1].number;
      }
    }

    // Second pass: Address clustering
    const addressLines: string[] = [];
    for (const line of lines) {
      if (
        (email && line.includes(email)) ||
        (websiteUrl && line.includes(websiteUrl)) ||
        matchedPhones.some(p => line.includes(p.number))
      ) {
        continue;
      }

      if (
        /\b(street|road|rd|st|lane|marg|nagar|sector|layout|cross|block|floor|suite|building|pin|pincode|baker)\b/i.test(line) ||
        pinRegex.test(line)
      ) {
        addressLines.push(line);
      }
    }

    if (addressLines.length > 0) {
      fullAddress = addressLines.join(', ');
      street = addressLines[0];

      // Extract postal code
      const pinMatch = fullAddress.match(pinRegex);
      if (pinMatch) postalCode = pinMatch[0];

      // City & State guess
      const segments = fullAddress.split(',').map(s => s.trim());
      if (segments.length >= 2) {
        city = segments[segments.length - 2].replace(pinRegex, '').trim();
      }
    }

    // Third pass: Name, Title, and Organization
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (
        (email && line.includes(email)) ||
        (websiteUrl && line.includes(websiteUrl)) ||
        addressLines.includes(line) ||
        matchedPhones.some(p => line.includes(p.number))
      ) {
        continue;
      }

      // Explicit labels
      if (/^(?:name|full\s*name)\s*[:\-]\s*(.+)$/i.test(line)) {
        fullName = line.replace(/^(?:name|full\s*name)\s*[:\-]\s*/i, '').trim();
        continue;
      }
      if (/^(?:title|designation|job\s*title)\s*[:\-]\s*(.+)$/i.test(line)) {
        jobTitle = line.replace(/^(?:title|designation|job\s*title)\s*[:\-]\s*/i, '').trim();
        continue;
      }
      if (/^(?:company|organization|org)\s*[:\-]\s*(.+)$/i.test(line)) {
        organization = line.replace(/^(?:company|organization|org)\s*[:\-]\s*/i, '').trim();
        continue;
      }

      // Keyword match for Job Title
      if (!jobTitle && titleKeywords.test(line)) {
        jobTitle = line;
        continue;
      }

      // Keyword match for Organization
      if (!organization && orgKeywords.test(line)) {
        organization = line;
        continue;
      }

      // Fallback for Name: first clean line without symbols or numbers
      if (!fullName && /^[A-Za-z\s\.\,\'\-]+$/.test(line) && line.split(' ').length <= 4) {
        fullName = line;
      }
    }

    // Split name into first & last
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts.length > 0 ? nameParts[0] : '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    const confidence = fullName ? 92 : 60;

    return {
      fullName: this.stripNewlines(fullName),
      firstName: this.stripNewlines(firstName),
      lastName: this.stripNewlines(lastName),
      jobTitle: this.stripNewlines(jobTitle),
      organization: this.stripNewlines(organization),
      mobilePhone: this.stripNewlines(mobilePhone),
      workPhone: this.stripNewlines(workPhone),
      email: this.stripNewlines(email),
      websiteUrl: this.sanitizeUrl(websiteUrl),
      address: {
        street: this.stripNewlines(street),
        city: this.stripNewlines(city),
        state: this.stripNewlines(state),
        postalCode: this.stripNewlines(postalCode),
        country: country || (mobilePhone.startsWith('+44') ? 'United Kingdom' : mobilePhone.startsWith('+1') ? 'United States' : 'India'),
        fullAddress: this.stripNewlines(fullAddress)
      },
      confidence
    };
  }

  /**
   * Builds RFC-compliant vCard 3.0 string with clean character escaping and strict CRLF stripping.
   */
  buildVCard(contact: ExtractedContact, version: '3.0' | '4.0' = '3.0'): string {
    const lines: string[] = [
      'BEGIN:VCARD',
      `VERSION:${version}`
    ];

    if (contact.fullName) {
      const cleanFull = this.stripNewlines(contact.fullName);
      lines.push(`FN:${this.escapeVCard(cleanFull)}`);
      const last = this.stripNewlines(contact.lastName || '');
      const first = this.stripNewlines(contact.firstName || contact.fullName);
      lines.push(`N:${this.escapeVCard(last)};${this.escapeVCard(first)};;;`);
    }

    if (contact.organization) {
      lines.push(`ORG:${this.escapeVCard(this.stripNewlines(contact.organization))}`);
    }

    if (contact.jobTitle) {
      lines.push(`TITLE:${this.escapeVCard(this.stripNewlines(contact.jobTitle))}`);
    }

    if (contact.mobilePhone) {
      lines.push(`TEL;TYPE=CELL:${this.stripNewlines(contact.mobilePhone)}`);
    }

    if (contact.workPhone) {
      lines.push(`TEL;TYPE=WORK:${this.stripNewlines(contact.workPhone)}`);
    }

    if (contact.email) {
      lines.push(`EMAIL;TYPE=INTERNET:${this.stripNewlines(contact.email)}`);
    }

    if (contact.websiteUrl) {
      const safeUrl = this.sanitizeUrl(contact.websiteUrl);
      if (safeUrl) {
        lines.push(`URL:${this.stripNewlines(safeUrl)}`);
      }
    }

    if (contact.address && (contact.address.fullAddress || contact.address.street)) {
      const st = this.stripNewlines(contact.address.street || contact.address.fullAddress || '');
      const city = this.stripNewlines(contact.address.city || '');
      const state = this.stripNewlines(contact.address.state || '');
      const zip = this.stripNewlines(contact.address.postalCode || '');
      const country = this.stripNewlines(contact.address.country || '');
      lines.push(`ADR;TYPE=WORK:;;${this.escapeVCard(st)};${this.escapeVCard(city)};${this.escapeVCard(state)};${this.escapeVCard(zip)};${this.escapeVCard(country)}`);
    }

    if (contact.notes) {
      lines.push(`NOTE:${this.escapeMultiline(contact.notes)}`);
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  /**
   * Helper to parse a vCard 3.0 / 4.0 string back into an ExtractedContact object.
   */
  parseVCard(vcardStr: string): ExtractedContact {
    const lines = vcardStr.split(/\r?\n/);
    let fullName = '';
    let firstName = '';
    let lastName = '';
    let organization = '';
    let jobTitle = '';
    let mobilePhone = '';
    let workPhone = '';
    let email = '';
    let websiteUrl = '';
    let street = '';
    let city = '';
    let state = '';
    let postalCode = '';
    let country = '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('FN:')) {
        fullName = this.unescapeVCard(line.substring(3));
      } else if (line.startsWith('N:')) {
        const parts = line.substring(2).split(';');
        lastName = this.unescapeVCard(parts[0] || '');
        firstName = this.unescapeVCard(parts[1] || '');
      } else if (line.startsWith('ORG:')) {
        organization = this.unescapeVCard(line.substring(4));
      } else if (line.startsWith('TITLE:')) {
        jobTitle = this.unescapeVCard(line.substring(6));
      } else if (line.startsWith('TEL;TYPE=CELL:') || line.startsWith('TEL;TYPE=MOBILE:')) {
        mobilePhone = line.split(':')[1] || '';
      } else if (line.startsWith('TEL;TYPE=WORK:') || (!workPhone && line.startsWith('TEL:'))) {
        workPhone = line.split(':')[1] || '';
      } else if (line.startsWith('EMAIL') && line.includes(':')) {
        email = line.substring(line.indexOf(':') + 1);
      } else if (line.startsWith('URL:')) {
        websiteUrl = line.substring(4);
      } else if (line.startsWith('ADR') && line.includes(':')) {
        const val = line.substring(line.indexOf(':') + 1);
        const parts = val.split(';');
        street = this.unescapeVCard(parts[2] || '');
        city = this.unescapeVCard(parts[3] || '');
        state = this.unescapeVCard(parts[4] || '');
        postalCode = this.unescapeVCard(parts[5] || '');
        country = this.unescapeVCard(parts[6] || '');
      }
    }

    return {
      fullName,
      firstName,
      lastName,
      jobTitle,
      organization,
      mobilePhone,
      workPhone,
      email,
      websiteUrl: this.sanitizeUrl(websiteUrl),
      address: {
        street,
        city,
        state,
        postalCode,
        country,
        fullAddress: [street, city, state, postalCode, country].filter(Boolean).join(', ')
      },
      confidence: 100
    };
  }

  /**
   * Calendar Event Extractor:
   * Extracts Title, Start/End Date/Time, Location, Meeting Links (Zoom, Meet, Teams), and Notes.
   */
  extractCalendarEvent(text: string): ExtractedCalendarEvent {
    const lines = text
      .split(/\r?\n/)
      .map(l => this.sanitizeInputText(l.trim()))
      .filter(l => l.length > 0);

    let title = '';
    let startDate = '';
    let startTime = '';
    let endDate = '';
    let endTime = '';
    let isAllDay = true;
    let location = '';
    let meetingLink = '';
    let description = '';

    // Meeting link patterns
    const zoomRegex = /https:\/\/[a-zA-Z0-9.\-_]*zoom\.us\/[^\s]+/i;
    const meetRegex = /https:\/\/meet\.google\.com\/[a-zA-Z0-9\-_]+/i;
    const teamsRegex = /https:\/\/teams\.microsoft\.com\/[^\s]+/i;
    const webexRegex = /https:\/\/[a-zA-Z0-9.\-_]*webex\.com\/[^\s]+/i;

    // Time pattern: 10:00 AM, 2:30 PM, 14:00, etc.
    const timeRegex = /\b([01]?[0-9]|2[0-3]):([0-5][0-9])\s*(AM|PM)?\b/gi;
    const timeRangeRegex = /\b([01]?[0-9]|2[0-3]):([0-5][0-9])\s*(AM|PM)?\s*(?:to|-|–)\s*([01]?[0-9]|2[0-3]):([0-5][0-9])\s*(AM|PM)?\b/i;

    // Dates
    const isoDateRegex = /\b(\d{4})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/;
    const indianDateRegex = /\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](\d{4})\b/;
    const textDateRegex = /\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?[\s\-_]{1,3}(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,\s\-_]{1,3}(\d{4})\b/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Meeting link
      if (!meetingLink) {
        const m = line.match(zoomRegex) || line.match(meetRegex) || line.match(teamsRegex) || line.match(webexRegex);
        if (m) meetingLink = this.sanitizeUrl(m[0]);
      }

      // Title
      if (/^(?:event|title|subject|meeting)\s*[:\-]\s*(.+)$/i.test(line)) {
        title = line.replace(/^(?:event|title|subject|meeting)\s*[:\-]\s*/i, '').trim();
      }

      // Location
      if (/^(?:location|venue|where)\s*[:\-]\s*(.+)$/i.test(line)) {
        location = line.replace(/^(?:location|venue|where)\s*[:\-]\s*/i, '').trim();
      }

      // Date detection
      if (!startDate) {
        const isoM = line.match(isoDateRegex);
        if (isoM) {
          startDate = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
        } else {
          const indM = line.match(indianDateRegex);
          if (indM) {
            startDate = `${indM[3]}-${indM[2]}-${indM[1]}`;
          } else {
            const txtM = line.match(textDateRegex);
            if (txtM) {
              const monthNum = this.monthNameToNumber(txtM[2]);
              const dayStr = txtM[1].padStart(2, '0');
              startDate = `${txtM[3]}-${monthNum}-${dayStr}`;
            }
          }
        }
      }

      // Time range detection: 10:00 AM - 11:30 AM
      const rangeM = line.match(timeRangeRegex);
      if (rangeM && !startTime) {
        isAllDay = false;
        startTime = this.normalizeTime(rangeM[1], rangeM[2], rangeM[3]);
        endTime = this.normalizeTime(rangeM[4], rangeM[5], rangeM[6]);
      } else if (!startTime) {
        const singleTimes = [...line.matchAll(timeRegex)];
        if (singleTimes.length > 0) {
          isAllDay = false;
          startTime = this.normalizeTime(singleTimes[0][1], singleTimes[0][2], singleTimes[0][3]);
          if (singleTimes.length > 1) {
            endTime = this.normalizeTime(singleTimes[1][1], singleTimes[1][2], singleTimes[1][3]);
          }
        }
      }
    }

    // Default title if not explicitly labeled
    if (!title && lines.length > 0) {
      for (const line of lines) {
        if (!line.includes('http') && !line.match(isoDateRegex) && !line.match(indianDateRegex) && line.length > 3) {
          title = line;
          break;
        }
      }
    }

    if (!startDate) {
      const today = new Date();
      startDate = today.toISOString().split('T')[0];
    }
    if (!endDate) {
      endDate = startDate;
    }

    if (!isAllDay && startTime && !endTime) {
      const [h, m] = startTime.split(':').map(Number);
      const nextH = (h + 1) % 24;
      endTime = `${nextH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    description = lines.filter(l => l !== title && !l.includes(meetingLink)).slice(0, 4).join('\n');

    return {
      title: this.stripNewlines(title || 'Scheduled Event'),
      startDate: this.stripNewlines(startDate),
      startTime: isAllDay ? undefined : this.stripNewlines(startTime),
      endDate: this.stripNewlines(endDate),
      endTime: isAllDay ? undefined : this.stripNewlines(endTime),
      isAllDay,
      location: this.stripNewlines(location || (meetingLink ? 'Online Meeting' : '')),
      meetingLink: this.sanitizeUrl(meetingLink),
      description: this.stripNewlines(description),
      confidence: 88
    };
  }

  /**
   * Builds an RFC 5545 compliant iCalendar string with strict CRLF injection protection.
   */
  buildICal(event: ExtractedCalendarEvent): string {
    const uid = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}@indianformhelper.app`;
    const nowUtc = this.formatUtcTimestamp(new Date());

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Indian Form Helper//Intelligence//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowUtc}`
    ];

    if (event.isAllDay) {
      const cleanStart = event.startDate.replace(/[^0-9]/g, '');
      // RFC 5545 section 3.8.2.2: DTEND for all-day events is non-inclusive (the day after)
      const nextDay = this.calculateNextCalendarDay(event.endDate || event.startDate);
      lines.push(`DTSTART;VALUE=DATE:${cleanStart}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay}`);
    } else {
      const startDt = this.formatICalDateTime(event.startDate, event.startTime || '09:00');
      const endDt = this.formatICalDateTime(event.endDate || event.startDate, event.endTime || '10:00');
      lines.push(`DTSTART:${startDt}`);
      lines.push(`DTEND:${endDt}`);
    }

    lines.push(`SUMMARY:${this.escapeICal(this.stripNewlines(event.title))}`);

    if (event.description) {
      lines.push(`DESCRIPTION:${this.escapeMultiline(event.description)}`);
    }

    if (event.location) {
      lines.push(`LOCATION:${this.escapeICal(this.stripNewlines(event.location))}`);
    }

    if (event.meetingLink) {
      const safeUrl = this.sanitizeUrl(event.meetingLink);
      if (safeUrl) {
        lines.push(`URL:${this.stripNewlines(safeUrl)}`);
      }
    }

    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  }

  /**
   * Helper to parse an RFC 5545 iCalendar string back into an ExtractedCalendarEvent object.
   */
  parseICal(icalStr: string): ExtractedCalendarEvent {
    const lines = icalStr.split(/\r?\n/);
    let title = '';
    let startDate = '';
    let startTime: string | undefined;
    let endDate = '';
    let endTime: string | undefined;
    let isAllDay = true;
    let location = '';
    let description = '';
    let meetingLink = '';

    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('SUMMARY:')) {
        title = this.unescapeICal(line.substring(8));
      } else if (line.startsWith('LOCATION:')) {
        location = this.unescapeICal(line.substring(9));
      } else if (line.startsWith('DESCRIPTION:')) {
        description = this.unescapeICal(line.substring(12));
      } else if (line.startsWith('URL:')) {
        meetingLink = this.sanitizeUrl(line.substring(4));
      } else if (line.startsWith('DTSTART')) {
        const val = line.split(':')[1] || '';
        if (line.includes('VALUE=DATE') || val.length === 8) {
          isAllDay = true;
          startDate = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
        } else if (val.includes('T')) {
          isAllDay = false;
          startDate = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
          startTime = `${val.substring(9, 11)}:${val.substring(11, 13)}`;
        }
      } else if (line.startsWith('DTEND')) {
        const val = line.split(':')[1] || '';
        if (line.includes('VALUE=DATE') || val.length === 8) {
          // Revert exclusive next-day back to inclusive date
          endDate = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
        } else if (val.includes('T')) {
          endDate = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
          endTime = `${val.substring(9, 11)}:${val.substring(11, 13)}`;
        }
      }
    }

    return {
      title,
      startDate,
      startTime,
      endDate: endDate || startDate,
      endTime,
      isAllDay,
      location,
      meetingLink,
      description,
      confidence: 100
    };
  }

  /**
   * Ambiguous Date Disambiguation:
   * Detects patterns like "05/06/2026" where both numbers are <= 12 and not equal.
   * Generates prompt: "Is this May 6 or June 5?" — NEVER assumes silently.
   */
  detectAmbiguousDates(text: string): AmbiguousDateInfo[] {
    const results: AmbiguousDateInfo[] = [];
    const dateRegex = /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{4})\b/g;

    const matches = [...text.matchAll(dateRegex)];
    for (const match of matches) {
      const part1 = parseInt(match[1], 10);
      const part2 = parseInt(match[2], 10);
      const year = match[3];

      if (part1 <= 12 && part2 <= 12 && part1 !== part2) {
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const optionA_Month = part1;
        const optionA_Day = part2;
        const optionB_Month = part2;
        const optionB_Day = part1;

        const nameA = monthNames[optionA_Month - 1];
        const nameB = monthNames[optionB_Month - 1];

        const isoA = `${year}-${optionA_Month.toString().padStart(2, '0')}-${optionA_Day.toString().padStart(2, '0')}`;
        const isoB = `${year}-${optionB_Month.toString().padStart(2, '0')}-${optionB_Day.toString().padStart(2, '0')}`;

        results.push({
          rawString: match[0],
          optionA: {
            isoDate: isoA,
            displayDate: `${nameA} ${optionA_Day}, ${year}`,
            formatName: 'MM/DD/YYYY'
          },
          optionB: {
            isoDate: isoB,
            displayDate: `${nameB} ${optionB_Day}, ${year}`,
            formatName: 'DD/MM/YYYY'
          },
          questionPrompt: `Is this ${nameA} ${optionA_Day} or ${nameB} ${optionB_Day}?`
        });
      }
    }

    return results;
  }

  /**
   * Saves vCard file via StorageService.saveFile.
   */
  async saveVCard(
    contact: ExtractedContact,
    filename: string = 'contact.vcf'
  ): Promise<{ file: File; savedUri?: string }> {
    const vcard = this.buildVCard(contact);
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8;' });
    const targetName = filename.endsWith('.vcf') ? filename : `${filename}.vcf`;

    const file = typeof File !== 'undefined'
      ? new File([blob], targetName, { type: 'text/vcard' })
      : ({ name: targetName, size: blob.size, type: 'text/vcard' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'contact-vcf', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  /**
   * Saves .ics calendar event via StorageService.saveFile.
   */
  async saveICal(
    event: ExtractedCalendarEvent,
    filename: string = 'event.ics'
  ): Promise<{ file: File; savedUri?: string }> {
    const ical = this.buildICal(event);
    const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8;' });
    const targetName = filename.endsWith('.ics') ? filename : `${filename}.ics`;

    const file = typeof File !== 'undefined'
      ? new File([blob], targetName, { type: 'text/calendar' })
      : ({ name: targetName, size: blob.size, type: 'text/calendar' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'event-ics', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  /**
   * Shares contact via native Android intent or Web Share API.
   * Handles dismiss cancellations safely without throwing.
   */
  async shareContact(contact: ExtractedContact): Promise<boolean> {
    try {
      const vcard = this.buildVCard(contact);
      return await this.shareService.share({
        title: contact.fullName || 'Contact',
        text: vcard
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Share canceled') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Shares event via native Android intent or Web Share API.
   * Handles dismiss cancellations safely without throwing.
   */
  async shareCalendarEvent(event: ExtractedCalendarEvent): Promise<boolean> {
    try {
      const ical = this.buildICal(event);
      return await this.shareService.share({
        title: event.title || 'Event',
        text: ical
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Share canceled') {
        return false;
      }
      throw err;
    }
  }

  // --- Cybersecurity Sanitizers & Utilities ---

  /**
   * Enforces strict URL scheme whitelisting (http, https only).
   * Strips malicious schemes such as javascript:, data:text/html, vbscript:.
   */
  sanitizeUrl(rawUrl?: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const clean = rawUrl.replace(/[\x00-\x1F\x7F\s]+/g, '').trim();
    if (/^https?:\/\/[a-zA-Z0-9\-\._~:\/?#\[\]@!$&'()*+,;=%]+$/i.test(clean)) {
      return clean;
    }
    if (/^[a-zA-Z0-9.\-_]+\.[a-zA-Z]{2,}(?:\/.*)?$/i.test(clean)) {
      return `https://${clean}`;
    }
    return '';
  }

  /**
   * Strips raw newlines (\r, \n) and control characters to prevent CRLF injection in single-line headers.
   */
  stripNewlines(str?: string): string {
    if (!str) return '';
    return str.replace(/[\r\n\x00-\x1F\x7F]+/g, ' ').trim();
  }

  /**
   * Strips script/style tags, HTML tags, inline event handlers, and javascript: protocols (XSS defense).
   */
  sanitizeInputText(input: string): string {
    if (!input || typeof input !== 'string') return '';
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/[<>]/g, '')
      .trim();
  }

  private formatPhoneNumber(raw: string): string {
    const digitsOnly = raw.replace(/[^0-9+]/g, '');
    if (digitsOnly.length === 10 && !digitsOnly.startsWith('+')) {
      return `+91 ${digitsOnly.substring(0, 5)} ${digitsOnly.substring(5)}`;
    }
    if (digitsOnly.startsWith('+91') && digitsOnly.length === 13) {
      const rest = digitsOnly.substring(3);
      return `+91 ${rest.substring(0, 5)} ${rest.substring(5)}`;
    }
    return digitsOnly;
  }

  private normalizeTime(hStr: string, mStr: string, ampm?: string): string {
    let h = parseInt(hStr, 10);
    const m = mStr ? mStr.padStart(2, '0') : '00';
    if (ampm) {
      const upper = ampm.toUpperCase();
      if (upper === 'PM' && h < 12) h += 12;
      if (upper === 'AM' && h === 12) h = 0;
    }
    return `${h.toString().padStart(2, '0')}:${m}`;
  }

  private monthNameToNumber(name: string): string {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const key = name.toLowerCase().substring(0, 3);
    return months[key] || '01';
  }

  private formatUtcTimestamp(d: Date): string {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  private formatICalDateTime(dateStr: string, timeStr: string): string {
    const cleanDate = dateStr.replace(/[^0-9]/g, '');
    const cleanTime = timeStr.replace(/[^0-9]/g, '').padEnd(4, '0') + '00';
    return `${cleanDate}T${cleanTime}`;
  }

  private calculateNextCalendarDay(isoDateStr: string): string {
    const clean = isoDateStr.replace(/[^0-9]/g, '');
    if (clean.length === 8) {
      const y = parseInt(clean.substring(0, 4), 10);
      const m = parseInt(clean.substring(4, 6), 10) - 1;
      const d = parseInt(clean.substring(6, 8), 10);
      const dt = new Date(Date.UTC(y, m, d + 1));
      return dt.toISOString().split('T')[0].replace(/[^0-9]/g, '');
    }
    return clean;
  }

  private escapeVCard(str?: string): string {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  private unescapeVCard(str?: string): string {
    if (!str) return '';
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  private escapeICal(str?: string): string {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  private unescapeICal(str?: string): string {
    if (!str) return '';
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  private escapeMultiline(str?: string): string {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
}
