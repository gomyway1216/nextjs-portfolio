import { notFound } from "next/navigation";

import { ShogiEngineParityHarness } from "@/components/game/ShogiImproved/ShogiEngineParityHarness";
import { isExactShogiEngineParityQuery } from "@/components/game/ShogiImproved/shogiEngineParityProtocol";

export default async function ShogiEngineParityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isExactShogiEngineParityQuery(await searchParams)) {
    notFound();
  }
  return <ShogiEngineParityHarness />;
}
