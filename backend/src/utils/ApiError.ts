/** An error that maps directly to an HTTP response. Anything else becomes a 500. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown, code = 'BAD_REQUEST') {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(message = 'Please log in to continue') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, code = 'CONFLICT', details?: unknown) {
    return new ApiError(409, code, message, details);
  }
  static unprocessable(message: string, details?: unknown, code = 'UNPROCESSABLE') {
    return new ApiError(422, code, message, details);
  }
}
