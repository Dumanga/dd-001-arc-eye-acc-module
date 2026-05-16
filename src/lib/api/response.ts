export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T | null;
  error: string | null;
};

export function ok<T>(data: T, message = "OK") {
  return {
    success: true,
    message,
    data,
    error: null,
  } satisfies ApiResponse<T>;
}

export function fail(message: string, error: string | null = null) {
  return {
    success: false,
    message,
    data: null,
    error,
  } satisfies ApiResponse<null>;
}
