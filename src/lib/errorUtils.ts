export interface ErrorLike {
  code?: string;
  message?: string;
}

export function toErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === 'string' ? record.code : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
    };
  }
  return {
    message: typeof error === 'string' ? error : undefined,
  };
}

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  return toErrorLike(error).message || fallback;
}

export function getErrorCode(error: unknown): string | undefined {
  return toErrorLike(error).code;
}
