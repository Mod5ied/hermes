import axios from "axios";
import { config } from "../config/environment";
import { sendEmail, EmailClient } from "../utils/email-wrapper";
import { AnnouncementPayload, BulkUpdatePayload, EmailDispatchPayload, MediaProcessingPayload, NotificationPayload, ServiceRoutingPayload, WorkerTask } from "../models/tasks";

// Handle different types of tasks
export async function handleTask(task: WorkerTask): Promise<void> {
  const workerTask: WorkerTask = {
    id: task.id,
    type: task.type,
    payload: task.payload,
    tenantId: task.tenantId,
    serviceId: task.serviceId,
    createdAt: task.createdAt,
    priority: task.priority || 'normal'
  };

  console.log(`Handling task ${workerTask.id} of type ${workerTask.type} from service ${workerTask.serviceId} for tenant ${workerTask.tenantId}`);

  try {
    // Process different types of tasks as per the requirements
    switch (workerTask.type) {
      case 'email_dispatch':
        await handleEmailDispatch(workerTask);
        break;
        
      case 'media_processing':
        await handleMediaProcessing(workerTask);
        break;
        
      case 'service_routing':
        await handleServiceRouting(workerTask);
        break;
        
      case 'notification':
        await handleNotification(workerTask);
        break;
        
      case 'announcement':
        await handleAnnouncement(workerTask);
        break;
        
      case 'bulk_update':
        await handleBulkUpdate(workerTask);
        break;
        
      default:
        console.warn(`Unknown task type: ${workerTask.type}`);
    }
  } catch (error) {
    console.error(`Error in handleTask for ${workerTask.id}:`, error);
    throw error;
  }
}

async function handleEmailDispatch(task: WorkerTask): Promise<void> {
  console.log(`Handling email dispatch task: ${task.id}`);
  
  const payload = task.payload as EmailDispatchPayload;
  const { recipientEmail, subject, body, attachments, emailClient } = payload;
  
  try {
    // Send email using the email wrapper
    const emailParams = {
      to: Array.isArray(recipientEmail) ? recipientEmail : [recipientEmail],
      subject,
      html: body,
      ...(attachments && { attachments })
    };

    // Determine which email client to use based on the payload
    const client: EmailClient = emailClient || 'brevo';
    
    await sendEmail(emailParams, client);
    
    console.log(`Email sent successfully for task: ${task.id}`);
  } catch (error) {
    console.error(`Failed to send email for task ${task.id}:`, error);
    throw error;
  }
}

async function handleMediaProcessing(task: WorkerTask): Promise<void> {
  console.log(`Handling media processing task: ${task.id}`);
  
  const payload = task.payload as MediaProcessingPayload;
  const { mediaUrl, mediaType, processingOptions } = payload;
  
  try {
    // In a real implementation, this would:
    // 1. Download the media from mediaUrl
    // 2. Process it based on mediaType (resize images, transcode videos, optimize PDFs)
    // 3. Upload the processed media to storage
    // 4. Update the database with processed media info
    
    console.log(`Processing media: ${mediaUrl} of type: ${mediaType}`);
    
    // Placeholder for media processing logic
    // This could involve:
    // - Image resizing using Sharp library
    // - Video transcoding using FFmpeg
    // - PDF optimization
    
    console.log(`Media processed successfully for task: ${task.id}`);
  } catch (error) {
    console.error(`Failed to process media for task ${task.id}:`, error);
    throw error;
  }
}

async function handleServiceRouting(task: WorkerTask): Promise<void> {
  console.log(`Handling service routing task: ${task.id}`);
  
  const payload = task.payload as ServiceRoutingPayload;
  const { targetService, endpoint, data, method = 'POST', timeout = 10000 } = payload;
  
  try {
    // This handles routing service-to-service API calls
    let targetUrl = '';
    switch (targetService) {
      case 'athena':
        targetUrl = config.athenaApiUrl;
        break;
      case 'apollo':
        targetUrl = config.apolloApiUrl;
        break;
      case 'zeus':
        targetUrl = config.zeusApiUrl;
        break;
      case 'hestia':
        targetUrl = config.hestiaApiUrl;
        break;
      case 'janus':
        targetUrl = config.janusGatewayUrl;
        break;
      default:
        throw new Error(`Unknown target service: ${targetService}`);
    }
    
    // Perform the API call to the target service
    const response = await axios({
      method,
      url: `${targetUrl}${endpoint}`,
      data,
      headers: {
        'x-tenant-id': task.tenantId,
        'x-service-id': task.serviceId, // Identity of the original service making the request
        'content-type': 'application/json'
      },
      timeout: timeout
    });
    
    console.log(`Service routing completed for task: ${task.id}`, response.status);
  } catch (error) {
    console.error(`Failed to route service call for task ${task.id}:`, error);
    if (axios.isAxiosError(error)) {
      console.error(`Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
    }
    throw error;
  }
}

async function handleNotification(task: WorkerTask): Promise<void> {
  console.log(`Handling notification task: ${task.id}`);
  
  const payload = task.payload as NotificationPayload;
  const { recipientId, recipientType, title, body, data } = payload;
  
  try {
    // In a real implementation, this would send push notifications via FCM or APNs
    console.log(`Sending notification to ${recipientType} ${recipientId}: ${title}`);
    
    // Placeholder for push notification logic
    // This might involve sending to Firebase Cloud Messaging or Apple Push Notification Service
    console.log(`Notification data:`, data);
    
    console.log(`Notification sent successfully for task: ${task.id}`);
  } catch (error) {
    console.error(`Failed to send notification for task ${task.id}:`, error);
    throw error;
  }
}

// Handle announcements to multiple users (e.g., all staff/guardians)
async function handleAnnouncement(task: WorkerTask): Promise<void> {
  console.log(`Handling announcement task: ${task.id}`);
  
  const payload = task.payload as AnnouncementPayload;
  const { title, body, targetGroup, emailClient } = payload;
  
  try {
    // Query the database for all emails of the targetGroup
    // This will require calling relevant services to get user emails
    let emails: string[] = [];
    
    switch (targetGroup) {
      case 'Staff':
        // Call the Hera (Staff Management) service to get all staff emails
        console.log('Querying Hera service for all staff emails...');
        const staffResponse = await axios.get(`${config.heraApiUrl}/api/v1/staff/emails`, {
          headers: { 
            'x-tenant-id': task.tenantId,
            'x-service-id': task.serviceId
          }
        });
        emails = staffResponse.data.emails || [];
        break;
        
      case 'Guardians':
        // Call the Hestia (Guardian Management) service to get all guardian emails
        console.log('Querying Hestia service for all guardian emails...');
        const guardianResponse = await axios.get(`${config.hestiaApiUrl}/api/v1/guardians/emails`, {
          headers: { 
            'x-tenant-id': task.tenantId,
            'x-service-id': task.serviceId
          }
        });
        emails = guardianResponse.data.emails || [];
        break;
        
      default:
        throw new Error(`Invalid target group: ${targetGroup}. Must be 'Staff' or 'Guardians'`);
    }
    
    if (emails.length === 0) {
      console.log(`No emails found for target group: ${targetGroup}`);
      return;
    }
    
    // Prepare email parameters for batch sending
    const emailParams = {
      to: emails,
      subject: title,
      html: body
    };

    // Determine which email client to use based on the payload
    const client: EmailClient = emailClient || 'brevo';
    
    // Send batch email using the email wrapper
    await sendEmail(emailParams, client);
    
    console.log(`Announcement sent successfully to ${emails.length} recipients in ${targetGroup} group for task: ${task.id}`);
  } catch (error) {
    console.error(`Failed to send announcement for task ${task.id}:`, error);
    throw error;
  }
}

// Handle bulk updates (e.g., update profiles of multiple teachers)
async function handleBulkUpdate(task: WorkerTask): Promise<void> {
  console.log(`Handling bulk update task: ${task.id}`);
  
  const payload = task.payload as BulkUpdatePayload;
  const { targetService, endpoint, updateData, filter } = payload;
  
  try {
    // Logic to perform bulk updates across multiple entities
    console.log(`Performing bulk update on ${targetService} with filter:`, filter);
    
    let targetUrl = '';
    switch (targetService) {
      case 'athena':
        targetUrl = config.athenaApiUrl;
        break;
      case 'apollo':
        targetUrl = config.apolloApiUrl;
        break;
      case 'zeus':
        targetUrl = config.zeusApiUrl;
        break;
      case 'hestia':
        targetUrl = config.hestiaApiUrl;
        break;
      case 'hera':
        targetUrl = config.heraApiUrl;
        break;
      case 'janus':
        targetUrl = config.janusGatewayUrl;
        break;
      default:
        throw new Error(`Unknown target service: ${targetService}`);
    }
    
    // Call the target service to perform bulk operations
    const response = await axios.post(
      `${targetUrl}${endpoint}`,
      {
        updateData,
        filter
      },
      {
        headers: {
          'x-tenant-id': task.tenantId,
          'x-service-id': task.serviceId,
          'content-type': 'application/json'
        },
        timeout: 30000 // 30 second timeout for bulk operations
      }
    );
    
    console.log(`Bulk update completed successfully for task: ${task.id}`, response.status);
  } catch (error) {
    console.error(`Failed to perform bulk update for task ${task.id}:`, error);
    if (axios.isAxiosError(error)) {
      console.error(`Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
    }
    throw error;
  }
}