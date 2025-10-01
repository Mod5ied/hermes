// src/services/validation-service.ts
import axios from 'axios';
import * as v from 'valibot'; // 1.2 kB
import { getRedisClient } from './redis-service';
import { config } from '../config/environment';

export interface ServiceValidationResult {
  isValid: boolean;
  error?: string;
  tenantId?: string;
}

export interface IdentityValidationResult {
  isValid: boolean;
  error?: string;
  userType?: 'staff' | 'director' | 'guardian' | 'student';
  tenantId?: string;
}

// Input validation schemas using valibot
export const UserSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
});

export async function validateServiceViaGateway(
  serviceId: string,
  tenantId: string
): Promise<ServiceValidationResult> {
  // Check Redis cache first for service validity
  const redisClient = getRedisClient();
  const cachedResult = await redisClient.get(`service:${serviceId}:${tenantId}`);

  if (cachedResult === 'valid') {
    // Service is valid and cached
    return { isValid: true, tenantId };
  } else if (cachedResult === 'invalid') {
    // Service is invalid and cached
    return { isValid: false, error: 'Service authentication failed' };
  }

  try {
    // If not in cache, validate with Janus-Gateway
    const response = await axios.post(
      `${config.janusGatewayUrl}/auth/validate`,
      {},
      {
        headers: {
          'x-service-id': serviceId,
          'x-tenant-id': tenantId,
        },
      }
    );

    if (response.status === 200) {
      // Cache the valid result for future requests (e.g., 10 minutes)
      await redisClient.setEx(`service:${serviceId}:${tenantId}`, 600, 'valid');
      return { isValid: true, tenantId };
    } else {
      // Cache the invalid result to prevent repeated checks (e.g., 5 minutes)
      await redisClient.setEx(`service:${serviceId}:${tenantId}`, 300, 'invalid');
      return { isValid: false, error: 'Service authentication failed' };
    }
  } catch (error) {
    // Cache the invalid result to prevent repeated checks
    await redisClient.setEx(`service:${serviceId}:${tenantId}`, 300, 'invalid');
    
    if (axios.isAxiosError(error)) {
      console.error(`Janus-Gateway validation error: ${error.message}`);
      return { isValid: false, error: error.message };
    } else {
      console.error(`Unexpected error during service validation: ${error}`);
      return { isValid: false, error: 'Internal server error during validation' };
    }
  }
}

export async function validateUserIdentity(
  userId: string,
  token: string
): Promise<IdentityValidationResult> {
  try {
    // Call Janus to validate the user token
    const response = await axios.post(
      `${config.janusApiUrl}/api/v1/auth/verify`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    
    if (response.status !== 200 || !response.data.success) {
      return {
        isValid: false,
        error: response.data.error || 'Token validation failed'
      };
    }
    
    // Parse and validate the user data from Janus response
    const userData = response.data.data?.user;
    if (!userData) {
      return {
        isValid: false,
        error: 'Invalid user data from authentication service'
      };
    }
    
    // Validate user data structure with valibot
    try {
      v.parse(UserSchema, {
        id: userData.uid || userId,
        name: userData.name || 'Unknown',
        email: userData.email || ''
      });
    } catch (validationError) {
      return {
        isValid: false,
        error: 'User data validation failed: ' + (validationError as Error).message
      };
    }
    
    return {
      isValid: true,
      userType: userData.role, // This will be 'staff', 'director', 'guardian', or 'student'
      tenantId: response.data.data?.tenantId
    };
  } catch (error) {
    console.error(`Error validating user identity: ${error}`);
    if (axios.isAxiosError(error)) {
      return { 
        isValid: false, 
        error: error.response?.data?.error || error.message 
      };
    }
    return { isValid: false, error: 'Identity validation failed' };
  }
}

// Generic function to make API calls to Janus with proper error handling
export async function callJanusApi(
  endpoint: string, 
  token?: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await axios({
      method,
      url: `${config.janusApiUrl}${endpoint}`,
      headers,
      data
    });

    if (response.status >= 200 && response.status < 300 && response.data?.success) {
      return {
        success: true,
        data: response.data
      };
    } else {
      return {
        success: false,
        error: response.data?.error || `HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error(`Error calling Janus API: ${endpoint}`, error);
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'API call failed'
      };
    }
    return {
      success: false,
      error: 'API call failed'
    };
  }
}