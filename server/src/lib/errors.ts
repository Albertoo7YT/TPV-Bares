export type AppError = Error & {
  status?: number;
};

export function createHttpError(status: number, message: string): AppError {
  const error = new Error(message) as AppError;
  error.status = status;
  return error;
}
