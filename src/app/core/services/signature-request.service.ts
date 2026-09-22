import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  SignatureRequest,
  SignatureRecipient,
  SignatureRequestField,
  AuditTrailEvent,
  SignatureRequestStatus
} from '../models/signature-request.types';

const SIG_REQUESTS_STORAGE_KEY = 'IFH_SIG_REQUESTS_V1';

const DEFAULT_RECIPIENT_COLORS = [
  '#2563eb', // Blue
  '#059669', // Green
  '#d97706', // Amber
  '#dc2626', // Red
  '#7c3aed', // Purple
  '#db2777'  // Pink
];

@Injectable({
  providedIn: 'root'
})
export class SignatureRequestService {
  constructor() {}

  /**
   * Generates a new Signature Request draft.
   */
  createDraft(
    title: string,
    documentName: string,
    documentSizeBytes: number,
    pageCount: number
  ): SignatureRequest {
    const id = `sigreq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    return {
      id,
      title,
      documentName,
      documentSizeBytes,
      pageCount,
      createdAt: now,
      updatedAt: now,
      status: 'draft',
      recipients: [],
      fields: [],
      auditTrail: [
        {
          id: `audit_${Date.now()}`,
          timestamp: now,
          action: 'DRAFT_CREATED',
          actor: 'Local User',
          details: `Signature request draft created for "${documentName}"`
        }
      ],
      backendConfig: {
        isBackendConnected: false,
        providerName: 'Custom / Self-Hosted REST API'
      }
    };
  }

  /**
   * Adds a recipient to the request.
   */
  addRecipient(
    request: SignatureRequest,
    recipient: Omit<SignatureRecipient, 'id' | 'status' | 'color'>
  ): SignatureRecipient {
    const colorIndex = request.recipients.length % DEFAULT_RECIPIENT_COLORS.length;
    const newRecipient: SignatureRecipient = {
      ...recipient,
      id: `recip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      status: 'waiting',
      color: DEFAULT_RECIPIENT_COLORS[colorIndex]
    };

    request.recipients.push(newRecipient);
    request.updatedAt = Date.now();
    this.addAuditEvent(request, 'RECIPIENT_ADDED', `Added recipient: ${newRecipient.name} (${newRecipient.email})`);

    return newRecipient;
  }

  /**
   * Assigns a field to a recipient on a specific page.
   */
  addField(
    request: SignatureRequest,
    field: Omit<SignatureRequestField, 'id'>
  ): SignatureRequestField {
    const newField: SignatureRequestField = {
      ...field,
      id: `field_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };

    request.fields.push(newField);
    request.updatedAt = Date.now();
    const recipient = request.recipients.find(r => r.id === field.recipientId);
    this.addAuditEvent(
      request,
      'FIELD_PLACED',
      `Placed ${field.type} field on Page ${field.pageNumber} for ${recipient?.name || 'Recipient'}`
    );

    return newField;
  }

  /**
   * Appends an audit event to the request history.
   */
  addAuditEvent(
    request: SignatureRequest,
    action: string,
    details: string,
    actor = 'Local User'
  ): void {
    request.auditTrail.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      action,
      actor,
      details
    });
  }

  /**
   * Saves a signature request draft to local storage.
   */
  async saveDraft(request: SignatureRequest): Promise<void> {
    const requests = await this.getAllRequests();
    const existingIdx = requests.findIndex(r => r.id === request.id);

    request.updatedAt = Date.now();

    if (existingIdx >= 0) {
      requests[existingIdx] = request;
    } else {
      requests.unshift(request);
    }

    await Preferences.set({
      key: SIG_REQUESTS_STORAGE_KEY,
      value: JSON.stringify(requests)
    });
  }

  /**
   * Retrieves all saved signature requests.
   */
  async getAllRequests(): Promise<SignatureRequest[]> {
    const { value } = await Preferences.get({ key: SIG_REQUESTS_STORAGE_KEY });
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Exports a signature request manifest as JSON.
   */
  exportRequestManifest(request: SignatureRequest): { fileName: string; content: string } {
    const manifest = {
      specificationVersion: '1.0',
      exportedAt: new Date().toISOString(),
      architecture: 'OFFLINE_FIRST_SPECIFICATION',
      backendRequirementNotice:
        'Remote execution of this request requires an email dispatch backend or legal e-sign coordination server (e.g. DocuSign, Adobe Sign, or custom webhook).',
      request
    };

    return {
      fileName: `${request.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_request_manifest.json`,
      content: JSON.stringify(manifest, null, 2)
    };
  }
}
