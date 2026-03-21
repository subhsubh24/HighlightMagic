"use client";

import { useApp } from "@/lib/store";
import { FREE_EXPORT_LIMIT, EXPORT_WIDTH, EXPORT_HEIGHT, EXPORT_FRAME_RATE, IOS_APP_STORE_URL } from "@/lib/constants";
import Link from "next/link";
import { Settings, User, Film, Key, Wifi, MonitorSmartphone, Info, Trash2, ChevronLeft, Crown, ExternalLink } from "lucide-react";

export default function SettingsPage() {
  const { state } = useApp();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
        <Link href="/" className="p-2 -ml-2 rounded-lg hover:bg-white/5">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Settings className="w-5 h-5 text-purple-400" />
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Account Section */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Account</h2>
          <div className="space-y-1 bg-white/5 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-400" />
                <span>Plan</span>
              </div>
              <span className={state.isProUser ? "text-green-400" : "text-gray-400"}>
                {state.isProUser ? "Pro" : "Free"}
              </span>
            </div>

            {!state.isProUser && (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <Film className="w-4 h-4 text-gray-400" />
                    <span>Exports This Month</span>
                  </div>
                  <span className="text-gray-400">{state.exportsUsed}/{FREE_EXPORT_LIMIT}</span>
                </div>

                <button className="flex items-center gap-3 px-4 py-3 border-t border-white/5 w-full hover:bg-white/5 text-purple-400">
                  <Crown className="w-4 h-4" />
                  <span>Upgrade to Pro</span>
                </button>
              </>
            )}
          </div>
        </section>

        {/* Export Settings */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Export Settings</h2>
          <div className="space-y-1 bg-white/5 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <MonitorSmartphone className="w-4 h-4 text-gray-400" />
                <span>Resolution</span>
              </div>
              <span className="text-gray-400">{EXPORT_WIDTH} x {EXPORT_HEIGHT}</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <span className="ml-7">Format</span>
              <span className="text-gray-400">MP4</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <span className="ml-7">Frame Rate</span>
              <span className="text-gray-400">{EXPORT_FRAME_RATE} fps</span>
            </div>
          </div>
        </section>

        {/* AI Settings */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">AI Settings</h2>
          <div className="space-y-1 bg-white/5 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Key className="w-4 h-4 text-gray-400" />
                <span>Claude API Key</span>
              </div>
              <span className="text-gray-400 text-sm">Configured via env</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <div className="flex items-center gap-3">
                <Wifi className="w-4 h-4 text-gray-400" />
                <span>Network</span>
              </div>
              <span className="text-green-400 text-sm">Connected</span>
            </div>
          </div>
        </section>

        {/* About */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">About</h2>
          <div className="space-y-1 bg-white/5 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Info className="w-4 h-4 text-gray-400" />
                <span>Version</span>
              </div>
              <span className="text-gray-400">1.0.0</span>
            </div>

            <Link
              href="/privacy"
              className="flex items-center justify-between px-4 py-3 border-t border-white/5 hover:bg-white/5"
            >
              <span className="ml-7">Privacy Policy</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </Link>

            <a
              href={IOS_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 border-t border-white/5 hover:bg-white/5"
            >
              <span className="ml-7">Get the iOS App</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </a>
          </div>
        </section>

        {/* Data */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Data</h2>
          <div className="bg-white/5 rounded-xl overflow-hidden">
            <button className="flex items-center gap-3 px-4 py-3 w-full hover:bg-white/5 text-red-400">
              <Trash2 className="w-4 h-4" />
              <span>Clear All Data</span>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2 px-1">
            This will clear all cached data and reset the app.
          </p>
        </section>
      </div>
    </div>
  );
}
