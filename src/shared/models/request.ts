export const REQUEST_STATUSES = [
  "pending_review",
  "needs_information",
  "approved",
  "rejected",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface RequestInput {
  customerName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  serviceDescription: string;
  serviceAddress: string;
  preferredDate: string | null;
}

export interface RequestRecord extends RequestInput {
  id: string;
  status: RequestStatus;
  reviewNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewInput {
  status: RequestStatus;
  notes: string;
}
