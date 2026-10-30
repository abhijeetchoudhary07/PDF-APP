export type ContactCalendarMode = 'contact' | 'calendar';

export interface ExtractedContact {
  fullName: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  organization?: string;
  mobilePhone?: string;
  workPhone?: string;
  email?: string;
  websiteUrl?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    fullAddress?: string;
  };
  notes?: string;
  confidence: number; // 0 - 100
}

export interface ExtractedCalendarEvent {
  title: string;
  startDate: string; // ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  startTime?: string; // HH:mm
  endDate?: string;   // ISO format
  endTime?: string;   // HH:mm
  isAllDay: boolean;
  location?: string;
  meetingLink?: string; // Zoom, Google Meet, Teams, etc.
  description?: string;
  confidence: number; // 0 - 100
}

export interface AmbiguousDateInfo {
  rawString: string;
  optionA: {
    isoDate: string; // e.g. 2026-05-06
    displayDate: string; // e.g. May 6, 2026
    formatName: string; // 'MM/DD/YYYY (US Format)'
  };
  optionB: {
    isoDate: string; // e.g. 2026-06-05
    displayDate: string; // e.g. June 5, 2026
    formatName: string; // 'DD/MM/YYYY (Indian / International Format)'
  };
  questionPrompt: string; // e.g. "Is this May 6 or June 5?"
  resolvedDate?: string;
}

export interface ContactCalendarExtractionResult {
  mode: ContactCalendarMode;
  contact?: ExtractedContact;
  calendarEvent?: ExtractedCalendarEvent;
  ambiguousDates: AmbiguousDateInfo[];
  rawText?: string;
  vCardString?: string;
  iCalString?: string;
}
