/**
 * Shared types between client and server
 */

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    status: string;
    department?: string;
    studentId?: string;
    employeeId?: string;
  }
}
