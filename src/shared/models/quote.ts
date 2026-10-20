export type QuoteCity = "bogota" | "chia";
export type TechnicalAssessment = "complete" | "incomplete" | "outside_scope";
export type QuoteStatus = "calculated" | "pending_review" | "issued";

export interface QuoteLineInput {
  readonly serviceCode: string;
  readonly quantity: number;
  readonly technicalAssessment?: TechnicalAssessment;
  readonly technicalNotes?: string;
}

export interface QuoteInput {
  readonly requestId: string;
  readonly city: QuoteCity;
  readonly visitDate: string;
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly urgent: boolean;
  readonly isHoliday: boolean;
  readonly lines: readonly QuoteLineInput[];
}

export type QuoteReviewReasonCode =
  | "invalid_input"
  | "invalid_date"
  | "invalid_time"
  | "invalid_duration"
  | "invalid_city"
  | "invalid_quantity"
  | "service_not_found"
  | "travel_line_not_allowed"
  | "no_applicable_tariff"
  | "technical_information_missing"
  | "technical_information_incomplete"
  | "outside_catalog_scope"
  | "weekday_holiday"
  | "weekday_before_hours"
  | "weekday_outside_hours"
  | "crosses_midnight";

export interface QuoteReviewReason {
  readonly code: QuoteReviewReasonCode;
  readonly message: string;
  readonly serviceCode?: string;
}

export interface QuoteLineSnapshot {
  readonly serviceCode: string;
  readonly description: string;
  readonly unit: string;
  readonly quantity: number;
  readonly technicalAssessment?: "complete";
  readonly technicalNotes?: string;
  readonly unitPriceCop: number;
  readonly amountCop: number;
  readonly surchargeRatePercent: number;
  readonly surchargeCop: number;
  readonly tariffVersionId: string;
}

export interface QuoteDraft {
  readonly id: string;
  readonly requestId: string;
  readonly status: "calculated";
  readonly emissionDate: string;
  readonly expirationDate: string;
  readonly city: QuoteCity;
  readonly visitDate: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly durationMinutes: number;
  readonly urgent: boolean;
  readonly isHoliday: boolean;
  readonly lines: readonly QuoteLineSnapshot[];
  readonly taxableBaseCop: number;
  readonly taxRatePercent: 19;
  readonly taxCop: number;
  readonly totalCop: number;
  readonly previousRevisionId: string | null;
  readonly reviewReasons: readonly [];
}

export interface IssuedQuote extends Omit<QuoteDraft, "status"> {
  readonly status: "issued";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type QuoteCalculationResult =
  | {
      readonly kind: "calculated";
      readonly quote: QuoteDraft;
    }
  | {
      readonly kind: "blocked";
      readonly status: "pending_review";
      readonly requestId: string | null;
      readonly reasons: readonly QuoteReviewReason[];
    };
