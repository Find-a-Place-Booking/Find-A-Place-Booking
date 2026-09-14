import type { PaymentProviderAdapter, PaymentProviderName, ProviderReadiness } from "./provider";
import { SquarePaymentProvider } from "./square";
import { StripePaymentProvider } from "./stripe";

const providers: Record<PaymentProviderName, PaymentProviderAdapter> = {
  STRIPE: new StripePaymentProvider(),
  SQUARE: new SquarePaymentProvider(),
};

export function getPaymentProvider(provider: PaymentProviderName) {
  return providers[provider];
}

export function getPaymentProviderReadiness(): ProviderReadiness[] {
  return [providers.STRIPE.readiness(), providers.SQUARE.readiness()];
}
