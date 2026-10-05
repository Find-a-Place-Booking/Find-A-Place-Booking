import { DashboardShell } from "@/components/DashboardShell";
import { HostHelpCenter } from "@/components/HostHelpCenter";

export default async function HostHelpPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const params = await searchParams;

  return (
    <DashboardShell
      active="Help & FAQ"
      title="Host help & FAQ"
      eyebrow="Host support"
    >
      <HostHelpCenter initialTopic={params.topic || null} />
    </DashboardShell>
  );
}
