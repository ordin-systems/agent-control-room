export class ControlError extends Error {
  constructor(code, message = code, details = {}) {
    super(message);
    this.name = "ControlError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function fail(code, message, details) {
  throw new ControlError(code, message, details);
}
