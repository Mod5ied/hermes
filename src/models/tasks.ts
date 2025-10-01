// Define task message format
export interface WorkerTask {
  id: string;
  type: 'email_dispatch' | 'media_processing' | 'service_routing' | 'notification' | 'announcement' | 'bulk_update';
  payload: any;
  tenantId: string;
  serviceId: string; // ID of the service that sent this task
  createdAt: Date;
  priority?: 'low' | 'normal' | 'high';
}