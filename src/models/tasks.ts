// Define task message format

// Email dispatch payload
export interface EmailDispatchPayload {
  recipientEmail: string | string[];
  subject: string;
  body: string;
  attachments?: Array<{
    name: string;
    content: string; // base64 encoded
    type?: string;
  }>;
  emailClient?: 'brevo' | 'zoho';
  priority?: 'low' | 'normal' | 'high';
}

// Media processing payload
export interface MediaProcessingPayload {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'pdf' | 'document';
  processingOptions: {
    resize?: { width: number; height: number };
    format?: string;
    quality?: number;
    thumbnail?: boolean;
  };
  priority?: 'low' | 'normal' | 'high';
}

// Service routing payload
export interface ServiceRoutingPayload {
  targetService: 'athena' | 'apollo' | 'zeus' | 'hestia' | 'janus';
  endpoint: string;
  data: any;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
}

// Notification payload
export interface NotificationPayload {
  recipientId: string;
  recipientType: 'user' | 'teacher' | 'student' | 'guardian' | 'director';
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

// Announcement payload
export interface AnnouncementPayload {
  title: string;
  body: string;
  targetGroup: 'Staff' | 'Guardians';
  emailClient?: 'brevo' | 'zoho';
  priority?: 'low' | 'normal' | 'high';
}

// Bulk update payload
export interface BulkUpdatePayload {
  targetService: 'athena' | 'apollo' | 'zeus' | 'hestia' | 'janus' | 'hera';
  endpoint: string;
  updateData: any;
  filter: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

// Union type for all possible payload types
export type TaskPayload = 
  | EmailDispatchPayload
  | MediaProcessingPayload
  | ServiceRoutingPayload
  | NotificationPayload
  | AnnouncementPayload
  | BulkUpdatePayload;

// Enhanced WorkerTask interface with specific payload types
export interface WorkerTask {
  id: string;
  type: 'email_dispatch' | 'media_processing' | 'service_routing' | 'notification' | 'announcement' | 'bulk_update';
  payload: TaskPayload;
  tenantId: string;
  serviceId: string; // ID of the service that sent this task
  createdAt: Date;
  priority?: 'low' | 'normal' | 'high';
}