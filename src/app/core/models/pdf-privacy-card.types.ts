export type PrivacyGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface PrivacyDeduction {
  reason: string;
  points: number;
  category: 'name' | 'software' | 'device' | 'gps' | 'hidden' | 'attachments';
}

export interface LaymanDisclosureCard {
  id: 'creator' | 'device' | 'time_location' | 'concealed';
  titleKey: string;
  icon: string;
  hasExposure: boolean;
  headline: string;
  bulletPoints: string[];
  severity: 'clean' | 'warning' | 'danger';
}

export interface PrivacyReportCard {
  fileName: string;
  fileSizeBytes: number;
  evaluatedAt: Date;
  score: number; // 0-100
  grade: PrivacyGrade;
  headlineSummary: string; // "Good Privacy" | "High Exposure Risk"
  plainLanguageSummary: string; // "This document tells anyone who receives it that..."
  deductions: PrivacyDeduction[];
  cards: {
    creator: LaymanDisclosureCard;
    device: LaymanDisclosureCard;
    timeLocation: LaymanDisclosureCard;
    concealed: LaymanDisclosureCard;
  };
  rawDetails: {
    author?: string;
    title?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    gpsCount: number;
    gpsCoordinates?: { lat: number; lon: number }[];
    cameraModels: string[];
    personalNames?: string[];
    hiddenElementsCount: number;
    attachmentsCount: number;
  };
}
