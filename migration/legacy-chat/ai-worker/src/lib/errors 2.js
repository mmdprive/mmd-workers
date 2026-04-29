export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message) {
  return new AppError(400, 'INVALID_INPUT', message);
}

export function unauthorized(message = 'Unauthorized') {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Access denied') {
  return new AppError(403, 'ACCESS_DENIED', message);
}
