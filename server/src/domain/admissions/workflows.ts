import { ApplicationStatus } from './entities';
import { AppError } from '../shared/errors';

export const ApplicationWorkflow = {
  transitions: {
    [ApplicationStatus.DRAFT]: [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN],
    [ApplicationStatus.SUBMITTED]: [ApplicationStatus.UNDER_REVIEW, ApplicationStatus.WITHDRAWN, ApplicationStatus.REJECTED],
    [ApplicationStatus.UNDER_REVIEW]: [
      ApplicationStatus.APPROVED, 
      ApplicationStatus.REJECTED, 
      ApplicationStatus.INTERVIEW_SCHEDULED,
      ApplicationStatus.WITHDRAWN
    ],
    [ApplicationStatus.INTERVIEW_SCHEDULED]: [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED],
    [ApplicationStatus.APPROVED]: [ApplicationStatus.OFFER_ISSUED, ApplicationStatus.WITHDRAWN],
    [ApplicationStatus.OFFER_ISSUED]: [ApplicationStatus.ENROLLED, ApplicationStatus.WITHDRAWN],
    [ApplicationStatus.REJECTED]: [], // Terminal
    [ApplicationStatus.ENROLLED]: [], // Terminal
    [ApplicationStatus.WITHDRAWN]: [], // Terminal
    [ApplicationStatus.MIGRATED]: [] // Special state
  } as Record<ApplicationStatus, ApplicationStatus[]>,

  canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
    const allowed = this.transitions[from] || [];
    return allowed.includes(to);
  },

  assertTransition(from: ApplicationStatus, to: ApplicationStatus) {
    if (!this.canTransition(from, to)) {
      throw new AppError('INVALID_TRANSITION', `Cannot move application from ${from} to ${to}`);
    }
  }
};
