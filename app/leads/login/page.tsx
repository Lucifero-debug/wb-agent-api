import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth";
import { business } from "@/lib/business";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — leads" };

export default async function LoginPage() {
  if (await isAuthenticated()) {
    redirect("/leads");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">{business.name}</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Enquiries from WhatsApp.
        </p>

        <LoginForm />
      </div>
    </main>
  );
}
