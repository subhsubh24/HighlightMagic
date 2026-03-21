"use client";

import { useState } from "react";
import { Crown, Infinity, Sparkles, Music, Wand2, Camera, Check, X } from "lucide-react";
import { IOS_APP_STORE_URL } from "@/lib/constants";

interface PaywallModalProps {
  onClose: () => void;
  onSubscribe?: (plan: "monthly" | "yearly") => void;
}

const FEATURES = [
  { icon: Infinity, label: "Unlimited exports" },
  { icon: Sparkles, label: "No watermark" },
  { icon: Music, label: "Premium music library" },
  { icon: Wand2, label: "Advanced AI detection" },
  { icon: Camera, label: "Exclusive filters & effects" },
];

const PLANS = [
  {
    id: "yearly" as const,
    name: "Yearly",
    price: "$39.99/yr",
    savings: "Save 33%",
  },
  {
    id: "monthly" as const,
    name: "Monthly",
    price: "$4.99/mo",
    savings: null,
  },
];

export default function PaywallModal({ onClose, onSubscribe }: PaywallModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [isPurchasing, setIsPurchasing] = useState(false);

  const handleSubscribe = async () => {
    setIsPurchasing(true);
    try {
      onSubscribe?.(selectedPlan);
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl overflow-hidden">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-gray-400 z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 space-y-7">
          {/* Header */}
          <div className="text-center">
            <Crown className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
            <h2 className="text-2xl font-bold text-white">Unlock Pro</h2>
            <p className="text-gray-400 mt-2">
              Create unlimited highlights
              <br />
              with premium features
            </p>
          </div>

          {/* Features */}
          <div className="bg-white/5 rounded-xl p-5 space-y-3.5">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3.5">
                <Icon className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span className="text-white flex-1">{label}</span>
                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              </div>
            ))}
          </div>

          {/* Plan selector */}
          <div className="space-y-3">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-colors ${
                  selectedPlan === plan.id
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{plan.name}</span>
                    {plan.savings && (
                      <span className="text-xs font-bold text-white bg-green-500 px-2 py-0.5 rounded-full">
                        {plan.savings}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-gray-400">{plan.price}</span>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedPlan === plan.id
                      ? "border-purple-500 bg-purple-500"
                      : "border-gray-500"
                  }`}
                >
                  {selectedPlan === plan.id && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Subscribe button */}
          <button
            onClick={handleSubscribe}
            disabled={isPurchasing}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPurchasing ? "Processing..." : "Subscribe Now"}
          </button>

          {/* Legal */}
          <div className="text-center space-y-2">
            <p className="text-xs text-gray-500">
              Cancel anytime. Subscription auto-renews.
            </p>
            <p className="text-xs text-gray-500">
              Subscribe via the{" "}
              <a
                href={IOS_APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                iOS app
              </a>{" "}
              for in-app purchase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
