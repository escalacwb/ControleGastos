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
const transactionAmount = (value, type, method) => {
  const n = parseMoney(value);
  if (!Number.isFinite(n) || n === 0)
    throw Error("Informe um valor diferente de zero, como 125,90 ou -30,00.");
  if (n < 0 && (type !== "expense" || method === "card"))
    throw Error("Valor negativo é permitido apenas em despesa lançada na conta.");
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
  const incomeCategories = rows("categories").filter(
    (c) => transactionType(c.type) === "income",
  );
  const expenseCategories = rows("categories").filter(
    (c) => transactionType(c.type) === "expense",
  );
  const defaultIncomeCategory =
    incomeCategories.find((c) => /^receitas?$/.test(normalize(c.name))) ||
    incomeCategories[0];
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
        category:
          old?.category_id ||
          (transactionType(extracted.type) === "income"
            ? defaultIncomeCategory?.id || ""
            : ""),
        destination: old?.transfer_to_account_id || "",
        installments: "1",
      },
      fields: (v) => [
        select(
          "type",
          "Tipo",
          [
            option("expense", "Despesa"),
            option("income", "Receita"),
            option("transfer", "Transferência"),
          ],
          {
            onChangeValues: (next, value, previous) => ({
              ...next,
              method: value === "expense" ? previous.method || "cash" : "cash",
              category:
                value === previous.type
                  ? previous.category
                  : value === "income"
                    ? defaultIncomeCategory?.id || ""
                    : "",
            }),
          },
        ),
        field(
          "amount",
          "Valor (R$)",
          v.type === "expense" && v.method !== "card" ? "signedMoney" : "money",
          v.type === "expense" && v.method !== "card"
            ? {
                placeholder: "Ex.: 1000,00 ou -300,00",
                hint: "Use valor negativo para devolver saldo à conta e reduzir o gasto desta categoria.",
              }
            : {},
        ),
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
                v.type === "income"
                  ? [
                      ...incomeCategories.map((c) => option(c.id, c.name)),
                      ...expenseCategories.map((c) =>
                        option(c.id, `Abater despesa: ${c.name}`),
                      ),
                    ]
                  : [
                      option("", "Sem categoria"),
                      ...expenseCategories.map((c) => option(c.id, c.name)),
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
      note: "Receitas usam RECEITAS por padrão. Para reembolso ou rateio, escolha 'Abater despesa' e a categoria será reduzida no relatório e no DNA. Compras no cartão só reduzem a conta ao pagar a fatura.",
      onSave: async (v) => {
        const card =
          v.type === "expense" && v.method === "card"
            ? rows("credit_cards").find((c) => c.id === v.card)
            : null;
        const data = {
          type: v.type,
          amount: transactionAmount(v.amount, v.type, v.method),
          description: v.description.trim(),
          date: v.date,
          account_id: card?.account_id || v.account,
          credit_card_id: card?.id || null,
          category_id:
            v.type === "transfer"
              ? null
              : rows("categories").find((c) => {
                  if (c.id !== v.category) return false;
                  const categoryType = transactionType(c.type);
                  return (
                    categoryType === v.type ||
                    (v.type === "income" && categoryType === "expense")
                  );
                })?.id ||
                (v.type === "income" ? defaultIncomeCategory?.id : null) ||
                null,
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
        spending_area: c.name ? spendingArea(c) : "",
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
      title: i.id ? "Editar investimento" : "Novo investimento",
      initial: {
        name: i.name || "",
        quote_mode: i.quote_mode || (i.type === "stocks" ? "stock" : "manual"),
        type: i.type || "Fundo de investimento",
        institution: i.institution || "",
        ticker: i.ticker || (/^[A-Z]{4}\d{1,2}$/.test(i.name || "") ? i.name : ""),
        quantity: String(i.quantity ?? ""),
        average_price: String(i.average_price ?? ""),
        treasury_title: i.treasury_title || "",
        maturity_date: i.maturity_date || "",
        initial_amount: String(i.initial_amount || 0),
        current_value: String(i.current_value || 0),
        purchase_date: i.purchase_date || today(),
      },
      fields: (values) => {
        const mode = values.quote_mode || "manual";
        return [
          field("name", "Nome"),
          select("quote_mode", "Como atualizar o saldo?", [
            option("stock", "Ação / papel B3 · cotação automática"),
            option("treasury", "Tesouro Direto · preço oficial"),
            option("manual", "Fundo ou outro · saldo manual"),
          ]),
          ...(mode === "manual" ? [field("type", "Tipo")] : []),
          field("institution", "Instituição", "text", { required: false }),
          ...(mode === "stock" ? [
            field("ticker", "Código do papel na B3"),
            field("quantity", "Quantidade atual de papéis", "money"),
            field("average_price", "Preço médio por papel", "money", { required: false }),
          ] : []),
          ...(mode === "treasury" ? [
            select("treasury_title", "Título do Tesouro", [
              option("", "Selecione"), option("Tesouro Selic", "Tesouro Selic"),
              option("Tesouro IPCA+", "Tesouro IPCA+"), option("Tesouro Prefixado", "Tesouro Prefixado"),
            ]),
            field("maturity_date", "Vencimento exato do título", "date"),
            field("quantity", "Quantidade atual de títulos", "money"),
          ] : []),
          field("initial_amount", "Valor total aplicado na compra", "money"),
          ...(mode === "manual" ? [field("current_value", "Saldo atual informado", "money")] : []),
          field("purchase_date", "Data real da compra", "date"),
          field("_pricing_note", "Ações e Tesouro usam quantidade × cotação. Fundos mantêm saldo manual. Nenhuma atualização movimenta contas.", "note", { required: false }),
        ];
      },
      onSave: async (v) => {
        const mode = v.quote_mode || "manual";
        const initial = numeric(v.initial_amount);
        const current = mode === "manual" ? numeric(v.current_value) : Number(i.current_value ?? initial);
        const quantity = v.quantity ? numeric(v.quantity) : null;
        const ticker = String(v.ticker || "").trim().toUpperCase();
        const averagePrice = v.average_price ? numeric(v.average_price) : null;
        if (initial < 0 || current < 0) throw Error("Os valores não podem ser negativos.");
        if (!v.purchase_date || v.purchase_date > today()) throw Error("Informe a data real da compra; ela não pode estar no futuro.");
        if (mode === "stock" && (!/^[A-Z]{4}\d{1,2}$/.test(ticker) || !Number.isInteger(quantity) || quantity < 0 || (!i.id && quantity === 0)))
          throw Error("Informe o código B3 e a quantidade inteira de papéis.");
        if (mode === "treasury" && (!v.treasury_title || !v.maturity_date || v.maturity_date <= v.purchase_date || !Number.isFinite(quantity) || quantity < 0 || (!i.id && quantity === 0)))
          throw Error("Informe o título, vencimento exato e quantidade de títulos.");
        if (mode === "stock" && averagePrice !== null && averagePrice < 0) throw Error("Preço médio inválido.");
        await save("investments", {
          name: v.name.trim(),
          quote_mode: mode,
          type: mode === "stock" ? "stocks" : mode === "treasury" ? "fixed_income" : String(v.type || "other").trim(),
          institution: String(v.institution || "").trim() || null,
          ticker: mode === "stock" ? ticker : null,
          quantity: mode === "manual" ? null : quantity,
          average_price: mode === "stock" ? averagePrice : null,
          treasury_title: mode === "treasury" ? v.treasury_title : null,
          maturity_date: mode === "treasury" ? v.maturity_date : (i.maturity_date || null),
          initial_amount: initial,
          current_value: current,
          purchase_date: v.purchase_date,
          updated_at: new Date().toISOString(),
        }, i.id);
        if (mode !== "manual") {
          try { await rpc("refresh_market_investments", {}); }
          catch { Alert.alert("Cotação", "Cadastro salvo. Tente atualizar pela cotação mais tarde."); }
        }
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
  const trade = (i, side) => {
    const request = Crypto.randomUUID();
    setForm({
      title: (side === "sale" ? "Vender" : "Comprar") + " · " + i.name,
      initial: { quantity: "", unit_price: "", fees: "0", date: today(), account: "", description: "" },
      fields: () => [
        field("quantity", "Quantidade", "number"),
        field("unit_price", "Preço por unidade (R$)", "money"),
        field("fees", "Custos / taxas (R$)", "money"),
        field("date", "Data da operação", "date"),
        select("account", "Lançar na conta", [option("", "Não, já registrei em outro lugar"), ...accounts.map((a) => option(a.id, a.name))]),
        field("description", "Observação", "text", { required: false }),
      ],
      note: "A operação atualiza a quantidade e preserva o histórico. Escolha uma conta apenas se o dinheiro ainda não foi lançado nela.",
      onSave: async (v) => {
        const quantity = parseMoney(v.quantity), price = parseMoney(v.unit_price), fees = parseMoney(v.fees);
        if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0 || !Number.isFinite(fees) || fees < 0)
          throw Error("Informe quantidade, preço e custos válidos.");
        if (i.quote_mode === "stock" && !Number.isInteger(quantity)) throw Error("A quantidade de ações deve ser inteira.");
        if (side === "sale" && quantity > Number(i.quantity)) throw Error("A venda excede a posição atual.");
        return rpc("record_investment_trade", {
          p_investment: i.id, p_side: side, p_quantity: quantity, p_unit_price: price,
          p_fees: fees, p_date: v.date, p_account: v.account || null,
          p_description: v.description, p_request: request,
          p_expected_quantity: i.quantity, p_expected_value: i.current_value,
        });
      },
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
    trade,
    rejectPending,
    importCsv,
    exportCsv,
  };
}
