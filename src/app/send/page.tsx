import { listDrops } from '@/lib/drops/queries';
import { SendFilesForm } from '@/components/drops/SendFilesForm';
import { RecentTransfers } from '@/components/drops/RecentTransfers';

// Forced dynamic for the same reason as /gallery: no dynamic segment, so Next
// would otherwise prerender it at build time and run the query against
// build-time env rather than the request.
export const dynamic = 'force-dynamic';

export default async function SendFilesPage() {
  const drops = await listDrops();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="border-b border-stone pb-6">
        <h1 className="text-[28px] font-semibold text-ink">Send Files</h1>
        <p className="mt-1 text-[13px] text-ink">
          Any file, any size. Recipients get a link — no account, nothing to install.
        </p>
      </div>

      <div className="mt-8">
        <SendFilesForm />
      </div>

      {drops.length > 0 && (
        <div className="mt-12">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink">Recent transfers</h2>
          <RecentTransfers drops={drops} />
        </div>
      )}
    </div>
  );
}
