"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { Message } from "@/lib/deals/queries";
import { Composer } from "./Composer";

function formatTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The message thread, live over Supabase Realtime (§9).
 *
 * Realtime respects RLS, so the subscription only ever delivers rows this
 * user's policies already admit — a chat_id guessed from elsewhere yields
 * nothing. Rows also arrive already masked, because masking happens server-side
 * before the INSERT (§6); there is no client-side filtering here and there must
 * not be, since a client-side filter is one devtools call away from bypass.
 */
export function DealRoom({
  chatId,
  initialMessages,
  currentUserId,
  demo = false,
}: {
  chatId: string;
  initialMessages: Message[];
  currentUserId: string;
  /**
   * UI preview mode. Skips the Realtime subscription, which needs Supabase
   * credentials the preview deployment deliberately does not carry, and lets
   * the composer echo locally so the screen is explorable rather than inert.
   */
  demo?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (demo) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`deal-room:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, demo]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <GlassPanel className="flex h-[calc(100vh-16rem)] min-h-96 flex-col overflow-hidden">
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/35">
            No messages yet. Open the conversation below.
          </p>
        ) : (
          messages.map((message) => {
            // sender_id is null for platform-authored messages: the Co-Pilot
            // summary and offers relayed in from email (§5.5), neither of which
            // has a Green Light account behind it.
            const system = message.sender_id === null;
            const mine = !system && message.sender_id === currentUserId;

            return (
              <div
                key={message.id}
                className={`flex ${
                  system ? "justify-center" : mine ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                    system
                      ? "w-full max-w-full border border-white/8 bg-navy-dark/50 text-white/80"
                      : mine
                        ? "bg-brand-green/15 text-white"
                        : "bg-white/6 text-white/90"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {message.message_text}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-white/35">
                      {formatTime(message.created_at)}
                    </span>
                    {system ? (
                      <span className="text-[10px] text-white/35">
                        via Green Light
                      </span>
                    ) : null}
                    {message.is_masked ? (
                      <span
                        className="text-[10px] text-amber-200/70"
                        title="Contact details were removed from this message by platform policy."
                      >
                        filtered
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/8 p-4">
        <Composer
          chatId={chatId}
          demo={demo}
          onDemoSend={(text) =>
            setMessages((prev) => [
              ...prev,
              {
                id: `demo-${prev.length}`,
                chat_id: chatId,
                sender_id: currentUserId,
                message_text: text,
                is_masked: false,
                relayed_at: null,
                relay_error: null,
                created_at: new Date().toISOString(),
              },
            ])
          }
        />
      </div>
    </GlassPanel>
  );
}
