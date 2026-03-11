export type Result<T, E = Error> = 
  | { success: true; value: T }
  | { success: false; error: E };

export const success = <T>(value: T): Result<T> => ({ success: true, value });
export const failure = <E = Error>(error: E): Result<any, E> => ({ success: false, error });
