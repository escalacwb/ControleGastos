import { createClient } from "npm:@supabase/supabase-js@2.99.0";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
};
Deno.serve(async (req) => {
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método inválido" }, 405);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      },
    },
  );
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) return reply({ error: "Entre novamente." }, 401);
  const token = Deno.env.get("BRAPI_TOKEN");
  if (!token)
    return reply(
      {
        error:
          "O provedor de cotações ainda não foi configurado. Atualize os saldos manualmente por enquanto.",
      },
      503,
    );
  const { data: workspace, error: we } = await client.rpc(
    "get_finance_workspace",
  );
  if (we || !workspace?.owner_id)
    return reply({ error: "Espaço financeiro indisponível." }, 403);
  const { data: items, error } = await client
    .from("investments")
    .select("*")
    .eq("user_id", workspace.owner_id)
    .not("ticker", "is", null);
  if (error)
    return reply({ error: "Não foi possível consultar a carteira." }, 500);
  let updated = 0;
  const failures: string[] = [];
  for (const i of items || []) {
    if (
      !/^[A-Z]{4}\d{1,2}$/.test(i.ticker) ||
      !(Number(i.quantity) >= 0) ||
      i.quantity === null
    ) {
      failures.push(i.name);
      continue;
    }
    try {
      const r = await fetch(
        "https://brapi.dev/api/quote/" + encodeURIComponent(i.ticker),
        {
          headers: { Authorization: "Bearer " + token },
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!r.ok) throw Error("Provider");
      const q = (await r.json()).results?.find(
        (q: any) => q.symbol === i.ticker,
      );
      const price = Number(q?.regularMarketPrice),
        timestamp = new Date(q?.regularMarketTime);
      if (
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isFinite(timestamp.getTime()) ||
        q.currency !== "BRL" ||
        timestamp.getTime() > Date.now() + 300000
      )
        throw Error("Invalid quote");
      const date = timestamp.toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      });
      const { data: latest, error: historyError } = await client
        .from("investment_valuations")
        .select("date")
        .eq("investment_id", i.id)
        .order("date", { ascending: false })
        .limit(1);
      if (historyError || (latest?.[0] && latest[0].date > date))
        throw Error("Stale quote");
      const { error: saveError } = await client.rpc(
        "record_investment_valuation",
        {
          p_investment: i.id,
          p_date: date,
          p_value: Math.round(price * Number(i.quantity) * 100) / 100,
          p_expected: i.current_value,
          p_price: price,
          p_quantity: Number(i.quantity),
          p_quoted_at: timestamp.toISOString(),
        },
      );
      if (saveError) throw Error("Save");
      updated++;
    } catch {
      failures.push(i.name);
    }
  }
  return reply({ updated, failures });
});
