import Link from "next/link";
import { primaryButtonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-slate-600">That page does not exist, or you do not have access to it.</p>
      <Link href="/" className={primaryButtonClass}>
        Go to the home page
      </Link>
    </main>
  );
}
