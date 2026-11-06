import EmailSignIn from "@/components/EmailSignIn";
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="page" style={{ maxWidth: 520 }}><h1>Sign in to Stakeout</h1><p>One secure link. No password to remember.</p>{error && <p className="error" role="alert">This link has expired or was already used. Request a new one below.</p>}<EmailSignIn /><p className="muted small">New here? Your account is created after you verify your email. Accounts start with zero credits.</p></main>;
}
