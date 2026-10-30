import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../../test-setup';
import { ContactCalendarPage } from './contact-calendar.page';
import { ContactCalendarExtractorService } from '../../core/services/contact-calendar-extractor.service';
import { TranslationService } from '../../core/services/translation.service';
import { AmbiguousDateInfo, ExtractedCalendarEvent, ExtractedContact } from '../../core/models/contact-calendar.types';

describe('ContactCalendarPage — Mobile Play Store UI / UX', () => {
  let component: ContactCalendarPage;
  let fixture: ComponentFixture<ContactCalendarPage>;
  let mockExtractorService: {
    extract: any;
    extractContact: any;
    extractCalendarEvent: any;
    saveVCard: any;
    saveICal: any;
    shareContact: any;
    shareCalendarEvent: any;
  };

  const sampleContact: ExtractedContact = {
    fullName: 'Aditi Rao',
    jobTitle: 'Design Lead',
    organization: 'Studio Pixel',
    mobilePhone: '+91 98765 12345',
    email: 'aditi@pixel.example.com',
    confidence: 95
  };

  const sampleEvent: ExtractedCalendarEvent = {
    title: 'Mobile Architecture Sync',
    startDate: '2026-11-05',
    startTime: '11:00',
    endDate: '2026-11-05',
    endTime: '12:00',
    isAllDay: false,
    location: 'Meeting Room 2',
    meetingLink: 'https://meet.google.com/xyz',
    confidence: 90
  };

  const sampleAmbiguous: AmbiguousDateInfo = {
    rawString: '05/06/2026',
    optionA: {
      isoDate: '2026-05-06',
      displayDate: 'May 6, 2026',
      formatName: 'MM/DD/YYYY'
    },
    optionB: {
      isoDate: '2026-06-05',
      displayDate: 'June 5, 2026',
      formatName: 'DD/MM/YYYY'
    },
    questionPrompt: 'Is this May 6 or June 5?'
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await resolveAngularResources();

    mockExtractorService = {
      extract: vi.fn().mockReturnValue({
        mode: 'contact',
        contact: sampleContact,
        calendarEvent: sampleEvent,
        ambiguousDates: [sampleAmbiguous]
      }),
      extractContact: vi.fn().mockReturnValue(sampleContact),
      extractCalendarEvent: vi.fn().mockReturnValue(sampleEvent),
      saveVCard: vi.fn().mockResolvedValue({
        file: new File(['vcard'], 'contact.vcf', { type: 'text/vcard' }),
        savedUri: 'file:///saved/contact.vcf'
      }),
      saveICal: vi.fn().mockResolvedValue({
        file: new File(['ical'], 'event.ics', { type: 'text/calendar' }),
        savedUri: 'file:///saved/event.ics'
      }),
      shareContact: vi.fn().mockResolvedValue(true),
      shareCalendarEvent: vi.fn().mockResolvedValue(true)
    };

    await TestBed.configureTestingModule({
      imports: [ContactCalendarPage],
      providers: [
        { provide: ContactCalendarExtractorService, useValue: mockExtractorService },
        {
          provide: TranslationService,
          useValue: {
            currentLang: 'en',
            translate: (key: string) => key
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ContactCalendarPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
    expect(component.activeMode).toBe('contact');
  });

  it('should toggle between contact and calendar modes', () => {
    component.setMode('calendar');
    expect(component.activeMode).toBe('calendar');

    component.setMode('contact');
    expect(component.activeMode).toBe('contact');
  });

  it('should resolve ambiguous date with 1-tap chip', () => {
    component.extractedEvent = { ...sampleEvent };
    component.ambiguousDates = [{ ...sampleAmbiguous }];

    component.resolveAmbiguousDate(component.ambiguousDates[0], '2026-06-05');
    expect(component.ambiguousDates[0].resolvedDate).toBe('2026-06-05');
    expect(component.extractedEvent.startDate).toBe('2026-06-05');
  });

  it('should save and share contact in contact mode', async () => {
    component.extractedContact = { ...sampleContact };

    await component.saveContact();
    expect(mockExtractorService.saveVCard).toHaveBeenCalled();

    await component.openInContacts();
    expect(mockExtractorService.shareContact).toHaveBeenCalled();
  });

  it('should save and share calendar event in calendar mode', async () => {
    component.activeMode = 'calendar';
    component.extractedEvent = { ...sampleEvent };

    await component.saveEvent();
    expect(mockExtractorService.saveICal).toHaveBeenCalled();

    await component.addToCalendar();
    expect(mockExtractorService.shareCalendarEvent).toHaveBeenCalled();
  });
});
