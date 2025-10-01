// src/socket/server.ts
import axios from 'axios';
import { Hono } from 'hono';
import uWS from 'uWebSockets.js';
import { cors } from 'hono/cors';
import { v7 as uuidv7 } from 'uuid';
import type { Context } from 'hono';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { config } from '../config/environment';
import validateEnvironment from '../config/validator';
import { DatabaseService } from '../services/database-service';
import { IMessage, IWebSocketSession } from '../models/message';
import { CommunicationService } from '../services/communication-service';
import { initializeRedis, validateSession, storeSession, getUsersInRoom, publishToRoom, getRedisClient } from '../services/redis-service';
import { validateUserIdentity, callJanusApi } from '../services/validation-service';



async function startServer() {
  // Validate environment variables
  validateEnvironment();

  // Initialize Redis connection
  await initializeRedis();

  // Initialize database service
  // Note: For Firebase, we initialize it in the DatabaseService

  console.log('Starting Hermes-Socket server...');

  // Setup Hono for HTTP APIs
  const app = new Hono();

  // Global middleware
  app.use('*', logger());
  app.use('*', cors());

  // Health check endpoint
  app.get('/health', (c: Context) => {
    return c.json({
      status: 'OK',
      service: 'hermes-socket',
      timestamp: new Date().toISOString()
    });
  });

  // HTTP API for session initiation
  app.post('/api/v1/session/initiate', async (c: Context) => {
    try {
      // Extract authentication info from headers
      const userId = c.req.header('x-user-id');
      const userType = c.req.header('x-user-type') as 'staff' | 'director' | 'guardian' | 'student';
      const tenantId = c.req.header('x-tenant-id');
      const token = c.req.header('authorization')?.replace('Bearer ', '');

      if (!userId || !userType || !tenantId || !token) {
        return c.json({
          error: 'Missing required headers'
        }, 400);
      }

      // Validate user identity through Janus for token validation
      try {
        const validation = await validateUserIdentity(userId, token);
        
        if (!validation.isValid) {
          return c.json({ error: validation.error || 'Invalid token' }, 401);
        }

        // Verify that the userId in the request matches the one from the token
        // The validateUserIdentity function already validates the token and user identity
      } catch (validationError) {
        console.error('User identity validation error:', validationError);
        return c.json({ error: 'Token validation failed' }, 401);
      }

      // Create a new session ID
      // Time-ordered UUID with random component
      const sessionId = `session_${uuidv7()}`;

      // Store session in Redis (valid for 1 hour as per requirements)
      await storeSession(sessionId, userId, tenantId, 3600);

      // Create WebSocket session record in database
      const session: IWebSocketSession = {
        id: sessionId,
        userId,
        userType,
        tenantId,
        connectedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        isActive: true,
        connectionId: '' // Will be set when WebSocket connects
      };

      // Save the WebSocket session to the database
      await DatabaseService.saveWebSocketSession(session);

      return c.json({
        success: true,
        sessionId,
        message: 'Session initiated successfully',
        expiresAt: session.expiresAt
      });
    } catch (error) {
      console.error('Error initiating session:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // HTTP API to get message history
  app.get('/api/v1/messages/history', async (c: Context) => {
    try {
      const userId = c.req.header('x-user-id');
      const userType = c.req.header('x-user-type') as 'staff' | 'director' | 'guardian' | 'student';
      const tenantId = c.req.header('x-tenant-id');
      const sessionId = c.req.header('x-session-id');
      const messageType = c.req.query('type');
      const limit = parseInt(c.req.query('limit') || '50');

      if (!userId || !userType || !tenantId || !sessionId) {
        return c.json({
          error: 'Missing required headers'
        }, 400);
      }

      // Validate session
      const isValid = await validateSession(sessionId, userId);
      if (!isValid) {
        return c.json({ 
          error: 'Invalid or expired session',
          needsNewSession: true 
        }, 401);
      }

      // Get messages for the user
      const messages: IMessage[] = await CommunicationService.getUserMessages(
        userId,
        userType,
        tenantId,
        messageType,
        limit
      );

      return c.json({
        success: true,
        messages,
        count: messages.length
      });
    } catch (error) {
      console.error('Error getting message history:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // HTTP API to create group chat
  app.post('/api/v1/group/create', async (c: Context) => {
    try {
      const userId = c.req.header('x-user-id');
      const userType = c.req.header('x-user-type') as 'staff' | 'director' | 'guardian' | 'student';
      const tenantId = c.req.header('x-tenant-id');
      const sessionId = c.req.header('x-session-id');

      if (!userId || !userType || !tenantId || !sessionId) {
        return c.json({
          error: 'Missing required headers'
        }, 400);
      }

      // Validate session
      const isValid = await validateSession(sessionId, userId);
      if (!isValid) {
        return c.json({ 
          error: 'Invalid or expired session',
          needsNewSession: true 
        }, 401);
      }

      // Parse group data from request body
      const groupData = await c.req.json();
      const { name, participants } = groupData;

      if (!name || !participants || !Array.isArray(participants)) {
        return c.json({
          error: 'Missing required fields: name and participants array'
        }, 400);
      }

      // Create group room
      const result = await CommunicationService.createGroupRoom(
        userId,
        userType,
        tenantId,
        name,
        participants
      );

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      return c.json({
        success: true,
        roomId: result.roomId,
        message: 'Group room created successfully'
      });
    } catch (error) {
      console.error('Error creating group:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // 404 handler
  app.notFound((c: Context) => {
    return c.json({ error: 'Not Found' }, 404);
  });

  // Error handler
  app.onError((err: Error, c: Context) => {
    console.error(err);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  // Start the Hono/HTTP server
  const httpPort = config.port;
  console.log(`Starting HTTP server on port ${httpPort}...`);

  serve({
    fetch: app.fetch,
    port: httpPort
  }, () => {
    console.log(`Hono HTTP server running on port ${httpPort}`);
  });

  // Now setup uWebSockets.js for WebSocket connections
  const wsPort = config.wsPort || 9001;
  console.log(`Starting WebSocket server on port ${wsPort}...`);

  uWS.App()
    .ws('/*', {
      /* Options */
      compression: uWS.SHARED_COMPRESSOR,
      maxPayloadLength: 30 * 1024 * 1024, // 30 MB
      idleTimeout: 3600, // 1 hour as required

      /* Upgrade handler to validate session before WebSocket connection */
      upgrade: (res, req, context) => {
        // Extract session ID from URL query parameters
        const url = req.getUrl();
        const queryString = req.getQuery();
        const queryParams = new URLSearchParams(queryString);
        const sessionId = queryParams.get('sessionId');
        
        // Extract auth token from headers
        const authHeader = req.getHeader('authorization') || req.getHeader('Authorization');
        const token = authHeader ? authHeader.replace('Bearer ', '') : null;
        
        if (!sessionId || !token) {
          res.close();
          return;
        }
        
        // Validate session before upgrading
        getSessionData(sessionId).then(session => {
          if (!session) {
            res.close();
            return;
          }
          
          // Proceed with the upgrade, passing session data and token
          res.upgrade(
            { 
              userId: session.userId,
              userType: session.userType,
              tenantId: session.tenantId,
              sessionId: sessionId,
              token: token  // Include the auth token for later use
            },
            req.getHeader('sec-websocket-key'),
            req.getHeader('sec-websocket-protocol'),
            req.getHeader('sec-websocket-extensions'),
            context
          );
        }).catch(err => {
          console.error('Error during WebSocket upgrade:', err);
          res.close();
        });
      },

      /* Handlers */
      open: async (ws) => {
        console.log('WebSocket authenticated:', (ws as any).sessionId);
      },

      message: async (ws, message, isBinary) => {
        try {
          // Parse the incoming message
          const messageText = Buffer.from(message).toString();
          const parsedMessage = JSON.parse(messageText);

          // Expected format should align with the IMessage structure from models
          const { type, recipientId, content, subject, mediaUrls } = parsedMessage;

          // Process different message types - unify userType and senderType
          switch (type) {
            case 'direct':
              // For a direct message, we use the authenticated user data from WebSocket
              const senderId = (ws as any).userId;
              const senderType = (ws as any).userType; // Use senderType consistently to match IMessage interface
              const tenantId = (ws as any).tenantId;

              // Determine recipient type by querying Janus using the token from WebSocket
              const recipientType = await determineRecipientType(recipientId, (ws as any).token); // Using the token passed during upgrade

              const result = await CommunicationService.sendDirectMessage(
                senderId, // senderId
                senderType, // Using senderType to be consistent with IMessage interface
                recipientId,
                recipientType,
                tenantId,
                subject || 'Direct Message',
                content,
                mediaUrls
              );

              if (result.success) {
                // Send success response to sender
                ws.send(JSON.stringify({
                  type: 'message_sent',
                  messageId: result.messageId,
                  message: 'Message sent successfully'
                }));

                // The message will be broadcast to the recipient via Redis Pub/Sub
              } else {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: result.error || 'Failed to send message'
                }));
              }
              break;

            case 'group': {
              const roomUsers = await getUsersInRoom(recipientId);
              const senderId = (ws as any).userId;
              const senderType = (ws as any).userType; // Use senderType consistently to match IMessage interface
              const tenantId = (ws as any).tenantId;
              
              // Create message object that matches IMessage structure
              const messageObj = {
                id: `msg_${uuidv7()}`,
                senderId,
                senderType, // Use senderType consistently to match IMessage interface
                recipientIds: roomUsers.filter(id => id !== senderId), // All room users except sender
                tenantId,
                messageType: mediaUrls && mediaUrls.length > 0 ? 'media' : 'group',
                content,
                subject: subject || 'Group Message',
                mediaUrls,
                status: 'sent',
                sentAt: new Date(),
              };

              // Send to all other users in the room via Redis Pub/Sub
              const promises = roomUsers.map(userId => {
                if (userId !== senderId) {
                  return publishToRoom(`user:${userId}`, JSON.stringify(messageObj));
                }
              });
              
              // Send all in parallel
              await Promise.all(promises.filter(promise => promise)); // Filter out undefined values
              
              // Confirm to sender that group message was sent
              ws.send(JSON.stringify({
                type: 'group_message_sent',
                message: 'Group message sent successfully'
              }));
              break;
            }

            default:
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Unknown message type'
              }));
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Error processing message'
          }));
        }
      },

      close: (ws, code, message) => {
        console.log('WebSocket connection closed with code:', code, 'Message:', message?.toString());
        // For issue #9: No immediate cleanup of Redis session is done here
        // The Redis session has a TTL of 1 hour and will expire automatically.
        // This allows clients to potentially reconnect and reuse the session within that timeframe.
        // Immediate cleanup is not necessary since the TTL handles expiration.
      }
    })
    .listen(wsPort, (token) => {
      if (token) {
        console.log(`uWebSockets server running on port ${wsPort}`);
      } else {
        console.error(`Failed to start uWebSockets server on port ${wsPort}`);
      }
    });
}

// Helper function to get session data from Redis
async function getSessionData(sessionId: string) {
  // Query Redis for session data using the existing Redis service
  const client = getRedisClient();
  
  try {
    const sessionKey = `session:${sessionId}`;
    const data = await client.hGetAll(sessionKey);
    
    return data.userId ? data : null;
  } catch (error) {
    console.error('Error getting session data:', error);
    return null;
  }
}

// Helper function to determine recipient type based on recipientId by querying Janus
async function determineRecipientType(recipientId: string, token: string): Promise<'staff' | 'director' | 'guardian' | 'student'> {
  try {
    // Query Janus to get user information by ID using the wrapper function
    const response = await callJanusApi(
      `/api/v1/users/${recipientId}`,
      token,
      'GET'
    );

    if (response.success && response.data?.success) {
      // The user role comes from Janus, but we need to map it correctly
      // From the Janus type definitions, we see that role can be 'director' | 'staff' | 'guardian' | 'student'
      const userRole = response.data.data.user.role;

      // Validate that the role is one of our expected types
      if (['staff', 'director', 'guardian', 'student'].includes(userRole)) {
        return userRole as 'staff' | 'director' | 'guardian' | 'student';
      }
    }

    // If the user is not found or role is invalid, return a default
    console.warn(`Could not determine role for user ${recipientId}, defaulting to 'guardian'`);
    return 'guardian';
  } catch (error) {
    console.error(`Error determining recipient type for ${recipientId}:`, error);
    // Default to guardian if we can't determine the type
    return 'guardian';
  }
}

// Start the server
startServer().catch(err => {
  console.error('Failed to start Hermes-Web server:', err);
  process.exit(1);
});

export { };