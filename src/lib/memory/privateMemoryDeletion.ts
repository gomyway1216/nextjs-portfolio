export interface PrivateMemoryDeleteRequest {
  memoryId: string;
  expectedRevision: number;
  confirmationTitle: string;
  confirmed: true;
}

export interface PrivateMemoryDeleteResponse {
  memoryId: string;
  deleted: true;
}

const MEMORY_ID_PATTERN = /^[A-Za-z\d._:-]{1,128}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isExactMemoryDeleteConfirmation(
  confirmationTitle: string,
  currentTitle: string,
): boolean {
  return confirmationTitle === currentTitle;
}

export function parsePrivateMemoryDeleteRequest(value: unknown): PrivateMemoryDeleteRequest {
  if (!isRecord(value)) throw new Error('Invalid memory deletion request');
  const allowed = new Set(['memoryId', 'expectedRevision', 'confirmationTitle', 'confirmed']);
  if (Object.keys(value).some((key) => !allowed.has(key)) ||
      typeof value.memoryId !== 'string' || !MEMORY_ID_PATTERN.test(value.memoryId) ||
      !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 1 ||
      typeof value.confirmationTitle !== 'string' || value.confirmationTitle.length < 1 ||
      value.confirmationTitle.length > 240 || value.confirmed !== true) {
    throw new Error('Invalid memory deletion request');
  }
  return {
    memoryId: value.memoryId,
    expectedRevision: value.expectedRevision as number,
    confirmationTitle: value.confirmationTitle,
    confirmed: true,
  };
}

export function parsePrivateMemoryDeleteResponse(
  value: unknown,
  expectedMemoryId: string,
): PrivateMemoryDeleteResponse {
  if (!isRecord(value) || value.memoryId !== expectedMemoryId || value.deleted !== true ||
      Object.keys(value).some((key) => key !== 'memoryId' && key !== 'deleted')) {
    throw new Error('Invalid memory deletion response');
  }
  return {memoryId: expectedMemoryId, deleted: true};
}
