import type { StatsResponse } from "@tpv/shared";

const DEFAULT_FROM_OFFSET_DAYS = 6;

function getDefaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - DEFAULT_FROM_OFFSET_DAYS);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  };
}

export async function fetchStats(range = getDefaultRange()): Promise<StatsResponse> {
  const params = new URLSearchParams(range);
  const response = await fetch(`http://localhost:3001/api/stats?${params.toString()}`);

  if (!response.ok) {
    throw new Error("No se pudieron cargar las estadisticas");
  }

  return (await response.json()) as StatsResponse;
}
