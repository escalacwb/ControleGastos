import React, { useState, useEffect } from "react";
import { View, Text, Modal, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { WebView } from "react-native-webview";
import { useData } from "./context";
import { useActions } from "./actions";
import { Card, Button, S } from "./ui";
import { money, today, formatDate, parseMoney } from "../lib/finance";
import {
  portfolioPerformance,
  investmentPerformance,
  investmentChart,
  investmentPeriods,
  marketTicker,
  marketLineHTML,
  marketRange,
  investmentGroupHistory,
  investmentGroupNames,
  periodStart,
} from "../lib/investments";
export function InvestmentPortfolio() {
  const { rows, setForm, rpc, refresh } = useData(),
    a = useActions();
  const [selected, setSelected] = useState(null),
    [kind, setKind] = useState("comparison"),
    [period, setPeriod] = useState("all");
  const [groupSelected, setGroupSelected] = useState(null);
  const [groupPeriod, setGroupPeriod] = useState("all");
  const [marketHTML, setMarketHTML] = useState("<p>Consultando o mercado…</p>");
  useEffect(() => {
    let active = true;
    if (selected && kind === "market") {
      setMarketHTML("<p>Consultando o mercado…</p>");
      rpc("get_investment_market", {
        p_investment: selected,
        p_range: marketRange(period),
      })
        .then((q) => {
          if (active)
            setMarketHTML(
              marketLineHTML(
                q,
                rows("investments").find((i) => i.id === selected),
              ),
            );
        })
        .catch(() => {
          if (active)
            setMarketHTML(
              "<p>Consulta temporariamente indisponível. Tente novamente.</p>",
            );
        });
    }
    return () => {
      active = false;
    };
  }, [selected, kind, period]);
  const updateQuotes = async () => {
    try {
      const r = await rpc("refresh_market_investments", {});
      await refresh();
      Alert.alert(
        "Cotações",
        `${r.updated} posições atualizadas. ${r.failures.map((f) => f.name + ": " + f.reason).join("\n")}`,
      );
    } catch (e) {
      Alert.alert("Cotações", e.message);
    }
  };
  useEffect(() => {
    if (rows("investments").some((i) => i.quantity && (i.quote_mode === "treasury" || marketTicker(i))))
      updateQuotes();
  }, []);
  const p = portfolioPerformance(
    rows("investments"),
    rows("investment_valuations"),
    rows("investment_transactions"),
    "all",
    today(),
  );
  const groups = Object.entries(investmentGroupNames)
    .map(([key, name]) => ({ key, name, points: investmentGroupHistory(rows("investments"), rows("investment_valuations"), rows("investment_transactions"), key, today()) }))
    .filter((group) => group.points.length);
  const activeCost = groups.reduce((total, group) => total + group.points.at(-1).activeCost, 0);
  const received = groups.reduce((total, group) => total + group.points.at(-1).received, 0);
  const selectedGroup = groups.find((group) => group.key === groupSelected);
  const groupPoints = selectedGroup?.points.filter((point) => point.date >= periodStart(groupPeriod, today())) || [];
  const chartValues = groupPoints.map((point) => point.percent ?? 0);
  const chartMin = Math.min(0, ...chartValues), chartMax = Math.max(0, ...chartValues), chartSpan = Math.max(1, chartMax - chartMin);
  const chartX = (index) => 35 + (groupPoints.length === 1 ? 285 : index * 570 / (groupPoints.length - 1));
  const chartY = (value) => 205 - (value - chartMin) / chartSpan * 165;
  const chartPath = groupPoints.map((point, index) => `${index ? "L" : "M"}${chartX(index).toFixed(1)} ${chartY(point.percent ?? 0).toFixed(1)}`).join(" ");
  const chartHTML = `<html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;background:#f7f8f4"><svg viewBox="0 0 640 240" style="width:100%;height:100%"><line x1="35" y1="${chartY(0)}" x2="605" y2="${chartY(0)}" stroke="#a7b5ab" stroke-dasharray="4 4"/><path d="${chartPath}" fill="none" stroke="#205b4e" stroke-width="3"/>${groupPoints.map((point, index) => `<circle cx="${chartX(index)}" cy="${chartY(point.percent ?? 0)}" r="5" fill="#205b4e"/>`).join("")}</svg></body></html>`;
  const pct = (n) =>
    n === null
      ? "—"
      : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  function valueForm(i, v) {
    setSelected(null);
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
      note: v ? "A correção altera esta avaliação, inclusive sua data, sem criar outro registro. Não movimenta contas." : "Não movimenta contas. Datas antigas preservam o saldo mais recente.",
      onSave: async (values) => {
        const value = parseMoney(values.value);
        if (!Number.isFinite(value) || value < 0)
          throw Error("Informe um saldo válido.");
        await rpc(v ? "revise_investment_valuation" : "record_investment_valuation", {
          [v ? "p_valuation" : "p_investment"]: v ? v.id : i.id,
          p_date: values.date,
          p_value: value,
          p_expected: i.current_value,
        });
      },
    });
  }
  const i = rows("investments").find((i) => i.id === selected),
    r = i
      ? investmentPerformance(
          i,
          rows("investment_valuations"),
          rows("investment_transactions"),
          "all",
          today(),
        )
      : null;
  const points = i
      ? investmentChart(
          i,
          rows("investment_valuations"),
          rows("investment_transactions"),
          kind,
          period,
          today(),
        )
      : [],
    max = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  return (
    <>
      <Card title="Sua carteira">
        <Text style={S.muted}>Capital ainda aplicado: {money(activeCost)}</Text>
        <Text style={S.value}>Valor atual: {money(p.value)}</Text>
        <Text style={S.text}>
          Ganho acumulado: {money(p.gain)} · {pct(p.percent)}
        </Text>
        <Text style={S.text}>Já recebido: {money(received)} · ganho realizado em vendas: {money(p.items.reduce((n, x) => n + (x.realizedGain || 0), 0))}</Text>
        <Text style={S.muted}>O capital ativo desconta o custo dos ativos vendidos. O ganho inclui os valores já recebidos.</Text>
      </Card>
      <Text style={[S.text, { fontWeight: "700" }]}>Carteira por tipo</Text>
      {groups.map((group) => { const last = group.points.at(-1); return (
        <Card key={group.key} title={group.name}>
          <Text style={S.value}>{money(last.current)}</Text>
          <Text style={S.text}>Capital ativo: {money(last.activeCost)}</Text>
          <Text style={S.text}>Ganho acumulado: {money(last.gain)} · {pct(last.percent)}</Text>
          <Text style={S.muted}>Já recebido: {money(last.received)}</Text>
          <Button secondary onPress={() => { setGroupSelected(group.key); setGroupPeriod("all"); }}>Ver evolução</Button>
        </Card>
      ); })}
      <Button onPress={() => a.investment()}>＋ Novo investimento</Button>
      <Button secondary onPress={updateQuotes}>
        Atualizar pela cotação
      </Button>
      {p.items.map((item) => {
        const x = rows("investments").find((i) => i.id === item.id);
        const sales = rows("investment_transactions").filter((t) => t.investment_id === x.id && t.type === "sale");
        const saleReceived = sales.reduce((total, sale) => total + Number(sale.amount || 0), 0);
        const saleCost = sales.reduce((total, sale) => total + Number(sale.cost_basis || 0), 0);
        const mode = x.quote_mode || (x.type === "stocks" ? "stock" : "manual");
        const last = rows("investment_valuations").filter(v => v.investment_id === x.id).sort((a,b) => a.date.localeCompare(b.date)).at(-1);
        const source = last?.source === "quote" ? "Cotação de " + formatDate(last.date) : "Último saldo informado";
        const pricing = Number(x.quantity) === 0 && x.quantity !== null ? "Posição encerrada · histórico preservado" : mode === "stock"
          ? (Number(x.quantity) > 0 ? x.quantity + " papéis · " + source : "Informe a quantidade de papéis em Editar")
          : mode === "treasury"
            ? (Number(x.quantity) > 0 && x.maturity_date && x.treasury_title ? x.quantity + " títulos · " + source : "Informe quantidade e vencimento exato em Editar")
            : "Atualização manual do saldo";
        return (
          <Card key={x.id} title={x.name}>
            <Text style={S.muted}>
              {x.institution} · {x.type}
            </Text>
            <Text style={S.text}>
              Compra em {formatDate(x.purchase_date)}: {money(x.initial_amount)}
            </Text>
            <Text style={S.value}>{money(x.current_value)}</Text>
            <Text style={S.muted}>{pricing}</Text>
            <Text
              style={[S.text, { color: item.gain < 0 ? "#a83737" : "#205b4e" }]}
            >
              {item.gain < 0 ? "Perda" : "Ganho"}: {money(item.gain)} ·{" "}
              {pct(item.percent)}
            </Text>
            {item.realizedGain ? <Text style={S.muted}>Ganho realizado em vendas: {money(item.realizedGain)}</Text> : null}
            {sales.length ? <Text style={S.muted}>Já recebido em vendas: {money(saleReceived)} · custo vendido: {money(saleCost)}</Text> : null}
            <View style={S.wrap}>
              <Button
                onPress={() => {
                  setKind("comparison");
                  setPeriod("all");
                  setSelected(x.id);
                }}
              >
                Ver gráficos
              </Button>
              <Button secondary onPress={() => valueForm(x)}>
                {mode === "manual" ? "Atualizar saldo" : "Corrigir saldo"}
              </Button>
              {mode === "manual" ? (
                <Button secondary onPress={() => a.movement(x)}>
                  Aporte ou resgate
                </Button>
              ) : (
                <>
                  <Button secondary onPress={() => a.trade(x, "buy")}>Comprar</Button>
                  <Button secondary onPress={() => a.trade(x, "sale")}>Vender</Button>
                </>
              )}
              <Button secondary onPress={() => a.investment(x)}>
                Editar
              </Button>
            </View>
          </Card>
        );
      })}
      <Modal
        visible={!!i}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        {i && (
          <View style={S.modalOverlay}>
            <SafeAreaView
              edges={["bottom"]}
              style={[S.modal, { height: "92%" }]}
            >
              <View style={S.modalHeader}>
                <Text style={[S.text, { flex: 1, fontWeight: "700" }]}>
                  Gráficos · {i.name}
                </Text>
                <Button secondary onPress={() => setSelected(null)}>
                  Fechar
                </Button>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Text style={S.text}>
                  Compra: {money(i.initial_amount)} · Atual informado:{" "}
                  {money(i.current_value)}
                </Text>
                <Text style={S.text}>
                  Ganho desde a compra: {money(r.gain)} · {pct(r.percent)}
                </Text>
                <Text style={S.muted}>Gráfico</Text>
                <Picker selectedValue={kind} onValueChange={setKind}>
                  {[
                    ["comparison", "Compra × valor atual"],
                    ["balance", "Evolução do saldo"],
                    ["gain", "Evolução do ganho"],
                    ...(i.quote_mode === "stock" ? [["market", "Cotação do papel na bolsa"]] : []),
                    ["history", "Histórico e movimentações"],
                  ].map(([v, l]) => (
                    <Picker.Item key={v} label={l} value={v} />
                  ))}
                </Picker>
                {["balance", "gain", "market"].includes(kind) && (
                  <Picker selectedValue={period} onValueChange={setPeriod}>
                    {investmentPeriods.map(([v, l]) => (
                      <Picker.Item key={v} value={v} label={l} />
                    ))}
                  </Picker>
                )}
                {kind === "market" ? (
                  marketTicker(i) ? (
                    <>
                      <Text style={S.muted}>
                        Cotação de mercado do papel. Pode ter atraso. O saldo é
                        atualizado pela quantidade cadastrada ao abrir a carteira
                        ou tocar em Atualizar pela cotação.
                      </Text>
                      <WebView
                        key={marketTicker(i)}
                        source={{
                          html: marketHTML,
                          baseUrl:
                            "https://escalacwb.github.io/ControleGastos/",
                        }}
                        style={{ height: 440 }}
                        javaScriptEnabled
                      />
                    </>
                  ) : (
                    <Text style={S.text}>
                      Informe o código do papel (ex.: PETR4) no cadastro para
                      consultar o mercado.
                    </Text>
                  )
                ) : kind === "history" ? (
                  <>
                    {rows("investment_valuations")
                      .filter((v) => v.investment_id === i.id)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((v) => (
                        <View key={v.id} style={{ gap: 6 }}>
                          <Text style={S.muted}>{formatDate(v.date)} · {money(v.value)} · {v.source === "manual" ? "informado" : "automático"}</Text>
                          {v.source === "manual" && <>
                            <Button secondary onPress={() => valueForm(i, v)}>Corrigir data ou valor</Button>
                            <Button secondary onPress={() => Alert.alert(
                              "Excluir avaliação?",
                              "O saldo atual será recalculado pelo histórico restante.",
                              [{ text: "Cancelar", style: "cancel" }, { text: "Excluir", style: "destructive", onPress: async () => {
                                try {
                                  await rpc("delete_investment_valuation", { p_valuation: v.id, p_expected: i.current_value });
                                  await refresh();
                                } catch (e) { Alert.alert("Não foi possível excluir", e.message); }
                              } }],
                            )}>Excluir avaliação</Button>
                          </>}
                        </View>
                      ))}
                    {rows("investment_transactions")
                      .filter((t) => t.investment_id === i.id)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((t) => (
                        <Text key={t.id} style={S.text}>
                          {formatDate(t.date)} ·{" "}
                          {
                            {
                              contribution: "Aporte",
                              withdrawal: "Resgate",
                              yield: "Rendimento",
                              dividend: "Provento",
                              buy: "Compra",
                              sale: "Venda",
                            }[t.type]
                          }{" "}
                          · {t.quantity ? t.quantity + " unidades · " : ""}{money(t.amount)}
                          {t.realized_gain != null ? " · Ganho realizado " + money(t.realized_gain) : ""}
                        </Text>
                      ))}
                  </>
                ) : (
                  <>
                    <ScrollView horizontal>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-end",
                          gap: 18,
                          minHeight: 220,
                        }}
                      >
                        {points.map((v, index) => (
                          <View
                            key={index}
                            style={{ alignItems: "center", width: 115 }}
                          >
                            <Text style={S.text}>{money(v.value)}</Text>
                            <View
                              style={{
                                width: 60,
                                height: Math.max(
                                  3,
                                  (Math.abs(v.value) / max) * 150,
                                ),
                                backgroundColor:
                                  v.value < 0 ? "#a83737" : "#205b4e",
                                borderRadius: 5,
                              }}
                            />
                            <Text style={S.muted}>
                              {kind === "comparison"
                                ? v.label
                                : formatDate(v.date)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                    <Text style={S.muted}>
                      {points.length
                        ? "Somente valores conhecidos. Não inventamos cotações entre as datas registradas."
                        : "Não há saldo registrado neste período."}
                    </Text>
                  </>
                )}
              </ScrollView>
            </SafeAreaView>
          </View>
        )}
      </Modal>
      <Modal visible={!!selectedGroup} transparent animationType="slide" onRequestClose={() => setGroupSelected(null)}>
        {selectedGroup && <View style={S.modalOverlay}>
          <SafeAreaView edges={["bottom"]} style={[S.modal, { height: "88%" }]}>
            <View style={S.modalHeader}>
              <Text style={[S.text, { flex: 1, fontWeight: "700" }]}>Evolução · {selectedGroup.name}</Text>
              <Button secondary onPress={() => setGroupSelected(null)}>Fechar</Button>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <Text style={S.text}>Valor atual: {money(selectedGroup.points.at(-1).current)} · ganho acumulado: {money(selectedGroup.points.at(-1).gain)}</Text>
              <Picker selectedValue={groupPeriod} onValueChange={setGroupPeriod}>
                {investmentPeriods.map(([value, label]) => <Picker.Item key={value} value={value} label={label} />)}
              </Picker>
              {groupPoints.length ? <>
                <WebView source={{ html: chartHTML }} style={{ height: 240, borderRadius: 12 }} scrollEnabled={false} />
                {groupPoints.slice(-8).reverse().map((point) => <Text key={point.date} style={S.text}>
                  {formatDate(point.date)} · {pct(point.percent)} · {money(point.gain)} · saldo {money(point.current)}
                </Text>)}
              </> : <Text style={S.muted}>Sem avaliações ou movimentações neste período.</Text>}
              <Text style={S.muted}>Datas conhecidas apenas. Entre atualizações, usa o último saldo informado ou cotado; vendas e resgates permanecem no ganho.</Text>
            </ScrollView>
          </SafeAreaView>
        </View>}
      </Modal>
    </>
  );
}
