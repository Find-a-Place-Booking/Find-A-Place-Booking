import {
  ProviderNotReadyError,
  type CreateProviderPaymentInput,
  type CreateProviderPaymentResult,
  type PaymentProviderAdapter,
  type ProviderReadiness,
  type RefundProviderPaymentInput,
} from "./provider";

const REQUIRED = ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"] as const;

export class StripePaymentProvider implements PaymentProviderAdapter {
  readonly name = "STRIPE" as const;

  readiness(): ProviderReadiness {
    const missingEnvironment = REQUIRED.filter((key) => !process.env[key]);
    return { provider: this.name, configured: missingEnvironment.length === 0, liveMoneyEnabled: false, missingEnvironment };
  }

  async createPayment(_input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    // Deliberately fail closed until the real Find A Place Stripe platform
    // account is connected and the dedicated processor-adapter milestone is accepted.
    throw new ProviderNotReadyError(this.name);
  }

  async refundPayment(_input: RefundProviderPaymentInput): Promise<{ providerRefundId: string; status: "PENDING" | "SUCCEEDED" }> {
    throw new ProviderNotReadyError(this.name);
  }
}
