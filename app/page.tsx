"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useEffect, useRef } from "react";
import { ToolVisual } from "./components/ToolVisual";

interface ToolPart {
  type: string;
  state?: string;
  output?: unknown;
  text?: string;
  data?: { id?: string; name?: string; score?: number; tool?: string };
}

export default function Home() {
  const { messages, status, sendMessage, error } = useChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const isReady = status === "ready" || status === "error";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isReady) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <main className="flex flex-col h-screen max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Open Data Summit demo:</strong> this instance is running in demo
        mode for the Toronto Open Data Summit. Answers may use cached City of
        Toronto data.
      </div>
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-blue-700">Ask Toronto</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ask questions about crime, transit, parks, permits, cycling, and
          restaurants.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-16">
            <p className="text-lg">Try asking:</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                &ldquo;Which neighbourhood had the most break-ins in
                2024?&rdquo;
              </li>
              <li>
                &ldquo;What are the top TTC delay causes this year?&rdquo;
              </li>
              <li>&ldquo;Find splash pads near Scarborough&rdquo;</li>
            </ul>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                m.role === "user"
                  ? "max-w-prose bg-blue-600 text-white"
                  : "w-full max-w-full border border-gray-200 bg-white text-gray-800 shadow-sm"
              }`}
            >
              {m.parts.map((rawPart, i) => {
                const part = rawPart as ToolPart;
                if (part.type === "text") {
                  return (
                    <p key={i} className="whitespace-pre-wrap">
                      {part.text}
                    </p>
                  );
                }
                // RAG routing decision → confidence badge (#3).
                if (part.type === "data-routing" && part.data?.name) {
                  return (
                    <div
                      key={i}
                      className="mb-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                    >
                      <span>Matched: {part.data.name}</span>
                      {typeof part.data.score === "number" && (
                        <span className="text-blue-400">
                          · {part.data.score.toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                }
                // Static tool parts look like "tool-getCrimeData".
                if (
                  part.type.startsWith("tool-") &&
                  part.state === "output-available" &&
                  part.output !== undefined
                ) {
                  return (
                    <ToolVisual
                      key={i}
                      toolName={part.type.slice("tool-".length)}
                      output={part.output}
                    />
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {(status === "submitted" || status === "streaming") && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
              <span className="text-sm text-gray-400 animate-pulse">
                Thinking…
              </span>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex justify-start">
            <div className="max-w-prose rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error &&
              /quota|rate.?limit|exceeded|429|too large|tokens per minute|tpm/i.test(
                error.message,
              ) ? (
                <>
                  <span className="font-medium">Rate limit reached.</span> The
                  free AI tier limits how many requests you can make in a short
                  window. Wait about a minute, then try again.
                </>
              ) : (
                <>
                  <span className="font-medium">Something went wrong.</span>{" "}
                  {error?.message ?? "Please try asking again."}
                </>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 pt-2 border-t border-gray-200"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Toronto open data…"
          disabled={!isReady}
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isReady || input.trim() === ""}
          className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Send
        </button>
      </form>
    </main>
  );
}
