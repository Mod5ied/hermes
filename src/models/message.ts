// src/models/message.ts
export interface IMessage {
  id: string;
  senderId: string;
  senderType: 'staff' | 'director' | 'guardian' | 'student' | 'system';
  recipientIds: string[];  // Can be multiple recipients for group messages
  tenantId: string;
  messageType: 'direct' | 'group' | 'announcement' | 'daily-note' | 'media';
  content: string;
  subject?: string;
  mediaUrls?: string[];    // URLs to photos/videos shared
  status: 'sent' | 'delivered' | 'read';
  readBy?: Array<{userId: string, readAt: Date}>;
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  expiresAt?: Date;
}

export interface IWebSocketSession {
  id: string;
  userId: string;
  userType: 'staff' | 'director' | 'guardian' | 'student';
  tenantId: string;
  connectedAt: Date;
  expiresAt: Date;  // 1-hour session as specified
  isActive: boolean;
  connectionId: string;
}

export interface IRoom {
  id: string;
  name: string;
  tenantId: string;
  participants: Array<{
    userId: string;
    userType: 'staff' | 'director' | 'guardian' | 'student';
    joinedAt: Date;
  }>;
  createdAt: Date;
  expiresAt: Date;  // 1-hour room as specified
  isGroup: boolean;
  allowedEntityRelationships: string; // e.g., "director-teacher", "staff-guardian", etc.
}