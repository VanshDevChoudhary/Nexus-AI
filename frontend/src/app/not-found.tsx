import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-57px)] text-center px-6">
      <p className="text-7xl font-bold text-zinc-700">404</p>
      <p className="text-zinc-400 mt-3 text-lg">
        Nothing here. Maybe it was deleted, or the URL is wrong.
      </p>
      <Link
        href="/"
        className="mt-6 text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        Back to workflows
      </Link>
    </div>
  );
}
