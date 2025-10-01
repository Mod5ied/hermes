// src/config/validator.ts
import { config } from './environment';

export default function validateEnvironment(): void {
  const requiredEnvVars = [
    'PORT',
    'ZEROMQ_PORT',
    'REDIS_URL',
    'JANUS_GATEWAY_URL',
    'JANUS_API_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'ATHENA_API_URL',
    'APOLLO_API_URL',
    'ZEUS_API_URL',
    'HESTIA_API_URL'
  ];

  const missingEnvVars: string[] = [];

  requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      missingEnvVars.push(envVar);
    }
  });

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(', ')}`
    );
  }
}