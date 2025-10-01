// src/services/redis-service.ts
import { createClient, RedisClientType, RedisDefaultModules, RedisModules, RedisFunctions } from 'redis';
import { config } from '../config/environment';

let redisClient: RedisClientType<RedisDefaultModules | RedisModules, RedisFunctions>;

export async function initializeRedis(): Promise<void> {
  try {
    redisClient = createClient({
      url: config.redisUrl,
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis successfully');
    });

    await redisClient.connect();
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedisClient(): RedisClientType<RedisDefaultModules | RedisModules, RedisFunctions> {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

// Function to validate WebSocket sessions
export async function validateSession(sessionId: string, userId: string): Promise<boolean> {
  const redisClient = getRedisClient();
  const storedUserId = await redisClient.get(`session:${sessionId}`);
  
  return storedUserId === userId;
}

// Function to store a validated session
export async function storeSession(sessionId: string, userId: string, tenantId: string, expiry: number = 3600): Promise<void> { // 1 hour default
  const redisClient = getRedisClient();
  // Store session with user ID
  await redisClient.setEx(`session:${sessionId}`, expiry, userId);
  // Also store tenant information
  await redisClient.setEx(`session:tenant:${sessionId}`, expiry, tenantId);
  // Link user to session
  await redisClient.setEx(`user:session:${userId}`, expiry, sessionId);
}

// Function to remove a session
export async function removeSession(sessionId: string, userId: string): Promise<void> {
  const redisClient = getRedisClient();
  await redisClient.del(`session:${sessionId}`);
  await redisClient.del(`session:tenant:${sessionId}`);
  await redisClient.del(`user:session:${userId}`);
}

// Function to get tenant ID from session
export async function getTenantFromSession(sessionId: string): Promise<string | null> {
  const redisClient = getRedisClient();
  return await redisClient.get(`session:tenant:${sessionId}`);
}

// Function to publish messages to a room via Redis Pub/Sub
export async function publishToRoom(room: string, message: string): Promise<void> {
  const redisClient = getRedisClient();
  await redisClient.publish(room, message);
}

// Function to subscribe to a room for WebSocket broadcasting
export async function subscribeToRoom(room: string, messageHandler: (message: string, channel: string) => void): Promise<void> {
  const redisClient = getRedisClient();
  await redisClient.subscribe(room, messageHandler);
}

// Function to unsubscribe from a room
export async function unsubscribeFromRoom(room: string): Promise<void> {
  const redisClient = getRedisClient();
  await redisClient.unsubscribe(room);
}

// Function to add user to room
export async function addUserToRoom(userId: string, roomId: string, expiry: number = 3600): Promise<void> {
  const redisClient = getRedisClient();
  // Add user to the room set
  await redisClient.sAdd(`room:${roomId}`, userId);
  // Set expiration for the room set
  await redisClient.expire(`room:${roomId}`, expiry);
  // Also track which room a user is in
  await redisClient.setEx(`user:room:${userId}`, expiry, roomId);
}

// Function to remove user from room
export async function removeUserFromRoom(userId: string, roomId: string): Promise<void> {
  const redisClient = getRedisClient();
  await redisClient.sRem(`room:${roomId}`, userId);
  await redisClient.del(`user:room:${userId}`);
}

// Function to get all users in a room
export async function getUsersInRoom(roomId: string): Promise<string[]> {
  const redisClient = getRedisClient();
  return await redisClient.sMembers(`room:${roomId}`);
}