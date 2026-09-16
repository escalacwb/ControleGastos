import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, AppState } from "react-native";
import { supabase } from "../lib/supabase";
export const DataContext = createContext(null);
export const useData = () => useContext(DataContext);
export function DataProvider({ user, children }) {
  const [data, setData] = useState({}),
    [workspace, setWorkspace] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [form, setForm] = useState(null);
  const inflight = useRef(null),
    last = useRef(0);
  const formRef = useRef(form);
  const workspaceRef = useRef(null);
  const ownerId = () => {
    if (!workspaceRef.current?.owner_id)
      throw Error("Aguarde o carregamento do seu espaço financeiro.");
    return workspaceRef.current.owner_id;
  };
  formRef.current = form;
  const refresh = async () => {
    if (inflight.current) return inflight.current;
    setLoading(true);
    setError("");
    inflight.current = (async () => {
      try {
        const { data: sharedWorkspace, error: workspaceError } =
          await supabase.rpc("get_finance_workspace");
        if (workspaceError) throw workspaceError;
        if (!sharedWorkspace?.owner_id)
          throw Error(
            "Não foi possível identificar seu espaço financeiro. Entre novamente.",
          );
        const tables = [
          "accounts",
          "categories",
          "transactions",
          "credit_cards",
          "billing_cycles",
          "card_payments",
          "installments",
          "investments",
          "investment_transactions",
          "pending_transactions",
        ];
        const values = await Promise.all(
          tables.map(async (table) => {
            const all = [];
            for (let offset = 0; ; offset += 500) {
              let q = supabase
                .from(table)
                .select("*")
                .order("id")
                .range(offset, offset + 499);
              if (table !== "pending_transactions")
                q = q.eq("user_id", sharedWorkspace.owner_id);
              const { data: batch, error: failure } = await q;
              if (failure) throw failure;
              all.push(...batch);
              if (batch.length < 500) return all;
            }
          }),
        );
        workspaceRef.current = sharedWorkspace;
        setWorkspace(sharedWorkspace);
        setData(Object.fromEntries(tables.map((t, i) => [t, values[i]])));
        last.current = Date.now();
      } catch (e) {
        setError(
          e.message || "Não foi possível atualizar. Confira sua conexão.",
        );
        throw e;
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    return inflight.current;
  };
  useEffect(() => {
    refresh().catch(() => {});
    const listener = AppState.addEventListener("change", (s) => {
      if (
        s === "active" &&
        !formRef.current &&
        Date.now() - last.current > 60000
      )
        refresh().catch(() => {});
    });
    return () => listener.remove();
  }, [user.id]);
  const rpc = async (name, params) => {
    const { data: result, error: failure } = await supabase.rpc(name, params);
    if (failure) throw failure;
    return result;
  };
  const save = async (table, payload, id) => {
    let q = id
      ? supabase.from(table).update(payload).eq("id", id)
      : supabase.from(table).insert({ ...payload, user_id: ownerId() });
    if (id && table !== "pending_transactions") q = q.eq("user_id", ownerId());
    const { data: result, error: failure } = await q.select().single();
    if (failure) throw failure;
    return result;
  };
  const remove = async (table, id) => {
    const { error: failure } = await supabase
      .from(table)
      .delete()
      .eq("id", id)
      .eq("user_id", ownerId());
    if (failure)
      throw Error(
        failure.code === "23503"
          ? "Este registro está vinculado a lançamentos e precisa ser preservado."
          : failure.message,
      );
    await refresh();
  };
  return (
    <DataContext.Provider
      value={{
        data,
        rows: (t) => data[t] || [],
        user,
        workspace,
        loading,
        error,
        refresh,
        rpc,
        save,
        remove,
        form,
        setForm,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
