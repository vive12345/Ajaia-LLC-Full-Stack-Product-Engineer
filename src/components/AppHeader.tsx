import Link from "next/link";
import { FileText } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";

export function AppHeader({ userName }: { userName: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <FileText className="h-5 w-5 text-blue-600" /> Ajaia Docs
        </Link>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="hidden sm:inline">
            Signed in as <strong className="text-slate-900">{userName}</strong>
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
