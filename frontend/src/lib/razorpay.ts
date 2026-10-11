// Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
// Loaded only when the API is in razorpay payment mode.
export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccess) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
}

interface RazorpayCheckout {
  open(): void;
  on(event: "payment.failed", callback: (response: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayCheckout;
  }
}

let loading: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        reject(new Error("Could not load Razorpay. Check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export async function openRazorpayCheckout(options: RazorpayOptions, onFailed: (message: string) => void) {
  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error("Razorpay did not load");
  const checkout = new window.Razorpay(options);
  checkout.on("payment.failed", (response) => onFailed(response.error?.description ?? "The payment failed."));
  checkout.open();
}
