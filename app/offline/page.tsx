import { OfflineState } from "@/components/app-states";
export default function Offline() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-md">
        <OfflineState />
        <a
          href="/"
          className="mt-6 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white"
        >
          Retry connection
        </a>
      </div>
    </div>
  );
}
