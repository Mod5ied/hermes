// src/services/communication-service.ts
import { v7 as uuidv7 } from 'uuid';
import { config } from '../config/environment';
import { IMessage, IRoom } from '../models/message';
import { DatabaseService } from './database-service';
import { validateServiceViaGateway, validateUserIdentity } from './validation-service';
import { publishToRoom, addUserToRoom, removeUserFromRoom, getUsersInRoom } from './redis-service';

export interface CommunicationPermissions {
  canMessage: boolean;
  allowedRecipients: string[];
  errorMessage?: string;
}

export class CommunicationService {
  /**
   * Check if a communication relationship is allowed based on the architecture
   * Allowed: Director ↔ Staff, Director ↔ Guardian, Staff ↔ Guardian, Staff ↔ Student
   * Not allowed: Director ↔ Student
   */
  static checkCommunicationPermissions(
    senderId: string,
    senderType: 'staff' | 'director' | 'guardian' | 'student',
    recipientId: string,
    recipientType: 'staff' | 'director' | 'guardian' | 'student'
  ): CommunicationPermissions {
    // Director ↔ Student is not allowed
    if ((senderType === 'director' && recipientType === 'student') || 
        (senderType === 'student' && recipientType === 'director')) {
      return {
        canMessage: false,
        allowedRecipients: [],
        errorMessage: 'Communication between Director and Student is not allowed'
      };
    }

    // All other combinations are allowed
    return {
      canMessage: true,
      allowedRecipients: [recipientId]
    };
  }

  /**
   * Send a direct message between users
   */
  static async sendDirectMessage(
    senderId: string,
    senderType: 'staff' | 'director' | 'guardian' | 'student',
    recipientId: string,
    recipientType: 'staff' | 'director' | 'guardian' | 'student',
    tenantId: string,
    subject: string,
    content: string,
    mediaUrls?: string[]
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Check if communication is allowed
    const permissions = this.checkCommunicationPermissions(senderId, senderType, recipientId, recipientType);
    if (!permissions.canMessage) {
      return { success: false, error: permissions.errorMessage };
    }

    const message: IMessage = {
      id: `msg_${uuidv7()}`,
      senderId,
      senderType,
      recipientIds: [recipientId],
      tenantId,
      messageType: mediaUrls && mediaUrls.length > 0 ? 'media' : 'direct',
      subject,
      content,
      mediaUrls,
      status: 'sent',
      sentAt: new Date(),
    };

    try {
      // Save the message to database
      const messageId = await DatabaseService.saveMessage(message);

      // Publish to recipient via Redis Pub/Sub for real-time delivery
      const room = `user:${recipientId}`;
      await publishToRoom(room, JSON.stringify(message));

      return { success: true, messageId };
    } catch (error) {
      console.error('Error sending direct message:', error);
      return { success: false, error: 'Failed to send message' };
    }
  }

  /**
   * Send an announcement to multiple recipients
   */
  static async sendAnnouncement(
    senderId: string,
    senderType: 'staff' | 'director' | 'guardian' | 'student',
    tenantId: string,
    recipientIds: string[], // Array of recipient IDs
    subject: string,
    content: string,
    mediaUrls?: string[]
  ): Promise<{ success: boolean; messageIds?: string[]; error?: string }> {
    const messageIds: string[] = [];

    for (const recipientId of recipientIds) {
      // Check if communication is allowed for each recipient
      const permissions = this.checkCommunicationPermissions(senderId, senderType, recipientId, 'guardian'); // assuming guardian type for announcements
      if (!permissions.canMessage) {
        console.warn(`Skipping recipient ${recipientId}: ${permissions.errorMessage}`);
        continue;
      }

      const message: IMessage = {
        id: `msg_${uuidv7()}`,
        senderId,
        senderType,
        recipientIds: [recipientId],
        tenantId,
        messageType: mediaUrls && mediaUrls.length > 0 ? 'media' : 'announcement',
        subject,
        content,
        mediaUrls,
        status: 'sent',
        sentAt: new Date(),
      };

      try {
        const messageId = await DatabaseService.saveMessage(message);
        messageIds.push(messageId);

        // Publish to recipient via Redis Pub/Sub for real-time delivery
        const room = `user:${recipientId}`;
        await publishToRoom(room, JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending announcement to ${recipientId}:`, error);
      }
    }

    return { success: true, messageIds };
  }

  /**
   * Send a daily note/update to guardians
   */
  static async sendDailyNote(
    senderId: string,
    senderType: 'staff' | 'director' | 'guardian' | 'student',
    guardianId: string,
    studentId: string,
    tenantId: string,
    subject: string,
    content: string,
    mediaUrls?: string[]
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Only staffs and directors should be sending daily notes about students to guardians
    if (senderType !== 'staff' && senderType !== 'director') {
      return { 
        success: false, 
        error: 'Only staffs and directors can send daily notes to guardians' 
      };
    }

    const message: IMessage = {
      id: `msg_${uuidv7()}`,
      senderId,
      senderType,
      recipientIds: [guardianId],
      tenantId,
      messageType: mediaUrls && mediaUrls.length > 0 ? 'media' : 'daily-note',
      subject,
      content,
      mediaUrls,
      status: 'sent',
      sentAt: new Date(),
    };

    try {
      // Save the message to database
      const messageId = await DatabaseService.saveMessage(message);

      // Publish to guardian via Redis Pub/Sub for real-time delivery
      const room = `user:${guardianId}`;
      await publishToRoom(room, JSON.stringify(message));

      return { success: true, messageId };
    } catch (error) {
      console.error('Error sending daily note:', error);
      return { success: false, error: 'Failed to send daily note' };
    }
  }

  /**
   * Create a group chat room
   */
  static async createGroupRoom(
    creatorId: string,
    creatorType: 'staff' | 'director' | 'guardian' | 'student',
    tenantId: string,
    name: string,
    participantIds: Array<{id: string, type: 'staff' | 'director' | 'guardian' | 'student'}>
  ): Promise<{ success: boolean; roomId?: string; error?: string }> {
    // Check if all participants can communicate with each other
    for (const participant of participantIds) {
      // Check if creator can message this participant
      const permissions = this.checkCommunicationPermissions(creatorId, creatorType, participant.id, participant.type);
      if (!permissions.canMessage) {
        return { 
          success: false, 
          error: `Creator cannot message participant ${participant.id}: ${permissions.errorMessage}` 
        };
      }
    }

    // Create the room object
    const room: IRoom = {
      id: `room_${uuidv7()}`,
      name,
      tenantId,
      participants: participantIds.map(p => ({
        userId: p.id,
        userType: p.type,
        joinedAt: new Date()
      })),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      isGroup: true,
      allowedEntityRelationships: participantIds.map(p => `${creatorType}-${p.type}`).join(',')
    };

    try {
      // Add all participants to the room in Redis
      for (const participant of participantIds) {
        await addUserToRoom(participant.id, room.id);
      }

      // In a full implementation, we'd store the room in the database
      // For now, we're just using Redis for room management

      return { success: true, roomId: room.id };
    } catch (error) {
      console.error('Error creating group room:', error);
      return { success: false, error: 'Failed to create group room' };
    }
  }

  /**
   * Get messages for a specific user
   */
  static async getUserMessages(
    userId: string,
    userType: 'staff' | 'director' | 'guardian' | 'student',
    tenantId: string,
    messageType?: string,
    limit: number = 50
  ): Promise<IMessage[]> {
    const query = {
      recipientId: userId,
      tenantId,
      messageType,
      limit,
    };

    return await DatabaseService.getMessagesByQuery(query);
  }
}