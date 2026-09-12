import { Workspace } from "@/components/Workspace";
import { mode } from "@/lib/server";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Workspace initialMode={mode()} />;
}
