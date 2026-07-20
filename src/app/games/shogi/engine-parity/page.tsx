import { notFound } from "next/navigation";

import { ShogiEngineParityHarness } from "@/components/game/ShogiImproved/ShogiEngineParityHarness";
import {
  isExactShogiEngineParityQuery,
  type ShogiEngineParitySearchParams,
} from "@/components/game/ShogiImproved/shogiEngineParityProtocol";

export default async function ShogiEngineParityPage({
  searchParams,
}: {
  searchParams: Promise<ShogiEngineParitySearchParams>;
}) {
  if (!isExactShogiEngineParityQuery(await searchParams)) {
    notFound();
  }
  return <ShogiEngineParityHarness />;
}
