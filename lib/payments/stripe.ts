import {
  ProviderNotReadyError,
  type CreateProviderPaymentInput,
  type CreateProviderPaymentResult,
  type PaymentProviderAdapter,
  type ProviderReadiness,
  type RefundProviderPaymentInput,
} from "./provider";

const REQUIRED = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
] as const;

export class StripePaymentProvider implements PaymentProviderAdapter {
  readonly name = "STRIPE" as const;

  readiness(): ProviderReadiness {
    const missingEnvironment = REQUIRED.filter((key) => !process.env[key]);
    return {
      provider: this.name,
      configured: missingEnvironment.length === 0,
      liveMoneyEnabled: false,
      missingEnvironment,
    };
  }

  async createPayment(
    _input: CreateProviderPaymentInput,
  ): Promise<CreateProviderPaymentResult> {
    // Guest payment is intentionally still closed here. The next payment pass
    // creates an embedded Checkout Session / PaymentIntent only after the public
    // reservation-hold boundary is opened safely.
    throw new ProviderNotReadyError(this.name);
  }

  async refundPayment(
    _input: RefundProviderPaymentInput,
  ): Promise<{ providerRefundId: string; status: "PENDING" | "SUCCEEDED" }> {
    throw new ProviderNotReadyError(this.name);
  }
}
