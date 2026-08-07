// Stub payment "provider" for Premium Checkout — deliberately NOT wired to
// Stripe or Moneroo yet (user decision: build the checkout UI against a
// fake provider now, wire a real charge later). Loosely mirrors the shape
// of `ChargeResult` from provider.ts so the swap to a real adapter later
// only touches the checkout route, not the UI or the Order/Subscription
// models.
//
// Unlike a real hosted-checkout provider, this never actually charges
// anything and never calls back via webhook — the pending page's
// "simulate-payment" action (POST /api/subscriptions/orders/[id]/simulate-payment)
// is the stand-in for what a real Stripe/Moneroo webhook would do. Delete
// that route and replace this module with a real adapter when the time comes.
import 'server-only';
import { randomUUID } from 'node:crypto';

export interface StubChargeResult {
  providerChargeId: string;
  paymentUrl: string;
  status: 'PENDING';
}

export function createStubCharge(publicUrl: string, orderId: string): StubChargeResult {
  return {
    providerChargeId: `stub_${randomUUID()}`,
    paymentUrl: `${publicUrl}/app/premium/pending?orderId=${orderId}`,
    status: 'PENDING',
  };
}
