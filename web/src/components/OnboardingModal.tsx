"use client";

import { useState } from "react";
import { Sparkles, Scan, Share2, ChevronRight, X } from "lucide-react";

interface OnboardingModalProps {
  onComplete: () => void;
}

const PAGES = [
  {
    icon: Sparkles,
    title: "Welcome to\nHighlight Magic",
    subtitle:
      "Turn your raw videos into share-ready highlights automatically with AI.",
    colors: ["from-purple-600", "to-pink-500"],
  },
  {
    icon: Scan,
    title: "Smart Detection",
    subtitle:
      "Our AI analyzes motion, faces, and scenes to find the best moments — or describe what you want.",
    colors: ["from-blue-500", "to-purple-500"],
  },
  {
    icon: Share2,
    title: "Export & Share",
    subtitle:
      "Get vertical clips optimized for TikTok, Reels, and Shorts with music, filters, and captions.",
    colors: ["from-pink-500", "to-orange-500"],
  },
];

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      setCurrentPage((p) => p + 1);
    } else {
      onComplete();
    }
  };

  const page = PAGES[currentPage];
  const Icon = page.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-8 text-center">
        {/* Skip button */}
        <button
          onClick={onComplete}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-gray-400"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-8 mt-4">
          <div
            className={`w-32 h-32 rounded-full bg-gradient-to-br ${page.colors[0]} ${page.colors[1]} bg-opacity-15 flex items-center justify-center`}
          >
            <div className="w-24 h-24 rounded-full border-2 border-white/20 flex items-center justify-center">
              <Icon className="w-12 h-12 text-white" />
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white whitespace-pre-line mb-3">
          {page.title}
        </h2>

        {/* Subtitle */}
        <p className="text-gray-400 mb-8 px-4">{page.subtitle}</p>

        {/* Page indicators */}
        <div className="flex justify-center gap-2 mb-8">
          {PAGES.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === currentPage
                  ? "w-6 bg-gradient-to-r from-purple-500 to-pink-500"
                  : "w-2 bg-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Action button */}
        <button
          onClick={handleNext}
          className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          {currentPage < PAGES.length - 1 ? (
            <>
              Next <ChevronRight className="w-4 h-4" />
            </>
          ) : (
            "Get Started"
          )}
        </button>
      </div>
    </div>
  );
}
