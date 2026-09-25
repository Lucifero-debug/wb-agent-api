"use client";

// app/leads/chat/[waId]/reply-form.tsx
//
// A client component for one reason: text typed here must survive the
// page's auto-refresh, and must come back if WhatsApp rejects the send.

import { useActionState } from "react";

import { sendStaffReply, type ReplyState } from "../../actions";

const initialState: ReplyState = { error: null, body: "", attempt: 0 };

export function ReplyForm({
  waId,
  paused,
  pauseHours,
}: {
  waId: string;
  paused: boolean;
  pauseHours: number;
}) {
  const [state, formAction, pending] = useActionState(sendStaffReply, initialState);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="waId" value={waId} />

      {/* React resets a form after its action runs. Keying the textarea
          on the attempt count remounts it with defaultValue = whatever the
          action handed back: empty after a send, the original text after
          a failure. */}
      <textarea
        key={state.attempt}
        name="body"
        rows={3}
        defaultValue={state.body}
        placeholder="Reply as the clinic…"
        className="resize-y rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
      />

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-black/50 dark:text-white/50">
          {paused
            ? "Sent from the clinic's WhatsApp number."
            : `Sending pauses the bot for this customer for ${pauseHours} hours.`}
        </p>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
