"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { motion } from "framer-motion";
import { Lock, Mail, Eye, EyeOff, ArrowRight } from "lucide-react";
import { login } from "@/lib/api/presentations";
import { setToken } from "@/store/authSlice";
import { Button, Input } from "@/lib/ui";
import { ArtifyMark } from "@/components/brand/Logo";

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useDispatch();

  // Standard login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await login(email, password);
      dispatch(setToken(data.access_token));
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px]"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <ArtifyMark size={48} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Welcome back</h1>
          <p className="text-muted mt-1.5 text-sm">Sign in to GenStudio to keep building.</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-line bg-surface shadow-e3 p-7">
          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-md p-3 mb-5 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-10"
                  placeholder="you@example.com"
                  required
                />
              </Field>

              <Field label="Password">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <Input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 pr-11"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition-colors"
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </Field>

              <Button type="submit" loading={loading} size="lg" className="w-full mt-1">
                {loading ? "Signing in…" : <>Sign in <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </form>


          <p className="text-muted text-sm text-center mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-brand hover:text-brand-hover font-medium transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted mb-1.5 block">{label}</label>
      <div className="relative">{children}</div>
    </div>
  );
}
