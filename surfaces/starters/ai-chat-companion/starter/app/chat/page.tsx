"use client";

import { useState } from "react";
import { capture, EVENTS } from "@/lib/analytics/posthog-client";
import { strings } from "@/lib/strings";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Minimal streaming chat loop (prompt 03 replaces this with the full core
// loop: conversation persistence, history sidebar, regenerate, personas).
export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!input.trim() || busy) {
      return;
    }
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    if (messages.length === 0) {
      capture(EVENTS.conversation_started);
    }
    capture(EVENTS.chat_message_sent);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextMessages }),
    });
    if (!response.ok || !response.body) {
      setMessages([...nextMessages, { role: "assistant", content: strings.chat.error }]);
      setBusy(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = "";
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      assistantText += decoder.decode(value, { stream: true });
      setMessages([...nextMessages, { role: "assistant", content: assistantText }]);
    }
    capture(EVENTS.chat_response_completed);
    setBusy(false);
  }

  return (
    <main>
      <h1>{strings.chat.title}</h1>
      <ul>
        {messages.map((message, index) => (
          <li key={index}>
            <strong>{message.role === "user" ? strings.chat.you : strings.chat.companion}:</strong> {message.content}
          </li>
        ))}
      </ul>
      <form onSubmit={send}>
        <input value={input} onChange={(changeEvent) => setInput(changeEvent.target.value)} placeholder={strings.chat.placeholder} />
        <button type="submit" disabled={busy}>
          {strings.chat.send}
        </button>
      </form>
    </main>
  );
}
