// src/services/database-service.ts
import admin from 'firebase-admin';
import { config } from '../config/environment';
import { IMessage, IWebSocketSession } from '../models/message';

// Initialize Firebase globally at the module level if not already initialized
if (!admin.apps.length) {
  if (!config.firebaseProjectId || !config.firebasePrivateKey || !config.firebaseClientEmail) {
    console.error('Missing required Firebase environment variables');
    process.exit(1);
  }

  const privateKeyFormatted = config.firebasePrivateKey.replace(/\\n/g, '\n');

  const serviceAccount = {
    projectId: config.firebaseProjectId,
    privateKey: privateKeyFormatted,
    clientEmail: config.firebaseClientEmail,
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

export interface MessageQuery {
  senderId?: string;
  recipientId?: string;
  tenantId: string;
  messageType?: string;
  limit?: number;
  lastMessageId?: string;
  startDate?: Date;
  endDate?: Date;
}

export class DatabaseService {
  static async saveMessage(message: IMessage): Promise<string> {
    const docRef = await db.collection('messages').add({
      ...message,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      expiresAt: message.expiresAt,
    });
    return docRef.id;
  }

  static async getMessageById(id: string): Promise<IMessage | null> {
    try {
      const doc = await db.collection('messages').doc(id).get();
      if (doc.exists) {
        const data = doc.data()!;
        return { 
          id: doc.id, 
          ...data,
          sentAt: data.sentAt instanceof Date ? data.sentAt : new Date(data.sentAt),
          deliveredAt: data.deliveredAt instanceof Date ? data.deliveredAt : 
                      (data.deliveredAt ? new Date(data.deliveredAt) : undefined),
          readAt: data.readAt instanceof Date ? data.readAt : 
                  (data.readAt ? new Date(data.readAt) : undefined),
          expiresAt: data.expiresAt instanceof Date ? data.expiresAt : 
                     (data.expiresAt ? new Date(data.expiresAt) : undefined),
        } as IMessage;
      }
      return null;
    } catch (error) {
      console.error('Error getting message by ID:', error);
      return null;
    }
  }

  static async getMessagesByQuery(query: MessageQuery): Promise<IMessage[]> {
    try {
      let collectionRef = db.collection('messages')
        .where('tenantId', '==', query.tenantId);

      if (query.senderId) {
        collectionRef = collectionRef.where('senderId', '==', query.senderId);
      }

      // For recipient filtering, we need to check if the userId is in the recipientIds array
      if (query.recipientId) {
        collectionRef = collectionRef.where('recipientIds', 'array-contains', query.recipientId);
      }

      if (query.messageType) {
        collectionRef = collectionRef.where('messageType', '==', query.messageType);
      }

      if (query.startDate) {
        collectionRef = collectionRef.where('sentAt', '>=', query.startDate);
      }

      if (query.endDate) {
        collectionRef = collectionRef.where('sentAt', '<=', query.endDate);
      }

      if (query.lastMessageId) {
        const startAfterDoc = await db.collection('messages').doc(query.lastMessageId).get();
        collectionRef = collectionRef.startAfter(startAfterDoc);
      }

      if (query.limit) {
        collectionRef = collectionRef.limit(query.limit);
      }

      const snapshot = await collectionRef.orderBy('sentAt', 'desc').get();
      
      const messages: IMessage[] = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          ...data,
          sentAt: data.sentAt instanceof Date ? data.sentAt : new Date(data.sentAt),
          deliveredAt: data.deliveredAt instanceof Date ? data.deliveredAt : 
                      (data.deliveredAt ? new Date(data.deliveredAt) : undefined),
          readAt: data.readAt instanceof Date ? data.readAt : 
                  (data.readAt ? new Date(data.readAt) : undefined),
          expiresAt: data.expiresAt instanceof Date ? data.expiresAt : 
                     (data.expiresAt ? new Date(data.expiresAt) : undefined),
        } as IMessage);
      });
      
      return messages;
    } catch (error) {
      console.error('Error getting messages by query:', error);
      return [];
    }
  }

  static async updateMessageStatus(messageId: string, status: 'delivered' | 'read', userId?: string): Promise<void> {
    const updateData: any = { status };
    
    if (status === 'read' && userId) {
      updateData.readAt = new Date();
      // Add to readBy array field
      updateData[`readBy.${userId}`] = new Date();
    } else if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    }

    await db.collection('messages').doc(messageId).update(updateData);
  }

  static async saveWebSocketSession(session: IWebSocketSession): Promise<void> {
    await db.collection('webSocketSessions').doc(session.id).set({
      ...session,
      connectedAt: session.connectedAt,
      expiresAt: session.expiresAt,
    });
  }

  static async getWebSocketSessionById(sessionId: string): Promise<IWebSocketSession | null> {
    try {
      const doc = await db.collection('webSocketSessions').doc(sessionId).get();
      if (doc.exists) {
        const data = doc.data()!;
        return { 
          id: doc.id, 
          ...data,
          connectedAt: data.connectedAt instanceof Date ? data.connectedAt : new Date(data.connectedAt),
          expiresAt: data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt),
        } as IWebSocketSession;
      }
      return null;
    } catch (error) {
      console.error('Error getting WebSocket session by ID:', error);
      return null;
    }
  }

  static async deleteWebSocketSession(sessionId: string): Promise<void> {
    await db.collection('webSocketSessions').doc(sessionId).delete();
  }
}