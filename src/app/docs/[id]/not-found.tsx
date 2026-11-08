import Link from "next/link";

export default function DocumentNotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Document not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        It may have been deleted, or you don&apos;t have access to it.
      </p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium text-blue-700 hover:underline">
        ← Back to documents
      </Link>
    </main>
  );
}
