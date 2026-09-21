import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useData } from "./context";
import {
  parseMoney,
  today,
  transactionType,
  outstanding,
  spendingArea,
  money,
  cents,
  parseCsv,
  csvDate,
  csvCell,
  normalize,
  monthRange,
} from "../lib/finance";
const option = (value, label) => ({ value, label });
const field = (name, label, type = "text", extra = {}) => ({
  name,
  label,
  type,
  required: true,
  ...extra,
});
const select = (name, label, options, extra = {}) =>
  field(name, label, "select", { options, ...extra });
const positive = (value) => {
  const n = parseMoney(value);
  if (!Number.isFinite(n) || n <= 0)
    throw Error("Informe um valor positivo, como 125,90.");
  return n;
};
const numeric = (value) => {
  const n = parseMoney(value);
  if (!Number.isFinite(n)) throw Error("Informe um valor válido.");
  return n;
};
export function useActions() {
  const { rows, user, rpc, save, remove, setForm, refresh } = useData();
  const accounts = rows("accounts").filter(
    (a) => !["credit", "credit_card"].includes(a.type),
  );
  const opts = (list, label = "name") => [
    option("", "Selecione"),
    ...list.map((a) => option(a.id, a[label])),
  ];
  const fail = (e) =>
    Alert.alert("Não foi possível concluir", e.message || "Tente novamente.");
  const transaction = (old = null, duplicate = false, pending = null) => {
    if (old?.billing_cycle_id && !duplicate) {
      setForm({
        title: "Categoria da compra",
        initial: { category: old.category_id },
        fields: [
          select(
            "category",
            "Categoria",
            opts(rows("categories").filter((c) => c.type === "expense")),
          ),
        ],
        note:
          old.description +
          " · " +
          money(old.amount) +
          " · detalhe da fatura, sem nova saída.",
        onSave: (v) =>
          rpc("categorize_statement_item", {
            p_id: old.id,
            p_category: v.category,
            p_expected: old.updated_at,
          }),
      });
      return;
    }
    if (
      old &&
      !duplicate &&
      (rows("card_payments").some((p) => p.transaction_id === old.id) ||
        rows("installments").some((p) => p.transaction_id === old.id))
    ) {
      Alert.alert(
        "Lançamento vinculado",
        "Para corrigir, exclua o lançamento e registre novamente. O pagamento será estornado e as parcelas vinculadas serão removidas.",
      );
      return;
    }
    const extracted = pending?.extracted_data || {},
      id = old && !duplicate ? old.id : null,
      request = Crypto.randomUUID();
    setForm({
      title: pending
        ? "Conferir lançamento"
        : id
          ? "Editar lançamento"
          : duplicate
            ? "Repetir lançamento"
            : "Novo lançamento",
      initial: {
        type: transactionType(old?.type || extracted.type || "expense"),
        method: old?.credit_card_id ? "card" : "cash",
        amount: String(old?.amount || extracted.amount || ""),
        description: old?.description || extracted.description || "",
        date: duplicate ? today() : old?.date || extracted.date || today(),
        account: old?.account_id || accounts[0]?.id || "",
        card: old?.credit_card_id || rows("credit_cards")[0]?.id || "",
        category: old?.category_id || "",
        destination: old?.transfer_to_account_id || "",
        installments: "1",
      },
      fields: (v) => [
        select("type", "Tipo", [
          option("expense", "Despesa"),
          option("income", "Receita"),
          option("transfer", "Transferência"),
        ]),
        field("amount", "Valor (R$)", "money"),
        field("description", "Descrição"),
        field("date", "Data", "date"),
        ...(v.type === "expense"
          ? [
              select("method", "Forma de pagamento", [
                option("cash", "Conta / dinheiro"),
                option("card", "Cartão de crédito"),
              ]),
            ]
          : []),
        v.method === "card" && v.type === "expense"
          ? select(
              "card",
              "Cartão",
              opts(
                rows("credit_cards").filter((c) => c.is_active !== false),
                "bank_name",
              ),
            )
          : select(
              "account",
              v.type === "transfer" ? "Conta de origem" : "Conta",
              opts(accounts),
            ),
        ...(v.type === "transfer"
          ? [
              select(
                "destination",
                "Conta de destino",
                opts(accounts.filter((a) => a.id !== v.account)),
              ),
            ]
          : [
              select(
                "category",
                "Categoria",
                [
                  option("", "Sem categoria"),
                  ...rows("categories")
                    .filter((c) => transactionType(c.type) === v.type)
                    .map((c) => option(c.id, c.name)),
                ],
                { required: false },
              ),
            ]),
        ...(v.type === "expense" && v.method === "card" && !id && !pending
          ? [
              field("installments", "Número de parcelas (1 a 60)", "number", {
                hint: "O valor informado é o total da compra. A primeira parcela usa a data escolhida.",
              }),
            ]
          : []),
      ],
      note: "Compras no cartão não reduzem o saldo da conta. Registre o pagamento na tela de faturas.",
      onSave: async (v) => {
        const card =
          v.type === "expense" && v.method === "card"
            ? rows("credit_cards").find((c) => c.id === v.card)
            : null;
        const data = {
          type: v.type,
          amount: positive(v.amount),
          description: v.description.trim(),
          date: v.date,
          account_id: card?.account_id || v.account,
          credit_card_id: card?.id || null,
          category_id:
            v.type === "transfer"
              ? null
              : rows("categories").find(
                  (c) =>
                    c.id === v.category && transactionType(c.type) === v.type,
                )?.id || null,
          transfer_to_account_id: v.type === "transfer" ? v.destination : null,
          client_request_id: request,
        };
        if (
          card &&
          !id &&
          !pending &&
          (!Number.isInteger(Number(v.installments)) ||
            Number(v.installments) < 1 ||
            Number(v.installments) > 60)
        )
          throw Error("Informe de 1 a 60 parcelas.");
        if (pending)
          await rpc("approve_pending_transaction", {
            p_pending: pending.id,
            p_data: data,
          });
        else if (card && !id && Number(v.installments) > 1)
          await rpc("save_installment_purchase", {
            p_data: data,
            p_count: Number(v.installments),
          });
        else
          await rpc("save_financial_transaction", {
            p_data: data,
            p_id: id,
            p_expected_updated_at: id ? old.updated_at : null,
          });
      },
    });
  };
  const deleteTransaction = (t) =>
    Alert.alert(
      "Excluir lançamento?",
      `${t.description}\nO efeito nas contas será revertido. Parcelas vinculadas serão removidas.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () =>
            rpc("delete_financial_transaction", {
              p_id: t.id,
              p_expected_updated_at: t.updated_at,
            })
              .then(refresh)
              .catch(fail),
        },
      ],
    );
  const deleteItem = (table, item) =>
    Alert.alert(
      "Excluir registro?",
      item.name + "\nRegistros com movimentações precisam ser preservados.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => remove(table, item.id).catch(fail),
        },
      ],
    );
  const account = (a = {}) =>
    setForm({
      title: a.id ? "Editar conta" : "Nova conta",
      initial: {
        name: a.name || "",
        type: a.type || "checking",
        balance: String(a.balance || 0),
      },
      fields: [
        field("name", "Nome"),
        select("type", "Tipo", [
          option("checking", "Conta corrente"),
          option("savings", "Poupança"),
          option("cash", "Dinheiro"),
          option("investment", "Investimentos"),
          ...(![
            "checking",
            "savings",
            "cash",
            "investment",
            undefined,
          ].includes(a.type)
            ? [option(a.type, a.type)]
            : []),
        ]),
        field(
          "balance",
          a.id ? "Saldo atual — ajuste manual" : "Saldo inicial",
          "money",
        ),
      ],
      note: "O saldo é a base dos próximos lançamentos. Ajuste apenas para conciliar com seu banco.",
      onSave: (v) =>
        rpc("save_financial_account", {
          p_id: a.id || null,
          p_name: v.name.trim(),
          p_type: v.type,
          p_balance: numeric(v.balance),
          p_expected_balance: a.id ? Number(a.balance || 0) : null,
        }),
    });
  const category = (c = {}) =>
    setForm({
      title: c.id ? "Editar categoria" : "Nova categoria",
      initial: {
        name: c.name || "",
        type: transactionType(c.type) || "expense",
        spending_area: c.spending_area || (c.name ? spendingArea(c) : ""),
      },
      fields: [
        field("name", "Nome"),
        select(
          "type",
          "Tipo",
          [option("expense", "Despesa"), option("income", "Receita")],
          { disabled: !!c.id },
        ),
        field("spending_area", "Área no DNA (ex.: Moradia)", "text", {
          required: false,
        }),
      ],
      onSave: (v) =>
        save(
          "categories",
          {
            name: v.name.trim(),
            type: c.type || v.type,
            spending_area: v.spending_area.trim() || null,
            color: c.color || "#648c6b",
          },
          c.id,
        ),
    });
  const card = (c = {}) =>
    setForm({
      title: c.id ? "Editar cartão" : "Novo cartão",
      initial: {
        bank_name: c.bank_name || "",
        holder_name: c.holder_name || "",
        last_four_digits: c.last_four_digits || "",
        card_network: c.card_network || "Visa",
        credit_limit: String(c.credit_limit || 0),
        closing_day: String(c.closing_day || 20),
        due_day: String(c.due_day || 5),
        account_id: c.account_id || accounts[0]?.id || "",
      },
      fields: [
        field("bank_name", "Nome do cartão / banco"),
        field("holder_name", "Titular"),
        field("last_four_digits", "Últimos quatro dígitos", "number", {
          maxLength: 4,
        }),
        select(
          "card_network",
          "Bandeira",
          ["Visa", "Mastercard", "Elo", "American Express", "Outra"].map((x) =>
            option(x, x),
          ),
        ),
        field("credit_limit", "Limite (R$)", "money"),
        field("closing_day", "Dia do fechamento (1 a 31)", "number"),
        field("due_day", "Dia do vencimento (1 a 31)", "number"),
        select("account_id", "Conta vinculada", opts(accounts)),
      ],
      onSave: (v) => {
        if (!/^\d{4}$/.test(v.last_four_digits))
          throw Error("Informe os quatro últimos dígitos.");
        for (const key of ["closing_day", "due_day"])
          if (
            !Number.isInteger(Number(v[key])) ||
            Number(v[key]) < 1 ||
            Number(v[key]) > 31
          )
            throw Error("O dia deve estar entre 1 e 31.");
        const limit = numeric(v.credit_limit);
        if (limit < 0) throw Error("O limite não pode ser negativo.");
        return save(
          "credit_cards",
          {
            ...v,
            bank_name: v.bank_name.trim(),
            holder_name: v.holder_name.trim(),
            credit_limit: limit,
            closing_day: Number(v.closing_day),
            due_day: Number(v.due_day),
            card_type: c.card_type || "credit",
            is_active: true,
          },
          c.id,
        );
      },
    });
  const statement = (card, cycle = null, pay = false, autoImport = false) =>
    setForm({
      kind: "statement",
      card,
      cycle,
      pay,
      autoImport,
      requestKey: Crypto.randomUUID(),
    });
  const pay = (cycle) =>
    statement(
      rows("credit_cards").find((c) => c.id === cycle.credit_card_id),
      cycle,
      true,
    );
  const investment = (i = {}) =>
    setForm({
      title: i.id ? "Atualizar investimento" : "Novo investimento",
      initial: {
        name: i.name || "",
        type: i.type || "Renda fixa",
        institution: i.institution || "",
        ticker: i.ticker || "",
        quantity: String(i.quantity ?? ""),
        average_price: String(i.average_price ?? ""),
        initial_amount: String(i.initial_amount || 0),
        current_value: String(i.current_value || 0),
        purchase_date: i.purchase_date || today(),
      },
      fields: [
        field("name", "Nome"),
        field("type", "Tipo"),
        field("institution", "Instituição", "text", { required: false }),
        field("ticker", "Papel B3 (opcional)", "text", { required: false }),
        field("quantity", "Quantidade atual de papéis", "money", {
          required: false,
        }),
        field("average_price", "Preço médio por papel", "money", {
          required: false,
        }),
        field("initial_amount", "Valor de referência", "money"),
        field("current_value", "Valor atual", "money"),
        field("purchase_date", "Data inicial", "date"),
      ],
      note: "Atualiza o patrimônio informado. Para movimentar uma conta, use Aporte ou resgate.",
      onSave: (v) => {
        const initial = numeric(v.initial_amount),
          current = numeric(v.current_value);
        const ticker = String(v.ticker || "")
            .trim()
            .toUpperCase(),
          quantity = v.quantity ? numeric(v.quantity) : null,
          average_price = v.average_price ? numeric(v.average_price) : null;
        if (
          ticker &&
          (!/^[A-Z]{4}\d{1,2}$/.test(ticker) ||
            quantity === null ||
            quantity < 0)
        )
          throw Error("Informe papel e quantidade válidos.");
        if (
          (quantity !== null && quantity < 0) ||
          (average_price !== null && average_price < 0)
        )
          throw Error("Quantidade ou preço médio inválido.");
        if (initial < 0 || current < 0)
          throw Error("Os valores não podem ser negativos.");
        return save(
          "investments",
          {
            ...v,
            name: v.name.trim(),
            ticker: ticker || null,
            quantity,
            average_price,
            initial_amount: initial,
            current_value: current,
            updated_at: new Date().toISOString(),
          },
          i.id,
        );
      },
    });
  const movement = (i) => {
    const request = Crypto.randomUUID();
    setForm({
      title: "Movimentar · " + i.name,
      initial: {
        type: "contribution",
        amount: "",
        date: today(),
        account: accounts[0]?.id || "",
        description: "",
      },
      fields: (v) => [
        select("type", "Movimentação", [
          option("contribution", "Aporte"),
          option("withdrawal", "Resgate"),
          option("yield", "Rendimento incorporado"),
          option("dividend", "Dividendo recebido"),
        ]),
        field("amount", "Valor", "money"),
        field("date", "Data", "date"),
        ...(v.type === "yield"
          ? []
          : [select("account", "Conta", opts(accounts))]),
        field("description", "Descrição", "text", { required: false }),
      ],
      note: "Rendimento incorporado altera apenas o investimento. Aportes, resgates e dividendos também movimentam a conta.",
      onSave: (v) =>
        rpc("record_investment_movement", {
          p_investment: i.id,
          p_type: v.type,
          p_amount: positive(v.amount),
          p_date: v.date,
          p_account: v.type === "yield" ? null : v.account,
          p_description: v.description,
          p_request: request,
        }),
    });
  };
  const rejectPending = (p) =>
    Alert.alert("Descartar sugestão?", "Nenhum lançamento será criado.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Descartar",
        onPress: () =>
          save(
            "pending_transactions",
            { status: "rejected", updated_at: new Date().toISOString() },
            p.id,
          )
            .then(refresh)
            .catch(fail),
      },
    ]);
  const exportCsv = async (list) => {
    try {
      if (!list.length) throw Error("Nenhum lançamento no período escolhido.");
      const text =
        "\uFEFF" +
        [
          ["Data", "Descricao", "Tipo", "Valor", "Conta", "Categoria"],
          ...list.map((t) => [
            t.date,
            t.description,
            transactionType(t.type),
            Number(t.amount).toFixed(2).replace(".", ","),
            rows("accounts").find((a) => a.id === t.account_id)?.name || "",
            rows("categories").find((c) => c.id === t.category_id)?.name || "",
          ]),
        ]
          .map((r) => r.map(csvCell).join(";"))
          .join("\r\n");
      const path = FileSystem.cacheDirectory + "em-casa-lancamentos.csv";
      await FileSystem.writeAsStringAsync(path, text);
      if (!(await Sharing.isAvailableAsync()))
        throw Error("Compartilhamento indisponível neste dispositivo.");
      await Sharing.shareAsync(path, {
        mimeType: "text/csv",
        dialogTitle: "Exportar lançamentos",
      });
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch (e) {
      fail(e);
    }
  };
  const importCsv = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "text/plain",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.size > 2 * 1024 * 1024) throw Error("Use um CSV de até 2 MB.");
      let parsed;
      try {
        parsed = parseCsv(await FileSystem.readAsStringAsync(asset.uri));
      } finally {
        await FileSystem.deleteAsync(asset.uri, { idempotent: true });
      }
      if (parsed.length < 2 || parsed.length > 501)
        throw Error("Use um arquivo com cabeçalho e de 1 a 500 lançamentos.");
      const headers = parsed.shift(),
        columns = headers.map((h, i) =>
          option(String(i), h || "Coluna " + (i + 1)),
        ),
        detect = (regex) =>
          String(
            Math.max(
              0,
              headers.findIndex((h) => regex.test(normalize(h))),
            ),
          );
      const requests = parsed.map(() => Crypto.randomUUID());
      let accepted = false;
      setForm({
        title: "Importar CSV",
        initial: {
          dateCol: detect(/data|date/),
          descriptionCol: detect(/descricao|description|historico/),
          amountCol: detect(/valor|amount/),
          direction: "signed",
          account: accounts[0]?.id || "",
          category: "",
          target: "cash",
        },
        fields: (v) => [
          select("dateCol", "Coluna de data", columns),
          select("descriptionCol", "Coluna de descrição", columns),
          select("amountCol", "Coluna de valor", columns),
          select("direction", "Valores", [
            option("signed", "Negativo = despesa; positivo = receita"),
            option("expense", "Todos são despesas"),
            option("income", "Todos são receitas"),
          ]),
          select("target", "Destino", [
            option("cash", "Conta"),
            option("card", "Cartão"),
          ]),
          v.target === "card"
            ? select("card", "Cartão", opts(rows("credit_cards"), "bank_name"))
            : select("account", "Conta", opts(accounts)),
          select(
            "category",
            "Categoria padrão",
            [
              option("", "Sem categoria"),
              ...rows("categories").map((c) => option(c.id, c.name)),
            ],
            { required: false },
          ),
        ],
        note: `${parsed.length} linhas lidas. Antes de importar, você verá a prévia e a quantidade de linhas válidas. Repetições exatas e linhas inválidas são ignoradas.`,
        submitLabel: "Conferir e importar",
        onSave: async (v) => {
          const card =
            v.target === "card"
              ? rows("credit_cards").find((c) => c.id === v.card)
              : null;
          const fingerprint = (t) =>
            [
              t.date,
              normalize(t.description),
              cents(t.amount),
              t.type,
              t.account_id,
              t.credit_card_id || "",
            ].join("|");
          const seen = new Set(
            rows("transactions").map((t) =>
              fingerprint({ ...t, type: transactionType(t.type) }),
            ),
          );
          let duplicates = 0,
            invalid = 0;
          const batch = [];
          parsed.forEach((r, i) => {
            const n = parseMoney(r[Number(v.amountCol)]),
              date = csvDate(r[Number(v.dateCol)]),
              description = String(r[Number(v.descriptionCol)] || "").trim();
            if (!date || !description || !Number.isFinite(n) || !n) {
              invalid++;
              return;
            }
            const type = card
              ? "expense"
              : v.direction === "signed"
                ? n < 0
                  ? "expense"
                  : "income"
                : v.direction;
            const category = rows("categories").find(
              (c) => c.id === v.category && transactionType(c.type) === type,
            );
            const t = {
              type,
              date,
              description,
              amount: Math.abs(n),
              account_id: card?.account_id || v.account,
              credit_card_id: card?.id || null,
              category_id: category?.id || null,
              client_request_id: requests[i],
            };
            const key = fingerprint(t);
            if (seen.has(key)) {
              duplicates++;
              return;
            }
            seen.add(key);
            batch.push(t);
          });
          if (!batch.length)
            throw Error(
              `Nenhuma linha nova válida. ${duplicates} repetidas; ${invalid} inválidas.`,
            );
          const confirmed = await new Promise((resolve) =>
            Alert.alert(
              "Conferir importação",
              `${batch.length} novos · ${duplicates} repetidos · ${invalid} inválidos\n\n${batch
                .slice(0, 5)
                .map(
                  (t) =>
                    t.date + " · " + t.description + " · " + money(t.amount),
                )
                .join(
                  "\n",
                )}\n\nTotal: ${money(batch.reduce((n, t) => n + t.amount, 0))}`,
              [
                {
                  text: "Voltar",
                  style: "cancel",
                  onPress: () => resolve(false),
                },
                { text: "Importar", onPress: () => resolve(true) },
              ],
              { cancelable: false },
            ),
          );
          if (!confirmed)
            throw Error(
              "Importação não confirmada. Ajuste os campos ou feche o formulário.",
            );
          await rpc("import_financial_transactions", { p_rows: batch });
        },
      });
    } catch (e) {
      fail(e);
    }
  };
  return {
    transaction,
    deleteTransaction,
    deleteItem,
    account,
    category,
    card,
    statement,
    pay,
    investment,
    movement,
    rejectPending,
    importCsv,
    exportCsv,
  };
}
