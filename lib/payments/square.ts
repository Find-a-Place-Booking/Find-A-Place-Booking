import {
  ProviderNotReadyError,
  type CreateProviderPaymentInput,
  type CreateProviderPaymentResult,
  type PaymentProviderAdapter,
  type ProviderReadiness,
  type RefundProviderPaymentInput,
} from "./provider";

const REQUIRED = [
  "SQUARE_APPLICATION_ID",
  "SQUARE_APPLICATION_SECRET",
  "SQUARE_WEBHOOK_SIGNATURE_KEY",
] as const;

export class SquarePaymentProvider implements PaymentProviderAdapter {
  readonly name = "SQUARE" as const;

  readiness(): ProviderReadiness {
    const missingEnvironment = REQUIRED.filter((key) => !process.env[key]);
    return { provider: this.name, configured: missingEnvironment.length === 0, liveMoneyEnabled: false, missingEnvironment };
  }

  async createPayment(_input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    // Square seller OAuth + app_fee_money wiring is intentionally deferred until
    // the real platform developer account is available for test-mode acceptance.
    throw new ProviderNotReadyError(this.name);
  }

  async refundPayment(_input: RefundProviderPaymentInput): Promise<{ providerRefundId: string; status: "PENDING" | "SUCCEEDED" }> {
    throw new ProviderNotReadyError(this.name);
  }
}
