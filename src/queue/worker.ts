// src/queue/worker.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import { serve } from '@hono/node-server';
import { config } from '../config/environment';
import validateEnvironment from '../config/validator';
import { handleTask } from '../services/queue-services';
import { initializeRedis, getRedisClient } from '../services/redis-service';
import { validateServiceViaGateway } from '../services/validation-service';

async function startWorker() {
  // Validate environment variables
  validateEnvironment();

  // Initialize Redis connection
  await initializeRedis();

  console.log('Starting Hermes-Queue with Redis Streams...');

  // Setup Hono for HTTP API that allows other services to send messages/events to the queue
  const app = new Hono();

  // Global middleware
  app.use('*', cors());

  // Health check endpoint
  app.get('/health', (c: Context) => {
    return c.json({ 
      status: 'OK', 
      service: 'hermes-queue', 
      timestamp: new Date().toISOString()
    });
  });

  // API route for other services to send tasks to the queue
  app.post('/api/v1/queue/task', async (c: Context) => {
    try {
      // Extract service identity from headers
      const serviceId = c.req.header('x-service-id');
      const tenantId = c.req.header('x-tenant-id');
      const token = c.req.header('authorization')?.replace('Bearer ', '');
      
      if (!serviceId || !tenantId) {
        return c.json({ error: 'Missing required headers: x-service-id and x-tenant-id' }, 400);
      }

      // Validate the calling service via Janus-Gateway
      const validation = await validateServiceViaGateway(serviceId, tenantId);
      if (!validation.isValid) {
        console.error(`Service validation failed: ${serviceId} for tenant: ${tenantId}`);
        return c.json({ error: validation.error || 'Service validation failed' }, 401);
      }

      // Parse the task data from the request body
      const task = await c.req.json();
      
      // Validate required fields
      if (!task.type || !task.payload) {
        return c.json({ error: 'Missing required fields: type and payload' }, 400);
      }

      // Create a task ID
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Push the task to Redis Stream
      const redis = getRedisClient();
      await redis.xAdd('hermes:tasks', '*', {
        id: taskId,
        service: serviceId,
        type: task.type,
        payload: JSON.stringify(task.payload),
        tenantId: tenantId,
        timestamp: Date.now().toString()
      });

      return c.json({ 
        success: true, 
        taskId: taskId,
        message: 'Task queued successfully' 
      });

    } catch (error) {
      console.error('Error queuing task:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Start the HTTP server for the API
  const httpPort = config.port + 1000; // Use a different port than the socket server
  console.log(`Starting Queue HTTP API server on port ${httpPort}...`);
  
  serve({
    fetch: app.fetch,
    port: httpPort
  }, () => {
    console.log(`Hono Queue API server running on port ${httpPort}`);
  });

  // Start processing tasks from Redis Stream in the background
  processQueue().catch(error => {
    console.error('Error in Redis task processing:', error);
  });
}

// Function to continuously process tasks from Redis Stream
async function processQueue() {
  const redis = getRedisClient();
  
  // Create the consumer group if it doesn't exist
  try {
    await redis.xGroupCreate('hermes:tasks', 'hermes-group', '0', { MKSTREAM: true });
  } catch (error) {
    // Group might already exist, which is fine
    if (!(error as Error).message.includes('BUSYGROUP')) {
      console.error('Error creating consumer group:', error);
    }
  }

  console.log('Starting Redis Stream task processor...');
  
  while (true) {
    try {
      // Read from the Redis Stream using consumer group
      const result = await redis.xReadGroup(
        'hermes-group', 
        'hermes-consumer', 
        [
          {
            key: 'hermes:tasks',
            id: '>',  // Read new messages only
          }
        ],
        {
          COUNT: 1, // Read one message at a time
          BLOCK: 5000 // Timeout of 5 seconds
        }
      );
      
      // Check if we received any messages
      if (result && Array.isArray(result) && result.length > 0) {
        const streamData = result[0]; // First element is the stream name and messages
        if (streamData && streamData.messages && streamData.messages.length > 0) {
          for (const message of streamData.messages) {
            try {
              // Parse the task message
              const parsedTask = {
                id: message.id,
                serviceId: message.message.service,
                type: message.message.type as 'email_dispatch' | 'media_processing' | 'service_routing' | 'notification' | 'announcement' | 'bulk_update',
                payload: JSON.parse(message.message.payload),
                tenantId: message.message.tenantId,
                createdAt: new Date(parseInt(message.message.timestamp))
              };

              console.log(`Processing task: ${parsedTask.id} from service: ${parsedTask.serviceId}`);
              
              // Process the task
              await handleTask(parsedTask);
              
              // Acknowledge the task processing
              await redis.xAck('hermes:tasks', 'hermes-group', message.id);
              
              console.log(`Task ${parsedTask.id} processed and acknowledged`);
            } catch (error) {
              console.error(`Error processing task ${message.id}:`, error);
            }
          }
        }
      }
      // If no tasks are available, continue the loop (the BLOCK option handles delays)
    } catch (error) {
      console.error('Error reading from Redis Stream:', error);
      // Wait a bit before retrying to avoid busy-looping on errors
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Start the worker
startWorker().catch(err => {
  console.error('Failed to start Hermes-Queue:', err);
  process.exit(1);
});

export {};