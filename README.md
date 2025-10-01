# Hermes: Communication Service

Hermes is the communication service for the SchoolPilot platform, designed to facilitate communication between the school, teachers, guardians, and students.

## Architecture

This service follows a dual subsystem architecture:

### Hermes-Socket (Realtime Layer)
- Built on uWebSockets.js for high-performance WebSocket and HTTP handling
- Serves Hono-based HTTP APIs for session initiation and message history
- Manages short-lived (1-hour) WebSocket sessions for real-time chat
- Uses Redis for:
  - Validated session caching
  - Pub/Sub coordination of WebSocket rooms across instances (if scaled)
- Persists messages to Firebase in real time

The Hermes-Socket orchestrates communication relationships:
- Director ↔ Staff
- Director ↔ Guardian
- Staff ↔ Guardian
- Staff ↔ Student
- (No Director ↔ Student allowed)

### Hermes-Queue (Async Task Layer)
- **NEW**: Uses Redis Streams instead of ZeroMQ for message queuing (more efficient and durable)
- Exposes HTTP API endpoint for other services to queue tasks
- Handles background operations:
  - Email dispatch
  - Media processing (image resizing, video transcoding, PDF optimization)
  - Routing service-to-service API calls (via Axios → Janus-Gateway for auth/validation)
  - Bulk notifications and announcements
  - Bulk profile updates
- Uses Redis Consumer Groups for reliable message processing with acknowledgments
- Runs in isolated threads, processes, or containers to avoid blocking the realtime layer

## Core Capabilities
- Real-time one-to-one and group messaging (1-hour WebSocket sessions)
- Daily notes, announcements, and updates for guardians
- Live photo and video sharing (with async media processing)
- Push notifications (via external provider)
- Service-to-service task queuing via Redis Streams
- Durable task processing with automatic acknowledgments

## API Endpoints

### HTTP APIs (Hono) - Hermes-Socket
- `POST /api/v1/session/initiate` - Initialize a WebSocket session
- `GET /api/v1/messages/history` - Get message history for a user
- `POST /api/v1/group/create` - Create a group chat room
- `GET /health` - Health check endpoint

### HTTP APIs (Hono) - Hermes-Queue  
- `POST /api/v1/queue/task` - Queue tasks from other services (Athena, Hera, Zeus, etc.)
- `GET /health` - Health check endpoint

### WebSocket Endpoint
- `ws://<host>:<ws_port>?sessionId={sessionId}` - Real-time messaging via WebSockets (with session ID in URL)

## Environment Variables

- `PORT`: Port to run the HTTP server on (default: 5566)
- `WS_PORT`: Port for WebSocket connections (default: 9001)
- `REDIS_URL`: URL for Redis connection
- `JANUS_GATEWAY_URL`: URL for Janus-Gateway service validation
- `JANUS_API_URL`: URL for Janus (User Identity Management) service
- `FIREBASE_PROJECT_ID`: Firebase project ID
- `FIREBASE_CLIENT_EMAIL`: Firebase client email
- `FIREBASE_PRIVATE_KEY`: Firebase private key
- `ATHENA_API_URL`: URL for Athena (Student Management) service
- `APOLLO_API_URL`: URL for Apollo (Teaching & Curriculum) service
- `ZEUS_API_URL`: URL for Zeus (Director Management) service
- `HESTIA_API_URL`: URL for Hestia (Guardian Management) service
- `HERA_API_URL`: URL for Hera (Staff Management) service

## Running the Service

### For Hermes-Socket (Realtime Layer):
```bash
npm run dev:socket
```

### For Hermes-Queue (Async Task Layer):
```bash
npm run dev:queue
```

### For Production:
```bash
npm run build
npm run start:socket  # For Hermes-Socket
npm run start:queue  # For Hermes-Queue
```

## Integration Points
- Student Management Service: Receives triggers to send progress reports and attendance alerts
- Teaching & Curriculum Service: Receives lesson plans and resources for distribution
- User & Identity Management Service: Validates recipient identities and resolves user endpoints
- Director Management Service: Delivers administrative communications
- Guardian Management Service: Sends student progress updates and school-wide announcements
- Janus-Gateway: Validates all inbound service-to-service requests (via Axios)

## Architecture Improvements

### Redis Streams Implementation
- **Replaced ZeroMQ** with Redis Streams for better durability and efficiency
- **Persistent message queues** that survive restarts
- **Consumer groups** for scalable task processing
- **Automatic acknowledgments** ensuring reliable message delivery
- **Simplified architecture** using Redis which is already in the system

### Enhanced Security & Validation
- **Comprehensive input validation** using valibot library
- **Unified user type handling** to maintain consistency across codebase
- **Improved session management** with proper WebSocket upgrade validation
- **Service authentication** via Janus-Gateway for all service-to-service communications

## Security Features
- Session validation and management with 1-hour expiration
- Communication permission validation (e.g., Director ↔ Student not allowed)
- Service authentication via Janus-Gateway validation
- Tenant isolation ensuring proper data access
- Input validation using valibot for all API endpoints
- Secure WebSocket connections with session validation at upgrade time