import { Suspense } from "react";
import { SearchResultsClient } from "./_components/ResultsClient";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  return (
    <Suspense>
      <SearchResultsClient initialQuery={q} />
    </Suspense>
  );
}
