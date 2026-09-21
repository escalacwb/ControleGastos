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
} from "../lib/investments";
export function InvestmentPortfolio() {
  const { rows, setForm, rpc, refresh } = useData(),
    a = useActions();
  const [selected, setSelected] = useState(null),
    [kind, setKind] = useState("comparison"),
    [period, setPeriod] = useState("all");
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
    if (rows("investments").some((i) => i.quantity && marketTicker(i)))
      updateQuotes();
  }, []);
  const p = portfolioPerformance(
    rows("investments"),
    rows("investment_valuations"),
    rows("investment_transactions"),
    "all",
    today(),
  );
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
      note: "Não movimenta contas. Datas antigas preservam o saldo mais recente.",
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
        <Text style={S.muted}>
          Valor de compra:{" "}
          {money(
            rows("investments").reduce(
              (n, i) => n + Number(i.initial_amount),
              0,
            ),
          )}
        </Text>
        <Text style={S.value}>{money(p.value)}</Text>
        <Text style={S.text}>
          Ganho desde a compra: {money(p.gain)} · {pct(p.percent)}
        </Text>
      </Card>
      <Button onPress={() => a.investment()}>＋ Novo investimento</Button>
      <Button secondary onPress={updateQuotes}>
        Atualizar pela cotação
      </Button>
      {p.items.map((item) => {
        const x = rows("investments").find((i) => i.id === item.id);
        return (
          <Card key={x.id} title={x.name}>
            <Text style={S.muted}>
              {x.institution} · {x.type}
            </Text>
            <Text style={S.text}>
              Compra em {formatDate(x.purchase_date)}: {money(x.initial_amount)}
            </Text>
            <Text style={S.value}>{money(x.current_value)}</Text>
            <Text
              style={[S.text, { color: item.gain < 0 ? "#a83737" : "#205b4e" }]}
            >
              {item.gain < 0 ? "Perda" : "Ganho"}: {money(item.gain)} ·{" "}
              {pct(item.percent)}
            </Text>
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
                Atualizar saldo
              </Button>
              <Button secondary onPress={() => a.movement(x)}>
                Aporte ou resgate
              </Button>
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
                    ["market", "Cotação do papel na bolsa"],
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
                        Cotação de mercado do papel. Pode ter atraso. O ganho
                        acima usa o saldo informado; este gráfico não altera o
                        saldo automaticamente.
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
                        <Button
                          secondary
                          key={v.id}
                          onPress={() => valueForm(i, v)}
                        >
                          {formatDate(v.date)} · {money(v.value)} · corrigir
                        </Button>
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
                            }[t.type]
                          }{" "}
                          · {money(t.amount)}
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
    </>
  );
}
