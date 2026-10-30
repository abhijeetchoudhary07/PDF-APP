import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ContactCalendarExtractorService } from './contact-calendar-extractor.service';
import { StorageService } from './storage.service';
import { ShareService } from './share.service';
import { ExtractedCalendarEvent, ExtractedContact } from '../models/contact-calendar.types';

describe('ContactCalendarExtractorService — P2 Contact & Calendar Extraction', () => {
  let service: ContactCalendarExtractorService;
  let mockStorageService: { saveFile: any };
  let mockShareService: { share: any };

  beforeEach(() => {
    mockStorageService = {
      saveFile: vi.fn().mockImplementation(async (file: File) => `file:///mock/${file.name}`)
    };

    mockShareService = {
      share: vi.fn().mockResolvedValue(true)
    };

    TestBed.configureTestingModule({
      providers: [
        ContactCalendarExtractorService,
        { provide: StorageService, useValue: mockStorageService },
        { provide: ShareService, useValue: mockShareService }
      ]
    });

    service = TestBed.inject(ContactCalendarExtractorService);
  });

  describe('1. Business Card Extraction & Formatting', () => {
    it('extracts contact details from business card text fixture', () => {
      const cardText = `
        Dr. Ananya Roy, Ph.D.
        Chief Technology Officer
        Apex AI Technologies Pvt Ltd
        Cell: 9876543210
        Office: +91 11 2345 6789
        Email: ananya.roy@apexai.example.com
        Web: https://www.apexai.example.com
        Address: 42 Silicon Corridor, Outer Ring Road, Bengaluru, Karnataka 560103
      `;

      const contact = service.extractContact(cardText);
      expect(contact.fullName).toContain('Dr. Ananya Roy');
      expect(contact.jobTitle).toContain('Chief Technology Officer');
      expect(contact.organization).toContain('Apex AI Technologies');
      expect(contact.email).toBe('ananya.roy@apexai.example.com');
      expect(contact.websiteUrl).toContain('apexai.example.com');
      expect(contact.mobilePhone).toContain('+91 98765 43210');
      expect(contact.address?.fullAddress).toContain('560103');
    });

    it('formats phone numbers cleanly with +91 and international support', () => {
      const text1 = 'Name: Rajesh Kumar\nMob: 9845012345';
      const c1 = service.extractContact(text1);
      expect(c1.mobilePhone).toBe('+91 98450 12345');

      const text2 = 'Name: John Smith\nMob: +1-555-234-5678';
      const c2 = service.extractContact(text2);
      expect(c2.mobilePhone).toBe('+15552345678');

      const text3 = 'Name: Oliver Brown\nMob: +44 20 7946 0991\nWork: +44 161 496 0123';
      const c3 = service.extractContact(text3);
      expect(c3.mobilePhone).toContain('+44');
      expect(c3.address?.country).toBe('United Kingdom');

      const text4 = 'Name: Liam Wilson\nMob: +61 2 9876 5432';
      const c4 = service.extractContact(text4);
      expect(c4.mobilePhone).toContain('+61');
    });

    it('extracts contact details from vertical card layout fixture', () => {
      const verticalCardText = `
        Elena Rostova
        Lead Product Designer
        Creative Studio Labs
        +1 (415) 555-0199
        +1 (415) 555-0100
        elena@creativestudio.example.com
        https://creativestudio.example.com
        742 Evergreen Terrace
        Springfield, OR 97477
      `;

      const contact = service.extractContact(verticalCardText);
      expect(contact.fullName).toBe('Elena Rostova');
      expect(contact.jobTitle).toBe('Lead Product Designer');
      expect(contact.organization).toBe('Creative Studio Labs');
      expect(contact.email).toBe('elena@creativestudio.example.com');
      expect(contact.websiteUrl).toBe('https://creativestudio.example.com');
      expect(contact.mobilePhone).toContain('415');
      expect(contact.address?.fullAddress).toContain('97477');
    });
  });

  describe('2. vCard Output Roundtrip Parsing & Special Character Escaping', () => {
    it('escapes special characters (commas, semicolons, backslashes, newlines) properly in vCard', () => {
      const inputContact: ExtractedContact = {
        fullName: 'Smith, Jr.; John',
        jobTitle: 'VP, Engineering & R\\D',
        organization: 'Acme; Inc, Global',
        mobilePhone: '+91 98765 43210',
        email: 'john.smith@example.com',
        websiteUrl: 'https://example.com',
        notes: 'Line 1\nLine 2',
        confidence: 95
      };

      const vcard = service.buildVCard(inputContact);
      expect(vcard).toContain('BEGIN:VCARD');
      expect(vcard).toContain('VERSION:3.0');
      // Commas and semicolons escaped in text properties
      expect(vcard).toContain('FN:Smith\\, Jr.\\; John');
      expect(vcard).toContain('TITLE:VP\\, Engineering & R\\\\D');
      expect(vcard).toContain('ORG:Acme\\; Inc\\, Global');
      expect(vcard).toContain('NOTE:Line 1\\nLine 2');
      expect(vcard).toContain('END:VCARD');
    });

    it('vCard outputs parse back to exact input values', () => {
      const original: ExtractedContact = {
        fullName: 'Aarav Sharma',
        firstName: 'Aarav',
        lastName: 'Sharma',
        jobTitle: 'Principal Architect',
        organization: 'CloudWave Systems',
        mobilePhone: '+91 91234 56789',
        workPhone: '+91 80 4000 1234',
        email: 'aarav@cloudwave.com',
        websiteUrl: 'https://cloudwave.com',
        confidence: 100
      };

      const vcard = service.buildVCard(original);
      const parsed = service.parseVCard(vcard);

      expect(parsed.fullName).toBe(original.fullName);
      expect(parsed.jobTitle).toBe(original.jobTitle);
      expect(parsed.organization).toBe(original.organization);
      expect(parsed.mobilePhone).toBe(original.mobilePhone);
      expect(parsed.workPhone).toBe(original.workPhone);
      expect(parsed.email).toBe(original.email);
      expect(parsed.websiteUrl).toBe(original.websiteUrl);
    });
  });

  describe('3. Document to .ics Calendar Event & Roundtrip', () => {
    it('extracts event details and meeting links from document text', () => {
      const scheduleText = `
        Product Architecture Review 2026
        Date: 2026-11-15
        Time: 14:00 - 15:30
        Location: Conference Room Alpha
        Join Zoom Meeting: https://zoom.us/j/9876543210?pwd=abc
        Discussion on upcoming microservices migration.
      `;

      const event = service.extractCalendarEvent(scheduleText);
      expect(event.title).toContain('Product Architecture Review');
      expect(event.startDate).toBe('2026-11-15');
      expect(event.startTime).toBe('14:00');
      expect(event.endTime).toBe('15:30');
      expect(event.isAllDay).toBe(false);
      expect(event.location).toContain('Conference Room Alpha');
      expect(event.meetingLink).toContain('zoom.us/j/9876543210');
    });

    it('.ics outputs parse back to exact input values', () => {
      const original: ExtractedCalendarEvent = {
        title: 'Board of Directors Quarterly Sync',
        startDate: '2026-11-20',
        startTime: '10:00',
        endDate: '2026-11-20',
        endTime: '11:30',
        isAllDay: false,
        location: 'Virtual',
        meetingLink: 'https://meet.google.com/abc-defg-hij',
        description: 'Review Q3 progress and approvals',
        confidence: 90
      };

      const ical = service.buildICal(original);
      expect(ical).toContain('BEGIN:VCALENDAR');
      expect(ical).toContain('VERSION:2.0');
      expect(ical).toContain('BEGIN:VEVENT');
      expect(ical).toContain('SUMMARY:Board of Directors Quarterly Sync');
      expect(ical).toContain('URL:https://meet.google.com/abc-defg-hij');

      const parsed = service.parseICal(ical);
      expect(parsed.title).toBe(original.title);
      expect(parsed.startDate).toBe(original.startDate);
      expect(parsed.startTime).toBe(original.startTime);
      expect(parsed.endDate).toBe(original.endDate);
      expect(parsed.endTime).toBe(original.endTime);
      expect(parsed.meetingLink).toBe(original.meetingLink);
    });

    it('extracts multi-session conference schedule and handles formatted time slots', () => {
      const confText = `
        Annual Tech Conclave 2026
        Keynote Address & AI Track
        Venue: Grand Ballroom, Convention Center
        Date: 25-11-2026
        Time: 09:30 AM to 11:00 AM
        https://meet.google.com/tech-conclave-2026
        Opening keynote followed by technical paper presentations.
      `;

      const event = service.extractCalendarEvent(confText);
      expect(event.title).toContain('Annual Tech Conclave');
      expect(event.startDate).toBe('2026-11-25');
      expect(event.startTime).toBe('09:30');
      expect(event.endTime).toBe('11:00');
      expect(event.isAllDay).toBe(false);
      expect(event.location).toContain('Grand Ballroom');
      expect(event.meetingLink).toBe('https://meet.google.com/tech-conclave-2026');
    });

    it('implements RFC 5545 section 3.8.2.2 non-inclusive DTEND for all-day events', () => {
      const allDayEvent: ExtractedCalendarEvent = {
        title: 'National Holiday / Office Closed',
        startDate: '2026-10-31',
        endDate: '2026-10-31',
        isAllDay: true,
        confidence: 90
      };

      const ical = service.buildICal(allDayEvent);
      expect(ical).toContain('DTSTART;VALUE=DATE:20261031');
      // Must be the day after for RFC 5545 compliance (2026-11-01)
      expect(ical).toContain('DTEND;VALUE=DATE:20261101');
    });
  });

  describe('4. Ambiguous Date Disambiguation', () => {
    it('detects ambiguous date (e.g. 05/06/2026) and generates confirmation prompt', () => {
      const text = 'Meeting is scheduled on 05/06/2026 at 10 AM';
      const ambiguous = service.detectAmbiguousDates(text);

      expect(ambiguous.length).toBe(1);
      const info = ambiguous[0];
      expect(info.rawString).toBe('05/06/2026');
      expect(info.questionPrompt).toBe('Is this May 6 or June 5?');
      expect(info.optionA.isoDate).toBe('2026-05-06');
      expect(info.optionA.displayDate).toBe('May 6, 2026');
      expect(info.optionB.isoDate).toBe('2026-06-05');
      expect(info.optionB.displayDate).toBe('June 5, 2026');
    });

    it('does not flag unambiguous dates (e.g. 25/10/2026 or 10/10/2026)', () => {
      const text1 = 'Event on 25/10/2026';
      expect(service.detectAmbiguousDates(text1).length).toBe(0);

      const text2 = 'Event on 10/10/2026';
      expect(service.detectAmbiguousDates(text2).length).toBe(0);
    });
  });

  describe('5. Native Mobile Integration (Save & Share)', () => {
    it('saves vCard file via StorageService.saveFile', async () => {
      const contact: ExtractedContact = {
        fullName: 'Vikram Seth',
        mobilePhone: '+91 98765 00000',
        confidence: 90
      };

      const res = await service.saveVCard(contact, 'vikram.vcf');
      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(res.file.name).toBe('vikram.vcf');
      expect(res.file.type).toBe('text/vcard');
    });

    it('saves iCal file via StorageService.saveFile', async () => {
      const event: ExtractedCalendarEvent = {
        title: 'Team Standup',
        startDate: '2026-10-30',
        isAllDay: true,
        confidence: 90
      };

      const res = await service.saveICal(event, 'standup.ics');
      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(res.file.name).toBe('standup.ics');
      expect(res.file.type).toBe('text/calendar');
    });

    it('shares contact and event using ShareService', async () => {
      const contact: ExtractedContact = { fullName: 'Sunita Sen', confidence: 90 };
      const sharedContact = await service.shareContact(contact);
      expect(sharedContact).toBe(true);
      expect(mockShareService.share).toHaveBeenCalled();

      const event: ExtractedCalendarEvent = { title: 'Demo Day', startDate: '2026-11-01', isAllDay: true, confidence: 90 };
      const sharedEvent = await service.shareCalendarEvent(event);
      expect(sharedEvent).toBe(true);
    });

    it('gracefully handles share sheet dismissal (AbortError / Share canceled) without throwing', async () => {
      mockShareService.share.mockRejectedValueOnce({ name: 'AbortError', message: 'Share canceled' });
      const contact: ExtractedContact = { fullName: 'Cancelled Contact', confidence: 90 };
      const result = await service.shareContact(contact);
      expect(result).toBe(false);

      mockShareService.share.mockRejectedValueOnce(new Error('Share canceled'));
      const event: ExtractedCalendarEvent = { title: 'Cancelled Event', startDate: '2026-11-01', isAllDay: true, confidence: 90 };
      const eventResult = await service.shareCalendarEvent(event);
      expect(eventResult).toBe(false);
    });
  });

  describe('6. Cybersecurity Stress-Testing & Robustness', () => {
    it('prevents CRLF injection in vCard single-line fields', () => {
      const maliciousContact: ExtractedContact = {
        fullName: 'Hacker\r\nNOTE:Injected Note\r\nEMAIL:hacker@evil.com',
        jobTitle: 'Admin\r\nROLE:Superuser',
        organization: 'EvilCorp\r\nREV:2026-01-01',
        mobilePhone: '+91 9999999999\r\nTEL;TYPE=EVIL:1111',
        email: 'victim@example.com\r\nBCC:spy@evil.com',
        websiteUrl: 'https://evil.example.com\r\nX-ATTACK:true',
        confidence: 90
      };

      const vcard = service.buildVCard(maliciousContact);

      // Verify no injected raw CRLF line breaks exist within single properties
      expect(vcard).not.toContain('\r\nNOTE:Injected Note');
      expect(vcard).not.toContain('\r\nEMAIL:hacker@evil.com');
      expect(vcard).not.toContain('\r\nROLE:Superuser');
      expect(vcard).not.toContain('\r\nREV:2026-01-01');
      expect(vcard).not.toContain('\r\nTEL;TYPE=EVIL');
      expect(vcard).not.toContain('\r\nBCC:spy@evil.com');
      expect(vcard).not.toContain('\r\nX-ATTACK');

      // Full name newline characters must be flattened to space
      expect(vcard).toContain('FN:Hacker NOTE:Injected Note EMAIL:hacker@evil.com');
    });

    it('prevents CRLF injection in iCalendar fields from injecting rogue components/alarms', () => {
      const maliciousEvent: ExtractedCalendarEvent = {
        title: 'Harmless Meeting\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nACTION:DISPLAY\r\nDESCRIPTION:Pwned\r\nEND:VALARM',
        startDate: '2026-11-10',
        isAllDay: true,
        location: 'Room 101\r\nATTENDEE;CN=Attacker:mailto:attacker@evil.com',
        meetingLink: 'https://zoom.us/j/123456\r\nATTACH:http://malware.exe',
        confidence: 90
      };

      const ical = service.buildICal(maliciousEvent);

      // Verify no injected VALARM component
      expect(ical).not.toContain('\r\nBEGIN:VALARM');
      expect(ical).not.toContain('\r\nTRIGGER:-PT15M');
      expect(ical).not.toContain('\r\nACTION:DISPLAY');
      expect(ical).not.toContain('\r\nEND:VALARM');

      // Verify no injected ATTENDEE or ATTACH properties
      expect(ical).not.toContain('\r\nATTENDEE;CN=Attacker');
      expect(ical).not.toContain('\r\nATTACH:http://malware.exe');

      // Confirm title was safely stripped to a single line
      expect(ical).toContain('SUMMARY:Harmless Meeting BEGIN:VALARM TRIGGER:-PT15M ACTION:DISPLAY DESCRIPTION:Pwned END:VALARM');
    });

    it('blocks malicious URL schemes (javascript:, data:text/html, vbscript:) in meeting links & website URLs', () => {
      expect(service.sanitizeUrl('javascript:alert(document.cookie)')).toBe('');
      expect(service.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
      expect(service.sanitizeUrl('vbscript:msgbox(1)')).toBe('');
      expect(service.sanitizeUrl('   jav\tascript:alert(1)   ')).toBe('');

      // Valid schemes should pass
      expect(service.sanitizeUrl('https://meet.google.com/xyz-abcd-efg')).toBe('https://meet.google.com/xyz-abcd-efg');
      expect(service.sanitizeUrl('http://insecure.example.com')).toBe('http://insecure.example.com');
      expect(service.sanitizeUrl('zoom.us/j/1234567890')).toBe('https://zoom.us/j/1234567890');
    });

    it('sanitizes XSS tags and malicious payloads in raw input strings', () => {
      const maliciousInput = '<script>alert("XSS")</script>Dr. Rajesh Sharma<img src=x onerror=alert(1)>';
      const clean = service.sanitizeInputText(maliciousInput);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('</script>');
      expect(clean).not.toContain('onerror');
      expect(clean).toContain('Dr. Rajesh Sharma');
    });
  });
});
