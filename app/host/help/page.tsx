import { DashboardShell } from "@/components/DashboardShell";
import { HostHelpCenter } from "@/components/HostHelpCenter";
import { InsuranceResourceNote } from "@/components/InsuranceResourceNote";

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
      <InsuranceResourceNote provider="proper" placement="host_help" />
    </DashboardShell>
  );
}
