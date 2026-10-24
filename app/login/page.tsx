import { Button, Card } from "../../components/ui";
import { login } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ wrong?: string }> }) {
  const { wrong } = await searchParams;
  return (
    <div className="mx-auto mt-12 max-w-xs">
      <Card title="Sign in">
        <form action={login} className="flex flex-col gap-3">
          <input name="password" type="password" autoComplete="current-password" placeholder="Password" required autoFocus aria-label="Password" />
          {wrong && <p className="text-sm text-amber-600">Wrong password</p>}
          <Button>Sign in</Button>
        </form>
      </Card>
    </div>
  );
}
