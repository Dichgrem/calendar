import { useState } from "react";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("登录失败");
      window.location.href = "/calendar";
    } catch {
      setError("邮箱或密码错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-neutral-50 dark:bg-neutral-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-6 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-4"
      >
        <h1 className="text-xl font-bold">登录</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 rounded px-3 py-2">
            {error}
          </p>
        )}

        <label className="block">
          <span className="text-sm font-medium">邮箱</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700"
            required
          />
        </label>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "登录中..." : "登录"}
        </Button>
      </form>
    </div>
  );
}
