import React, { useState, useRef } from "react";
import { Modal, ScrollView, View, Text, Alert, Switch } from "react-native";
import { WebView } from "react-native-webview";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import * as Sharing from "expo-sharing";
import { S, Button, FormField } from "./ui";
import { useData } from "./context";
import { supabase } from "../lib/supabase";
import {
  money,
  cents,
  parseMoney,
  today,
  normalize,
  monthRange,
  validDate,
} from "../lib/finance";
import { parseStatementCsv, parseStatementPdfLines } from "../lib/statements";
import { pdfHtml } from "../lib/pdf-reader";
export function StatementForm({ form }) {
  const { rows, setForm, rpc, refresh } = useData(),
    { card, cycle, pay, autoImport } = form;
  const [values, setValues] = useState({
    month: cycle?.cycle_start_date.slice(0, 7) || today().slice(0, 7),
    due: cycle?.due_date || today(),
    total: String(cycle?.total_spent || ""),
    mode: pay && !autoImport ? "new" : "none",
    pay_amount: String(
      cycle ? Number(cycle.total_spent) - Number(cycle.total_paid) : "",
    ),
    pay_date: today(),
    pay_account: card.account_id,
    existing_payment_id: "",
  });
  const [parsed, setParsed] = useState(null),
    [document, setDocument] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [difference, setDifference] = useState(false),
    [pdf, setPdf] = useState(null),
    [attachments, setAttachments] = useState([]);
  const [candidates, setCandidates] = useState([]),
    [historyNote, setHistoryNote] = useState(
      "O histórico será conferido antes de registrar qualquer pagamento.",
    ),
    [confirmNew, setConfirmNew] = useState(false);
  React.useEffect(() => {
    let active = true;
    const total = parseMoney(values.total);
    if (!/^\d{4}-\d{2}$/.test(values.month) || !(total > 0)) return;
    setHistoryNote("Conferindo pagamentos anteriores…");
    setConfirmNew(false);
    rpc("statement_payment_candidates", {
      p_card: card.id,
      p_month: values.month + "-01",
      p_total: total,
      p_cycle: cycle?.id || null,
    })
      .then((found) => {
        if (!active) return;
        const available = found.filter((t) => !t.linked_cycle_id);
        setCandidates(available);
        const matches = available.filter((t) => t.close_amount && t.account_id);
        const current =
          cycle ||
          rows("billing_cycles").find(
            (c) =>
              c.credit_card_id === card.id &&
              c.cycle_start_date.slice(0, 7) === values.month,
          );
        if (
          current &&
          Number(current.total_paid) >= Number(current.total_spent)
        ) {
          setValues((v) => ({ ...v, mode: "none" }));
          setHistoryNote(
            "Esta fatura já está paga. O arquivo apenas detalha as compras; não haverá nova saída.",
          );
        } else if (matches.length === 1) {
          setValues((v) => ({
            ...v,
            mode: "existing",
            existing_payment_id: matches[0].id,
          }));
          setHistoryNote(
            "Pagamento encontrado: " +
              matches[0].date +
              " · " +
              money(matches[0].amount) +
              ". Vamos preservar o lançamento original, sem novo débito.",
          );
        } else if (available.length) {
          setValues((v) => ({
            ...v,
            mode: "existing",
            existing_payment_id: "",
          }));
          setHistoryNote(
            "Há pagamentos deste cartão no período. Escolha o correspondente; uma nova saída está bloqueada.",
          );
        } else {
          if (autoImport) setValues((v) => ({ ...v, mode: "none" }));
          setHistoryNote(
            "Nenhum pagamento correspondente encontrado. Salve só os detalhes ou escolha Registrar pagamento agora e confirme a nova saída.",
          );
        }
      })
      .catch(() => {
        if (active)
          setHistoryNote(
            "Não foi possível conferir o histórico. Tente novamente antes de pagar.",
          );
      });
    return () => {
      active = false;
    };
  }, [values.month, values.total]);
  const lock = useRef(false),
    request = useRef(Crypto.randomUUID()),
    pdfTask = useRef(null);
  React.useEffect(() => {
    if (cycle)
      supabase
        .from("statement_documents")
        .select("id,name")
        .eq("billing_cycle_id", cycle.id)
        .then(({ data, error }) => {
          if (error) setError("Não foi possível carregar os anexos.");
          else setAttachments(data || []);
        });
  }, []);
  const categories = rows("categories").filter(
    (c) =>
      c.type === "expense" &&
      !/reembols|pagamento.*fatura/.test(normalize(c.name)),
  );
  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));
  const select = (name, label, options) => ({
    name,
    label,
    type: "select",
    options,
  });
  const opts = (list) => list.map((x) => ({ value: x.id, label: x.name }));
  const fields = [
    { name: "month", label: "Referência (AAAA-MM)", disabled: !!cycle },
    { name: "due", label: "Vencimento", type: "date", disabled: !!cycle },
    {
      name: "total",
      label: "Total da fatura (R$)",
      type: "money",
      disabled: !!cycle,
    },
    select("mode", "Pagamento", [
      { value: "none", label: "Salvar sem novo pagamento" },
      { value: "new", label: "Registrar pagamento agora" },
      { value: "existing", label: "Vincular pagamento já lançado" },
    ]),
  ];
  if (values.mode === "new")
    fields.push(
      { name: "pay_amount", label: "Valor pago", type: "money" },
      { name: "pay_date", label: "Data do pagamento", type: "date" },
      select(
        "pay_account",
        "Conta",
        opts(
          rows("accounts").filter(
            (a) => !["credit", "credit_card"].includes(a.type),
          ),
        ),
      ),
    );
  if (values.mode === "existing")
    fields.push(
      select("existing_payment_id", "Pagamento já lançado", [
        { value: "", label: "Escolher lançamento" },
        ...candidates
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((t) => ({
            value: t.id,
            label: `${t.date} · ${t.description} · ${money(t.amount)}`,
          })),
      ]),
    );
  const read = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "application/octet-stream",
          "application/pdf",
        ],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const file = picked.assets[0];
      if ((file.size || 0) > 5 * 1024 * 1024)
        throw Error("Escolha um arquivo de até 5 MB.");
      setParsed(null);
      setDocument(null);
      setDifference(false);
      const content = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      const decoded = [];
      let bits = 0,
        acc = 0;
      for (const char of content) {
        const n = alphabet.indexOf(char);
        if (n < 0) continue;
        acc = (acc << 6) | n;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          decoded.push((acc >> bits) & 255);
        }
      }
      const hash = await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        new Uint8Array(decoded),
      );
      const sha256 = Array.from(new Uint8Array(hash))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      let result;
      if (/\.pdf$/i.test(file.name)) {
        const lines = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pdfTask.current = null;
            setPdf(null);
            reject(Error("A leitura do PDF demorou demais. Use o CSV."));
          }, 60000);
          pdfTask.current = {
            resolve: (lines) => {
              clearTimeout(timer);
              resolve(lines);
            },
            reject: (e) => {
              clearTimeout(timer);
              reject(e);
            },
          };
          setPdf(content);
        });
        result = parseStatementPdfLines(
          lines,
          Number(values.month.slice(0, 4)),
          categories,
          rows("transactions"),
        );
      } else if (/\.csv$/i.test(file.name)) {
        result = parseStatementCsv(
          await FileSystem.readAsStringAsync(file.uri),
          categories,
          rows("transactions"),
        );
      } else throw Error("Use um arquivo CSV ou PDF.");
      setParsed(result);
      setDocument({
        name: file.name,
        sha256,
        mime: /\.pdf$/i.test(file.name) ? "application/pdf" : "text/csv",
        content_base64: content,
      });
      if (!cycle && !values.total) {
        const due = result.due || file.name.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        setValues((v) => ({
          ...v,
          total: result.total.toFixed(2),
          pay_amount: result.total.toFixed(2),
          ...(due ? { due, month: due.slice(0, 7) } : {}),
        }));
      }
    } catch (e) {
      setError(e.message || "Não foi possível ler a fatura.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  React.useEffect(() => {
    if (autoImport) read();
  }, []);
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      monthRange(values.month);
      if (!validDate(values.due)) throw Error("Confira o vencimento.");
      const total = parseMoney(values.total);
      if (!(total > 0)) throw Error("Informe o total positivo.");
      const items = parsed?.items.filter((x) => x.selected) || [];
      if (document && (!items.length || parsed.invalid.length))
        throw Error(
          "Há linhas não reconhecidas. Use o CSV do banco ou corrija o arquivo.",
        );
      if (
        document &&
        items.reduce((n, x) => n + cents(x.amount), 0) !== cents(total) &&
        !difference
      )
        throw Error("Confira e confirme a diferença entre os itens e o total.");
      if (
        values.mode === "new" &&
        (!(parseMoney(values.pay_amount) > 0) || !validDate(values.pay_date))
      )
        throw Error("Confira valor e data do pagamento.");
      if (values.mode === "existing" && !values.existing_payment_id)
        throw Error("Escolha o pagamento já lançado.");
      const found = await rpc("statement_payment_candidates", {
        p_card: card.id,
        p_month: values.month + "-01",
        p_total: total,
        p_cycle: cycle?.id || null,
      });
      if (values.mode === "new" && found.some((t) => !t.linked_cycle_id))
        throw Error(
          "Pagamento anterior encontrado. Use Vincular pagamento já lançado.",
        );
      if (values.mode === "new" && !confirmNew)
        throw Error("Confirme que este pagamento ainda não foi lançado.");
      const resolvedCycle =
        cycle ||
        rows("billing_cycles").find(
          (c) =>
            c.credit_card_id === card.id &&
            c.cycle_start_date.slice(0, 7) === values.month,
        );
      if (
        resolvedCycle &&
        Math.abs(cents(resolvedCycle.total_spent) - cents(total)) > 5
      )
        throw Error(
          "Já existe uma fatura com outro total. Abra Detalhar / anexar nessa fatura.",
        );
      await rpc("save_statement_bundle", {
        p_data: {
          request_id: request.current,
          card_id: card.id,
          cycle_id: resolvedCycle?.id || null,
          month: values.month + "-01",
          due: values.due,
          total: resolvedCycle ? Number(resolvedCycle.total_spent) : total,
          confirm_new_payment: values.mode === "new" && confirmNew,
          items,
          document,
          existing_payment_id:
            values.mode === "existing" ? values.existing_payment_id : null,
          pay_amount: values.mode === "new" ? parseMoney(values.pay_amount) : 0,
          pay_account: values.pay_account,
          pay_date: values.pay_date,
        },
      });
      setForm(null);
      await refresh();
    } catch (e) {
      setError(e.message || "Não foi possível salvar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const close = () => {
    if (!busy)
      Alert.alert(
        "Fechar fatura?",
        "As alterações não salvas serão descartadas.",
        [
          { text: "Continuar", style: "cancel" },
          { text: "Fechar", onPress: () => setForm(null) },
        ],
      );
  };
  const download = async (id) => {
    try {
      const { data, error } = await supabase
        .from("statement_documents")
        .select("name,mime,content_base64")
        .eq("id", id)
        .single();
      if (error) throw error;
      const uri =
        FileSystem.cacheDirectory +
        "fatura-" +
        id +
        (data.mime === "application/pdf" ? ".pdf" : ".csv");
      await FileSystem.writeAsStringAsync(uri, data.content_base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Sharing.shareAsync(uri, {
        mimeType: data.mime,
        dialogTitle: data.name,
      });
    } catch (e) {
      setError("Não foi possível abrir o anexo.");
    }
  };
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 24, paddingTop: 40, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={S.title}>{card.bank_name} · Fatura</Text>
          <Text style={S.muted}>
            As compras detalham os gastos. Só o pagamento desconta dinheiro da
            conta. Você pode anexar a fatura agora ou depois.
          </Text>
          <Text style={S.muted}>{historyNote}</Text>
          {fields.map((f) => (
            <FormField
              key={f.name}
              field={f}
              value={values[f.name]}
              onChange={(value) => set(f.name, value)}
            />
          ))}
          {values.mode === "new" && (
            <>
              <Text style={S.muted}>
                Confirmo que este pagamento ainda não foi lançado. Criar uma
                nova saída na conta.
              </Text>
              <Switch
                accessibilityLabel="Confirmar novo pagamento"
                value={confirmNew}
                onValueChange={setConfirmNew}
              />
            </>
          )}
          <Button secondary disabled={busy} onPress={read}>
            Anexar CSV ou PDF
          </Button>
          {document && <Text style={S.text}>{document.name}</Text>}
          {parsed && (
            <>
              <Text style={S.text}>
                {parsed.items.filter((x) => x.selected).length} itens ·{" "}
                {money(
                  parsed.items
                    .filter((x) => x.selected)
                    .reduce((n, x) => n + cents(x.amount), 0) / 100,
                )}
              </Text>
              <Text style={S.muted}>
                {parsed.excluded.length} pagamentos ignorados ·{" "}
                {parsed.invalid.length} linhas não reconhecidas. Parcelas
                representam somente o valor desta fatura.
              </Text>
              {parsed.items.map((r, i) => (
                <View key={r.key} style={S.card}>
                  <Text style={S.text}>
                    {r.description} · {money(r.amount)}
                  </Text>
                  <Text style={S.muted}>
                    {r.date}
                    {r.parcel && r.parcel !== "-"
                      ? " · parcela " + r.parcel
                      : ""}
                  </Text>
                  <Switch
                    accessibilityLabel={"Incluir " + r.description}
                    value={r.selected}
                    onValueChange={(selected) =>
                      setParsed((p) => ({
                        ...p,
                        items: p.items.map((x, j) =>
                          j === i ? { ...x, selected } : x,
                        ),
                      }))
                    }
                  />
                  <FormField
                    field={select("category", "Categoria", [
                      { value: "", label: "Outros gastos" },
                      ...opts(categories),
                    ])}
                    value={r.category_id || ""}
                    onChange={(category_id) =>
                      setParsed((p) => ({
                        ...p,
                        items: p.items.map((x, j) =>
                          j === i ? { ...x, category_id } : x,
                        ),
                      }))
                    }
                  />
                  <Text style={S.muted}>{r.reason}</Text>
                </View>
              ))}
              <Text style={S.muted}>
                Conferi eventual diferença entre os itens e o total da fatura.
              </Text>
              <Switch
                accessibilityLabel="Confirmar diferença"
                value={difference}
                onValueChange={setDifference}
              />
            </>
          )}
          {attachments.map((d) => (
            <Button key={d.id} secondary onPress={() => download(d.id)}>
              {d.name}
            </Button>
          ))}
          {pdf && (
            <WebView
              style={{ height: 1, width: 1 }}
              originWhitelist={["about:blank"]}
              source={{ html: pdfHtml(pdf) }}
              javaScriptEnabled
              onMessage={(event) => {
                const task = pdfTask.current;
                if (!task) return;
                pdfTask.current = null;
                setPdf(null);
                try {
                  const result = JSON.parse(event.nativeEvent.data);
                  if (result.error) task.reject(Error(result.error));
                  else task.resolve(result.lines);
                } catch (e) {
                  task.reject(e);
                }
              }}
            />
          )}
        </ScrollView>
        <View
          style={{
            padding: 16,
            paddingBottom: 30,
            gap: 8,
            borderTopWidth: 1,
            borderColor: "#dce2d6",
          }}
        >
          {!!error && (
            <Text accessibilityRole="alert" style={S.error}>
              {error}
            </Text>
          )}
          <Button disabled={busy} onPress={save}>
            {busy ? "Processando…" : "Salvar fatura"}
          </Button>
          <Button secondary disabled={busy} onPress={close}>
            Cancelar
          </Button>
        </View>
      </View>
    </Modal>
  );
}
