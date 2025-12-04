// Application-wide Error Tracking Types

export enum ErrorSource {
  FRONTEND = 'frontend',
  CLOUD_FUNCTION = 'cloud_function',
  API_ROUTE = 'api_route',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface AppError {
  id: string;
  source: ErrorSource;
  severity: ErrorSeverity;
  errorType: string;
  message: string;
  details?: string;
  stack?: string;
  functionName?: string;
  endpoint?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
  occurrenceCount: number;
  lastOccurredAt: string;
}
