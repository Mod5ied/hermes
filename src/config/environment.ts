// src/config/environment.ts
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5566'),
  wsPort: parseInt(process.env.WS_PORT || '9001'),
  zeromqPort: parseInt(process.env.ZEROMQ_PORT || '5567'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  janusGatewayUrl: process.env.JANUS_GATEWAY_URL || 'http://localhost:4455',
  firebaseProjectId: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  janusApiUrl: process.env.JANUS_API_URL || 'http://localhost:4456',
  athenaApiUrl: process.env.ATHENA_API_URL || 'http://localhost:3001',
  apolloApiUrl: process.env.APOLLO_API_URL || 'http://localhost:3002',
  zeusApiUrl: process.env.ZEUS_API_URL || 'http://localhost:3003',
  hestiaApiUrl: process.env.HESTIA_API_URL || 'http://localhost:3004',
};