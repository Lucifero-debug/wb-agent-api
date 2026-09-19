"use client";

import { useActionState } from "react";

import { login, type LoginState } from "../actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-3">
      <label htmlFor="password" className="text-sm font-medium">
        Password
      </label>

      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
      />

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
