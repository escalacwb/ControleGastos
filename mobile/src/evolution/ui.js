import { StatementForm } from "./StatementForm";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "../lib/theme";
import {
  money,
  monthLabel,
  shiftMonth,
  dateISO,
  formatDate,
} from "../lib/finance";
import { useData } from "./context";
export const S = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 100, gap: 17 },
  title: {
    fontSize: 29,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.text,
  },
  subtitle: { fontSize: 13, color: colors.muted, lineHeight: 20, marginTop: 7 },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.7,
    color: colors.muted,
    fontWeight: "700",
    marginBottom: 9,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 19,
    gap: 13,
  },
  cardTitle: { fontSize: 16, color: colors.text, fontWeight: "600" },
  text: { fontSize: 14, color: colors.text, lineHeight: 21 },
  muted: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  buttonSecondary: { backgroundColor: "#edf2e7" },
  buttonText: { color: "white", fontWeight: "600", fontSize: 13 },
  buttonSecondaryText: { color: colors.primary },
  input: {
    backgroundColor: "white",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    color: colors.text,
    fontSize: 15,
    minHeight: 46,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 7,
  },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: "#eef2e7",
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, color: colors.primary },
  chipActiveText: { color: "white" },
  value: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.text,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 5 },
  empty: { padding: 28, alignItems: "center", gap: 8 },
  fab: {
    position: "absolute",
    bottom: 18,
    right: 18,
    borderRadius: 18,
    paddingHorizontal: 21,
    paddingVertical: 17,
    backgroundColor: colors.primary,
    elevation: 5,
  },
  transaction: {
    paddingVertical: 15,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 6,
  },
  positive: { color: colors.success },
  negative: { color: colors.danger },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#102e3866",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "94%",
  },
  modalHeader: {
    padding: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  note: { padding: 14, borderRadius: 11, backgroundColor: "#eaf0e0" },
  barTrack: {
    height: 7,
    borderRadius: 6,
    backgroundColor: "#edf1e6",
    overflow: "hidden",
  },
  bar: { height: 7, borderRadius: 6, backgroundColor: "#799867" },
  kpi: {
    padding: 20,
    borderRadius: 17,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  kpiPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
});
export function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
  style,
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[
        S.button,
        secondary && S.buttonSecondary,
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <Text style={[S.buttonText, secondary && S.buttonSecondaryText]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}
export function Page({
  children,
  title,
  subtitle,
  eyebrow = "EM CASA · FINANÇAS DA FAMÍLIA",
}) {
  const { loading, error, refresh } = useData();
  return (
    <ScrollView
      style={S.page}
      contentContainerStyle={S.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => refresh().catch(() => {})}
          tintColor={colors.primary}
        />
      }
    >
      <View>
        <Text style={S.eyebrow}>{eyebrow}</Text>
        <Text style={S.title}>{title}</Text>
        {subtitle && <Text style={S.subtitle}>{subtitle}</Text>}
      </View>
      {!!error && (
        <View style={S.note}>
          <Text style={S.error}>{error}</Text>
          <Button secondary onPress={() => refresh().catch(() => {})}>
            Tentar novamente
          </Button>
        </View>
      )}
      {children}
    </ScrollView>
  );
}
export function Card({ title, children, style }) {
  return (
    <View style={[S.card, style]}>
      {title && <Text style={S.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}
export function Kpi({ title, value, note, primary = false }) {
  return (
    <View style={[S.kpi, primary && S.kpiPrimary]}>
      <Text style={[S.muted, primary && { color: "#d5e4ca" }]}>{title}</Text>
      <Text style={[S.value, primary && { color: "white" }]}>
        {money(value)}
      </Text>
      {note && (
        <Text style={[S.muted, primary && { color: "#d5e4ca" }]}>{note}</Text>
      )}
    </View>
  );
}
export function MonthPicker({ value, onChange }) {
  return (
    <View
      style={[
        S.row,
        {
          padding: 5,
          backgroundColor: "white",
          borderRadius: 11,
          borderWidth: 1,
          borderColor: colors.border,
        },
      ]}
    >
      <Button secondary onPress={() => onChange(shiftMonth(value, -1))}>
        ‹
      </Button>
      <Text style={[S.text, { fontWeight: "600", fontSize: 13 }]}>
        {monthLabel(value)}
      </Text>
      <Button secondary onPress={() => onChange(shiftMonth(value, 1))}>
        ›
      </Button>
    </View>
  );
}
export function Empty({
  title = "Nada por aqui ainda",
  detail = "Os próximos lançamentos aparecem aqui.",
}) {
  return (
    <View style={S.empty}>
      <Text style={S.cardTitle}>{title}</Text>
      <Text style={[S.muted, { textAlign: "center" }]}>{detail}</Text>
    </View>
  );
}
export function Chips({ value, options, onChange }) {
  return (
    <View style={S.wrap}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[S.chip, value === o.value && S.chipActive]}
        >
          <Text style={[S.chipText, value === o.value && S.chipActiveText]}>
            {o.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
export function FormField({ field, value, onChange }) {
  const [dateOpen, setDateOpen] = useState(false);
  if (field.type === "note")
    return (
      <View style={S.note}>
        <Text style={S.muted}>{field.label}</Text>
      </View>
    );
  return (
    <View>
      <Text style={S.label}>{field.label}</Text>
      {field.type === "select" ? (
        <View style={[S.input, { padding: 0 }]}>
          <Picker
            selectedValue={String(value ?? "")}
            onValueChange={onChange}
            enabled={!field.disabled}
            style={{ color: colors.text }}
          >
            {(field.options || []).map((o) => (
              <Picker.Item
                key={o.value}
                label={o.label}
                value={String(o.value)}
              />
            ))}
          </Picker>
        </View>
      ) : field.type === "date" ? (
        <>
          <Button secondary onPress={() => setDateOpen(true)}>
            {value ? formatDate(value) : "Escolher data"}
          </Button>
          {dateOpen && (
            <DateTimePicker
              value={new Date((value || dateISO()) + "T12:00:00")}
              mode="date"
              onChange={(event, date) => {
                setDateOpen(false);
                if (date) onChange(dateISO(date));
              }}
            />
          )}
        </>
      ) : (
        <TextInput
          style={S.input}
          value={String(value ?? "")}
          onChangeText={onChange}
          placeholder={field.placeholder || ""}
          keyboardType={
            field.type === "money"
              ? "decimal-pad"
              : field.type === "number"
                ? "number-pad"
                : "default"
          }
          autoCapitalize={field.type === "email" ? "none" : "sentences"}
          editable={!field.disabled}
          maxLength={field.maxLength || 250}
        />
      )}
      {field.hint && (
        <Text style={[S.muted, { marginTop: 6 }]}>{field.hint}</Text>
      )}
    </View>
  );
}
export function FormModal() {
  const { form, setForm, refresh } = useData();
  const [values, setValues] = useState({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    dirty = useRef(false);
  useEffect(() => {
    setValues(form?.initial || {});
    setError("");
    dirty.current = false;
  }, [form]);
  if (!form) return null;
  if (form.kind === "statement")
    return <StatementForm key={form.requestKey} form={form} />;
  const fields =
    typeof form.fields === "function" ? form.fields(values) : form.fields;
  const close = () => {
    if (lock.current) return;
    if (dirty.current)
      Alert.alert(
        "Sair sem salvar?",
        "Suas alterações neste formulário serão descartadas.",
        [
          { text: "Continuar editando", style: "cancel" },
          { text: "Sair", onPress: () => setForm(null) },
        ],
      );
    else setForm(null);
  };
  const submit = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      for (const f of fields)
        if (f.required && !String(values[f.name] ?? "").trim())
          throw Error("Preencha " + f.label.toLowerCase() + ".");
      await form.onSave(values);
      setForm(null);
      await refresh().catch(() =>
        Alert.alert(
          "Salvo",
          "O registro foi salvo. Atualize a lista quando a conexão voltar.",
        ),
      );
    } catch (e) {
      setError(e.message || "Não foi possível salvar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={S.modalOverlay}
      >
        <SafeAreaView edges={["bottom"]} style={S.modal}>
          <View style={S.modalHeader}>
            <Text style={S.cardTitle}>{form.title}</Text>
            <TouchableOpacity
              accessibilityLabel="Fechar formulário"
              onPress={close}
            >
              <Text style={{ fontSize: 28, color: colors.muted }}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 21, gap: 18 }}
            keyboardShouldPersistTaps="handled"
          >
            {fields.map((f) => (
              <FormField
                key={f.name || f.label}
                field={f}
                value={values[f.name]}
                onChange={(value) => {
                  dirty.current = true;
                  setValues((v) => ({ ...v, [f.name]: value }));
                }}
              />
            ))}
            {!!form.note && <Text style={S.muted}>{form.note}</Text>}
            {!!error && (
              <Text accessibilityRole="alert" style={S.error}>
                {error}
              </Text>
            )}
            <Button disabled={busy} onPress={submit}>
              {busy ? "Salvando…" : form.submitLabel || "Salvar"}
            </Button>
            <Button secondary disabled={busy} onPress={close}>
              Cancelar
            </Button>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
