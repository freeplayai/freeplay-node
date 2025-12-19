export class FreeplayError extends Error {
  private cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.cause = cause;
  }
}

export class FreeplayConfigurationError extends FreeplayError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

export class FreeplayServerError extends FreeplayError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

export class FreeplayClientError extends FreeplayError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

export class LLMClientError extends FreeplayError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

export class LLMServerError extends FreeplayError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

export function llmError(message: string, error: any) {
  const status = findStatus(error);
  if (status >= 500) {
    return new LLMServerError(message, error);
  } else {
    return new LLMClientError(message, error);
  }
}

export function freeplayError(
  message: string,
  error: any = undefined,
): FreeplayError {
  const status = findStatus(error);
  const fullMessage = makeErrorMessage(message, error);
  if (status >= 500) {
    return new FreeplayServerError(fullMessage, error);
  } else {
    return new FreeplayClientError(fullMessage, error);
  }
}

function findStatus(error: any): number {
  if (error === undefined) {
    return -1;
  }
  if (typeof error === "object") {
    if ("status" in error && typeof error.status === "number") {
      return error.status;
    }
    if (error.response?.status && typeof error.response.status === "number") {
      return error.response.status;
    }
  }
  return -1;
}

export function makeErrorMessage(baseMessage: string, error: any): string {
  let fullMessage = baseMessage;
  if (error && error.response) {
    fullMessage += " Received status " + error.response.status + ".";
    if (error.response.data && error.response.data.message) {
      fullMessage += ` ${error.response.data.message}`;
    }
  } else if (error && "message" in error) {
    fullMessage += ` ${error.message}`;
  }

  return fullMessage;
}
