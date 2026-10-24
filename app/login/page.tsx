import { redirect } from "next/navigation";
import { Card } from "../../components/ui";
import { authOff, hasPassword } from "../../lib/auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ wrong?: string; locked?: string }> }) {
  if (authOff()) redirect("/");
  const { wrong, locked } = await searchParams;
  if (!(await hasPassword())) {
    return (
      <div className="mx-auto mt-12 max-w-sm">
        <Card title="Set a password">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Set <code>APP_PASSWORD</code> on the server, then reload. You can change it later in Settings.
          </p>
        </Card>
      </div>
    );
  }
  return (
    <div className="mx-auto mt-12 max-w-xs">
      <Card title="Sign in">
        <form action="/auth/login" method="post" className="flex flex-col gap-3">
          <input name="password" type="password" autoComplete="current-password" placeholder="Password" required autoFocus aria-label="Password" />
          {wrong && <p className="text-sm text-amber-600">Wrong password</p>}
          {locked && <p className="text-sm text-amber-600">Too many tries. Wait 15 minutes.</p>}
          <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Sign in</button>
        </form>
      </Card>
    </div>
  );
}
