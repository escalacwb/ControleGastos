import React, { useState, useEffect } from "react";
import { View, Text, Alert, TouchableOpacity } from "react-native";
import { useData } from "./context";
import { useActions } from "./actions";
import { Card, Button, S } from "./ui";
import { money, today, formatDate, parseMoney } from "../lib/finance";
import {
  portfolioPerformance,
  portfolioHistory,
  periodStart,
  investmentPeriods,
  refreshInvestmentQuotes,
  quoteRefreshDue,
} from "../lib/investments";
import { supabase } from "../lib/supabase";

export function InvestmentPortfolio() {
  const { rows, setForm, rpc, refresh, workspace } = useData(),
    a = useActions();
  const [period, setPeriod] = useState("all"),
    [busy, setBusy] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState("");
  const hasTickers = rows("investments").some((i) => i.ticker);
  useEffect(() => {
    if (hasTickers && quoteRefreshDue(workspace.owner_id, today())) {
      setQuoteStatus("Consultando cotações…");
      refreshInvestmentQuotes(supabase)
        .then(async (r) => {
          setQuoteStatus(
            `${r.updated || 0} cotações atualizadas. ${r.failures?.length || 0} indisponíveis.`,
          );
          await refresh();
        })
        .catch((e) => setQuoteStatus(e.message));
    }
  }, [hasTickers, workspace?.owner_id]);
  const p = portfolioPerformance(
    rows("investments"),
    rows("investment_valuations"),
    rows("investment_transactions"),
    period,
    today(),
  );
  const series = portfolioHistory(
      rows("investments"),
      rows("investment_valuations"),
      period,
      today(),
    )
      .filter((p) => p.value !== null)
      .slice(-8),
    maximum = Math.max(1, ...series.map((p) => p.value));
  const pct = (n) =>
    n === null
      ? "Histórico insuficiente"
      : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  function valueForm(i, v) {
    setForm({
      title: v ? "Corrigir avaliação" : "Atualizar saldo · " + i.name,
      initial: {
        date: v?.date || today(),
        value: String(v?.value ?? i.current_value),
      },
      fields: [
        {
          name: "date",
          label: "Data da avaliação",
          type: "date",
          required: true,
        },
        {
          name: "value",
          label: "Saldo total nessa data",
          type: "money",
          required: true,
        },
      ],
      note: "Não movimenta contas. Na mesma data, corrige o fechamento. Uma data antiga preserva o saldo mais recente.",
      onSave: async (values) => {
        const value = parseMoney(values.value);
        if (!Number.isFinite(value) || value < 0)
          throw Error("Informe um saldo válido.");
        await rpc("record_investment_valuation", {
          p_investment: i.id,
          p_date: values.date,
          p_value: value,
          p_expected: i.current_value,
        });
      },
    });
  }
  async function quotes() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await refreshInvestmentQuotes(supabase);
      await refresh();
      Alert.alert(
        "Cotações",
        `${r.updated || 0} atualizadas. ${r.failures?.length || 0} indisponíveis.`,
      );
    } catch (e) {
      Alert.alert("Cotações", e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <View style={S.wrap}>
        {investmentPeriods.map(([key, label]) => (
          <Button
            key={key}
            secondary={key !== period}
            onPress={() => setPeriod(key)}
          >
            {label}
          </Button>
        ))}
      </View>
      <Card title="Sua carteira">
        <Text style={S.value}>{money(p.value)}</Text>
        <Text style={S.text}>
          Ganho: {p.gain === null ? "Histórico insuficiente" : money(p.gain)}
        </Text>
        <Text style={S.text}>Rentabilidade estimada: {pct(p.percent)}</Text>
        <Text style={S.muted}>
          Desconta aportes e resgates e inclui proventos. Usa as datas de
          avaliação disponíveis; períodos sem histórico completo não são
          estimados.
        </Text>
      </Card>
      <Button onPress={() => a.investment()}>＋ Novo investimento</Button>
      <Button secondary onPress={quotes}>
        {busy ? "Consultando…" : "Atualizar cotações"}
      </Button>
      <Text style={S.muted}>{quoteStatus}</Text>
      <Card title="Evolução do patrimônio">
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
          {series.map((p) => (
            <TouchableOpacity
              key={p.date}
              accessibilityRole="button"
              accessibilityLabel={`${formatDate(p.date)}: ${money(p.value)}`}
              style={{ flex: 1, alignItems: "center" }}
              onPress={() =>
                Alert.alert(
                  "Carteira · " + formatDate(p.date),
                  `${money(p.value)}\n\n` +
                    p.items
                      .map(
                        (i) =>
                          `${i.name}: ${money(i.value)}\nAvaliado em ${formatDate(i.date)}`,
                      )
                      .join("\n\n"),
                )
              }
            >
              <View
                style={{
                  height: Math.max(3, (p.value / maximum) * 95),
                  backgroundColor: "#205b4e",
                  width: "90%",
                  borderRadius: 4,
                }}
              />
              <Text style={S.muted}>{p.date.slice(5)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={S.muted}>
          Inclui aportes e resgates e mantém o último saldo conhecido. Toque nas
          barras para conferir os valores e as datas.
        </Text>
      </Card>
      {p.items.map((item) => {
        const i = rows("investments").find((i) => i.id === item.id),
          max = Math.max(1, ...item.history.map((v) => Number(v.value)));
        return (
          <Card key={i.id} title={i.name}>
            <Text style={S.value}>{money(i.current_value)}</Text>
            <Text style={S.muted}>
              {i.institution} · {i.type}
              {i.ticker ? ` · ${i.ticker} · ${i.quantity} cotas` : ""}
            </Text>
            <Text style={S.text}>
              Ganho:{" "}
              {item.gain === null
                ? "Histórico insuficiente"
                : money(item.gain) + " · " + pct(item.percent)}
            </Text>
            <Text style={S.muted}>
              {item.base ? `${formatDate(item.base.date)} a ` : ""}
              {item.last ? formatDate(item.last.date) : "Sem avaliação"}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 4,
                marginVertical: 12,
              }}
            >
              {item.history
                .filter((v) => v.date >= periodStart(period, today()))
                .slice(-8)
                .map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatDate(v.date)}: ${money(v.value)}. Detalhar avaliação`}
                    style={{ flex: 1, alignItems: "center" }}
                    onPress={() =>
                      Alert.alert(
                        formatDate(v.date),
                        `${money(v.value)}\n${v.source === "quote" ? "Cotação de mercado" : "Saldo registrado"}${v.price ? "\n" + v.quantity + " cotas × " + money(v.price) : ""}`,
                        [
                          { text: "Fechar" },
                          { text: "Corrigir", onPress: () => valueForm(i, v) },
                        ],
                      )
                    }
                  >
                    <View
                      style={{
                        height: Math.max(3, (Number(v.value) / max) * 75),
                        width: "90%",
                        backgroundColor: "#205b4e",
                        borderRadius: 4,
                      }}
                    />
                    <Text style={S.muted}>{v.date.slice(5)}</Text>
                  </TouchableOpacity>
                ))}
            </View>
            <View style={S.wrap}>
              <Button onPress={() => valueForm(i)}>Atualizar saldo</Button>
              <Button secondary onPress={() => a.movement(i)}>
                Aporte ou resgate
              </Button>
              <Button secondary onPress={() => a.investment(i)}>
                Editar cadastro
              </Button>
            </View>
            <Text style={S.text}>Histórico de avaliações</Text>
            {[...item.history].reverse().map((v) => (
              <Button secondary key={v.id} onPress={() => valueForm(i, v)}>
                {formatDate(v.date)} · {money(v.value)} · corrigir
              </Button>
            ))}
            <Text style={S.text}>Movimentações</Text>
            {rows("investment_transactions")
              .filter((t) => t.investment_id === i.id)
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((t) => (
                <Text key={t.id} style={S.muted}>
                  {formatDate(t.date)} ·{" "}
                  {
                    {
                      contribution: "Aporte",
                      withdrawal: "Resgate",
                      yield: "Rendimento",
                      dividend: "Provento",
                    }[t.type]
                  }{" "}
                  · {money(t.amount)}
                </Text>
              ))}
          </Card>
        );
      })}
    </>
  );
}
