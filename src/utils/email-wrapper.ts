import axios from 'axios';

// Define the email client type
export type EmailClient = 'brevo' | 'zoho';

// Define email parameters interface
export interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  name: string;
  content: string; // base64 encoded
  type?: string;
}

// Define the email client interface
interface EmailService {
  send: (params: EmailParams) => Promise<any>;
  sendBatch?: (paramsList: EmailParams[]) => Promise<any>;
}

// Brevo email service implementation
class BrevoService implements EmailService {
  private apiKey: string;
  private baseUrl: string = 'https://api.brevo.com/v3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(params: EmailParams): Promise<any> {
    const response = await axios.post(
      `${this.baseUrl}/smtp/email`,
      {
        sender: { name: 'SchoolPilot', email: process.env.BREVO_FROM_EMAIL || 'noreply@schoolpilot.com' },
        to: Array.isArray(params.to) ? params.to.map(email => ({ email })) : [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
        textContent: params.text,
        ...(params.attachments && params.attachments.length > 0 && {
          attachment: params.attachments.map(att => ({
            name: att.name,
            content: att.content,
            ...(att.type && { contentType: att.type })
          }))
        })
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'api-key': this.apiKey
        }
      }
    );

    return response.data;
  }

  async sendBatch(paramsList: EmailParams[]): Promise<any> {
    // Brevo supports sending to multiple recipients in a single API call
    // Group all unique recipients and send as a single batch
    const allRecipients = new Set<string>();
    paramsList.forEach(params => {
      if (Array.isArray(params.to)) {
        params.to.forEach(email => allRecipients.add(email));
      } else {
        allRecipients.add(params.to);
      }
    });

    const recipientsArray = Array.from(allRecipients);

    // Use the first email's content for the batch send
    if (paramsList.length > 0) {
      const firstParams = paramsList[0];
      
      const response = await axios.post(
        `${this.baseUrl}/smtp/email`,
        {
          sender: { name: 'SchoolPilot', email: process.env.FROM_EMAIL || 'noreply@schoolpilot.com' },
          to: recipientsArray.map(email => ({ email })),
          subject: firstParams.subject,
          htmlContent: firstParams.html,
          textContent: firstParams.text,
          ...(firstParams.attachments && firstParams.attachments.length > 0 && {
            attachment: firstParams.attachments.map(att => ({
              name: att.name,
              content: att.content,
              ...(att.type && { contentType: att.type })
            }))
          })
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'api-key': this.apiKey
          }
        }
      );

      return response.data;
    }
  }
}

// Zoho email service implementation placeholder
class ZohoService implements EmailService {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private baseUrl: string = 'https://mail.zoho.com/api/v1';

  constructor(clientId: string, clientSecret: string, refreshToken: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
  }

  async send(params: EmailParams): Promise<any> {
    // Placeholder implementation - Zoho Mail API would go here
    console.warn('Zoho email service is not fully implemented yet');
    // This would involve getting an access token using the refresh token,
    // and then making the appropriate Zoho Mail API calls
    throw new Error('Zoho email service not implemented');
  }

  async sendBatch(paramsList: EmailParams[]): Promise<any> {
    console.warn('Zoho batch email service is not fully implemented yet');
    throw new Error('Zoho batch email service not implemented');
  }
}

// Email wrapper function that selects the appropriate email client
export async function sendEmail(
  params: EmailParams,
  client: EmailClient = 'brevo'
): Promise<any> {
  let emailService: EmailService;

  switch (client) {
    case 'brevo':
      const brevoApiKey = process.env.BREVO_API_KEY;
      if (!brevoApiKey) {
        throw new Error('BREVO_API_KEY environment variable is required');
      }
      emailService = new BrevoService(brevoApiKey);
      break;
      
    case 'zoho':
      const zohoClientId = process.env.ZOHO_CLIENT_ID;
      const zohoClientSecret = process.env.ZOHO_CLIENT_SECRET;
      const zohoRefreshToken = process.env.ZOHO_REFRESH_TOKEN;
      
      if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken) {
        throw new Error('Zoho credentials (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN) are required');
      }
      
      emailService = new ZohoService(zohoClientId, zohoClientSecret, zohoRefreshToken);
      break;
      
    default:
      // Default to Brevo if no valid client provided
      const fallbackApiKey = process.env.BREVO_API_KEY;
      if (!fallbackApiKey) {
        throw new Error('BREVO_API_KEY environment variable is required');
      }
      emailService = new BrevoService(fallbackApiKey);
  }

  return await emailService.send(params);
}

// Function to send batch emails
export async function sendBatchEmail(
  paramsList: EmailParams[],
  client: EmailClient = 'brevo'
): Promise<any> {
  let emailService: EmailService;

  switch (client) {
    case 'brevo':
      const brevoApiKey = process.env.BREVO_API_KEY;
      if (!brevoApiKey) {
        throw new Error('BREVO_API_KEY environment variable is required');
      }
      emailService = new BrevoService(brevoApiKey);
      break;
      
    case 'zoho':
      const zohoClientId = process.env.ZOHO_CLIENT_ID;
      const zohoClientSecret = process.env.ZOHO_CLIENT_SECRET;
      const zohoRefreshToken = process.env.ZOHO_REFRESH_TOKEN;
      
      if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken) {
        throw new Error('Zoho credentials (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN) are required');
      }
      
      emailService = new ZohoService(zohoClientId, zohoClientSecret, zohoRefreshToken);
      break;
      
    default:
      // Default to Brevo if no valid client provided
      const fallbackApiKey = process.env.BREVO_API_KEY;
      if (!fallbackApiKey) {
        throw new Error('BREVO_API_KEY environment variable is required');
      }
      emailService = new BrevoService(fallbackApiKey);
  }

  // Check if the email service supports batch sending
  if (emailService.sendBatch) {
    return await emailService.sendBatch(paramsList);
  } else {
    // If no batch method, send emails individually
    const results = [];
    for (const params of paramsList) {
      const result = await emailService.send(params);
      results.push(result);
    }
    return results;
  }
}