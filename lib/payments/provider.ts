export type PaymentProviderName = "STRIPE" | "SQUARE";

export type ProviderReadiness = {
  provider: PaymentProviderName;
  configured: boolean;
  liveMoneyEnabled: false;
  missingEnvironment: string[];
};

export type CreateProviderPaymentInput = {
  reservationId: string;
  paymentAccountId: string;
  providerAccountId: string;
  providerLocationId?: string | null;
  amountCents: number;
  applicationFeeCents: number;
  currency: string;
  idempotencyKey: string;
};

export type CreateProviderPaymentResult = {
  provider: PaymentProviderName;
  providerPaymentId: string;
  status: "REQUIRES_ACTION" | "PROCESSING" | "SUCCEEDED";
};

export type RefundProviderPaymentInput = {
  paymentId: string;
  providerPaymentId: string;
  amountCents: number;
  applicationFeeRefundCents: number;
  currency: string;
  idempotencyKey: string;
};

export interface PaymentProviderAdapter {
  readonly name: PaymentProviderName;
  readiness(): ProviderReadiness;
  createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult>;
  refundPayment(input: RefundProviderPaymentInput): Promise<{ providerRefundId: string; status: "PENDING" | "SUCCEEDED" }>;
}

export class ProviderNotReadyError extends Error {
  constructor(provider: PaymentProviderName) {
    super(`${provider} is not configured for Find A Place test payments yet.`);
    this.name = "ProviderNotReadyError";
  }
}
