import React, { useState, useMemo, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  useColorScheme,
  Modal,
  StatusBar,
  Linking,
} from "react-native";
/* ======================= Helpers: digits, grouping, i18n ======================= */
const digitsFa = "۰۱۲۳۴۵۶۷۸۹";
const digitsAr = "٠١٢٣٤٥٦٧٨٩";
const normalizeDigitsToAscii = (s: string) =>
  s
    .split("")
    .map((ch) => {
      const fa = digitsFa.indexOf(ch);
      if (fa !== -1) return String(fa);
      const ar = digitsAr.indexOf(ch);
      if (ar !== -1) return String(ar);
      return ch;
    })
    .join("");

// keep only digits (ASCII)
const onlyDigits = (s: string) =>
  (normalizeDigitsToAscii(s).match(/[0-9]+/g)?.join("") ?? "");

// group a plain digit-string (no sign, no separators) every 3 from end
const groupPlain = (plain: string, sep: string) => {
  if (!plain) return "0";
  let out = "";
  let cnt = 0;
  for (let i = plain.length - 1; i >= 0; i--) {
    out = plain[i] + out;
    cnt++;
    if (i > 0 && cnt % 3 === 0) out = sep + out;
  }
  return out;
};

// map ASCII 0-9 to fa digits if needed
const mapDigitsForLang = (s: string, lang: "fa" | "en") =>
  lang === "fa"
    ? s.replace(/[0-9]/g, (d) => digitsFa[Number(d)])
    : s;

// format BigInt with grouping and locale digits
const formatBigInt = (n: bigint, lang: "fa" | "en") => {
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  const plain = abs.toString(); // ASCII digits
  const sep = lang === "fa" ? "٬" : ",";
  const grouped = groupPlain(plain, sep);
  const withSign = sign + grouped;
  return mapDigitsForLang(withSign, lang);
};

// format small number (0..999) with locale digits (used for qeran)
const formatSmall = (n: number, lang: "fa" | "en") =>
  mapDigitsForLang(n.toString(), lang);

/* ======================= Conversions with BigInt ======================= */
const OLD_PER_NEW = 10000n; // 10,000 old rial = 1 new rial
const OLD_PER_QERAN = 100n; // 100 old rial = 1 qeran

const parseOldRialInputToBig = (val: string): bigint => {
  const raw = onlyDigits(val);
  return raw ? BigInt(raw) : 0n;
};

const parseNewRialInputToBig = (val: string): bigint => {
  const raw = onlyDigits(val);
  return raw ? BigInt(raw) : 0n;
};

const parseQeranInputToNumber = (val: string): number => {
  const raw = onlyDigits(val);
  const n = raw ? Number(raw) : 0;
  return Math.max(0, Math.min(99, Math.floor(n)));
};

const oldToNewQeran = (oldRial: bigint) => {
  const newRial = oldRial / OLD_PER_NEW; // bigint
  const rem = oldRial % OLD_PER_NEW;
  const qeran = Number(rem / OLD_PER_QERAN); // 0..99 safe as number
  return { newRial, qeran };
};

const newQeranToOld = (newRial: bigint, qeran: number) =>
  newRial * OLD_PER_NEW + BigInt(qeran) * OLD_PER_QERAN;

/* ======================= Persian number to words (BigInt) ======================= */
// convert a 0..999 numeric triplet to Persian words
const ones = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const tens = ["", "ده", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const hundreds = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
const teens: Record<number, string> = {
  11: "یازده",
  12: "دوازده",
  13: "سیزده",
  14: "چهارده",
  15: "پانزده",
  16: "شانزده",
  17: "هفده",
  18: "هجده",
  19: "نوزده",
};
const scales = ["", "هزار", "میلیون", "میلیارد", "تریلیون", "کوادریلیون", "کوینتیلیون"];

const tripletToFaWords = (n: number) => {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(hundreds[Math.floor(n / 100)]);
    n %= 100;
  }
  if (n === 0) return parts.join(" و ");
  if (n > 10 && n < 20) {
    parts.push(teens[n]);
    return parts.join(" و ");
  }
  if (n >= 10) {
    parts.push(tens[Math.floor(n / 10)]);
    n %= 10;
  }
  if (n > 0) parts.push(ones[n]);
  return parts.filter(Boolean).join(" و ");
};

// BigInt → Persian words (arbitrary size). 0 → "صفر"
const bigIntToPersianWords = (num: bigint): string => {
  if (num === 0n) return "صفر";
  const neg = num < 0n;
  let n = neg ? -num : num;
  const parts: string[] = [];
  let scaleIdx = 0;
  while (n > 0n) {
    const chunk = Number(n % 1000n); // safe: < 1000
    if (chunk) {
      const words = tripletToFaWords(chunk);
      const scale = scales[scaleIdx] || "";
      parts.unshift(scale ? `${words} ${scale}` : words);
    }
    n = n / 1000n;
    scaleIdx++;
  }
  const out = parts.join(" و ");
  return neg ? `منفی ${out}` : out;
};

/* ======================= Component ======================= */
export default function App() {
  // language
  const [lang, setLang] = useState<"fa" | "en">("fa");

  // theme
  const systemTheme = useColorScheme();
  const [theme, setTheme] = useState<"light" | "dark" | "auto">("auto");
  // Auto-by-time: dark between 18:00 and 06:00 local time
  const hour = new Date().getHours();
  const autoDark = hour >= 18 || hour < 6;
  const resolvedTheme = theme === "auto" ? (autoDark ? "dark" : "light") : theme;
  const isDark = resolvedTheme === "dark";

  const C = {
    bg: isDark ? "#0f172a" : "#f6f7fb",
    card: isDark ? "#172033" : "#ffffff",
    text: isDark ? "#ffffff" : "#0f172a",
    sub: isDark ? "#b5c0d0" : "#475569",
    border: isDark ? "#2a3550" : "#d1d5db",
    ok: "#16a34a",         // New Rial (green)
    warn: "#1e3a8a",       // kept for other uses
    old: "#f59e0b",        // Old Rial (amber)
    qeran: isDark ? "#4ade80" : "#22c55e", // Qeran: visibly green in both themes (lighter in dark, mid-green in light)
    primary: "#0ea5e9",
  };

  const t = (k: string) => {
    const fa: Record<string, string> = {
      title: "تبدیل ریال قدیم به ریال جدید",
      mode_old_to_new: "ریال قدیم → ریال جدید/قِران",
      mode_new_to_old: "ریال جدید/قِران → ریال قدیم",
      old_rial: "ریال قدیم",
      new_rial: "ریال جدید",
      qeran: "قِران",
      placeholder_old: "مثلاً 550,000",
      placeholder_new: "مثلاً 55",
      placeholder_qeran: "مثلاً 40",
      swap: "⇄ برعکس",
      result_new: "ریال جدید",
      result_old: "ریال قدیم",
      letters_new: "ریال جدید به حروف",
      letters_old: "ریال قدیم به حروف",
      approx_toman: "معادل تقریبی: _ تومان قدیم",
      ad_title: "محل تبلیغ شما",
      settings: "تنظیمات",
      theme: "تم",
      auto: "خودکار",
      light: "روز",
      dark: "شب",
      language: "زبان",
      contact: "ارتباط با ما",
      privacy_header: "توضیحات حریم‌خصوصی",
      privacy_body:
        "این اپ آفلاین است، هیچ داده‌ای جمع‌آوری نمی‌کند، به اینترنت نیاز ندارد و هیچ مجوز خاصی درخواست نمی‌کند.",
      email_label: "ایمیل",
      close: "بستن",
    };
    const en: Record<string, string> = {
      title: "Old Rial → New Rial",
      mode_old_to_new: "Old Rial → New Rial/Qeran",
      mode_new_to_old: "New Rial/Qeran → Old Rial",
      old_rial: "Old Rial",
      new_rial: "New Rial",
      qeran: "Qeran",
      placeholder_old: "e.g. 550,000",
      placeholder_new: "e.g. 55",
      placeholder_qeran: "e.g. 40",
      swap: "⇄ Swap",
      result_new: "New Rial",
      result_old: "Old Rial",
      letters_new: "New Rial (in words)",
      letters_old: "Old Rial (in words)",
      approx_toman: "Approximate: _ old Tomans",
      ad_title: "Your Ad Here",
      settings: "Settings",
      theme: "Theme",
      auto: "Auto",
      light: "Light",
      dark: "Dark",
      language: "Language",
      contact: "Contact Us",
      privacy_header: "Privacy Notes",
      privacy_body:
        "This app works offline, collects no data, requires no network or special permissions.",
      email_label: "Email",
      close: "Close",
    };
    return (lang === "fa" ? fa : en)[k] || k;
  };

  // direction & inputs (keep as formatted strings)
  const [reverse, setReverse] = useState(false);
  const [oldInput, setOldInput] = useState("");
  const [newInput, setNewInput] = useState("");
  const [qeranInput, setQeranInput] = useState("");

  // keep grouped while typing, using BigInt-safe grouping
  const onChangeOld = (txt: string) => {
    const raw = onlyDigits(txt);
    const grouped = groupPlain(raw || "0", lang === "fa" ? "٬" : ",");
    setOldInput(mapDigitsForLang(grouped, lang));
  };
  const onChangeNew = (txt: string) => {
    const raw = onlyDigits(txt);
    const grouped = groupPlain(raw || "0", lang === "fa" ? "٬" : ",");
    setNewInput(mapDigitsForLang(grouped, lang));
  };
  const onChangeQeran = (txt: string) => {
    const rawDigits = onlyDigits(txt).slice(0, 2);
    const grouped = groupPlain(rawDigits || "0", lang === "fa" ? "٬" : ",");
    setQeranInput(mapDigitsForLang(grouped, lang));
  };

  /* ======================= Compute results ======================= */
  const result = useMemo(() => {
    if (!reverse) {
      // old -> new
      const oldRial = parseOldRialInputToBig(oldInput);
      const { newRial, qeran } = oldToNewQeran(oldRial);
      const tomanOld = oldRial / 10n; // ✅ based on old rial
      return { mode: "oldToNew" as const, oldRial, newRial, qeran, tomanOld };
    } else {
      // new -> old
      const newRial = parseNewRialInputToBig(newInput);
      const qeran = parseQeranInputToNumber(qeranInput);
      const oldRial = newQeranToOld(newRial, qeran);
      const tomanOld = oldRial / 10n;
      return { mode: "newToOld" as const, oldRial, newRial, qeran, tomanOld };
    }
  }, [reverse, oldInput, newInput, qeranInput, lang]);

  /* ======================= UI ======================= */
  const [showSettings, setShowSettings] = useState(false);
  const topPad = 16; // reduced fixed top padding // ~3cm

  const openMail = async () => {
    const mailto = "mailto:dev.yari1985@gmail.com";
    const can = await Linking.canOpenURL(mailto);
    if (can) Linking.openURL(mailto);
    else Alert.alert(t("contact"), "dev.yari1985@gmail.com");
  };

  const AdBanner = () => (
    <Pressable
      onPress={() =>
        Alert.alert(lang === "fa" ? "تماس تبلیغات" : "Ad Contact", "dev.yari1985@gmail.com")
      }
      style={{
        backgroundColor: C.card,
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: "center",
        marginBottom: 18,
      }}
    >
      <Text style={{ color: C.text, fontWeight: "700" }}>{t("ad_title")}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 24,
          paddingTop: topPad,
        }}
      >
        <AdBanner />

        {/* Title + Settings */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Text style={{ color: C.text, fontSize: 22, fontWeight: "800" }}>
            {t("title")}
          </Text>
          <Pressable
            onPress={() => setShowSettings(true)}
            style={{
              backgroundColor: C.card,
              borderWidth: 1,
              borderColor: C.border,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: C.text, fontSize: 16 }}>⚙️</Text>
          </Pressable>
        </View>

        {/* Mode + swap */}
        <View
          style={{
            backgroundColor: C.card,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ color: C.text, fontWeight: "600" }}>
              {reverse ? t("mode_new_to_old") : t("mode_old_to_new")}
            </Text>
            <Pressable
              onPress={() => setReverse((r) => !r)}
              style={{
                backgroundColor: C.primary,
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: "#fff" }}>{t("swap")}</Text>
            </Pressable>
          </View>

          {!reverse ? (
            <TextInput
              placeholder={t("placeholder_old")}
              placeholderTextColor={C.sub}
              value={oldInput}
              onChangeText={onChangeOld}
              inputMode="numeric"
              style={{
                marginTop: 12,
                backgroundColor: isDark ? "#0b1220" : "#f1f5f9",
                color: C.text,
                padding: 14,
                borderRadius: 10,
                textAlign: "center",
                fontSize: 22,
                fontWeight: "700",
                borderWidth: 1,
                borderColor: C.border,
                fontVariant: ["tabular-nums"],
              }}
            />
          ) : (
            <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
              <TextInput
                placeholder={t("placeholder_new")}
                placeholderTextColor={C.sub}
                value={newInput}
                onChangeText={onChangeNew}
                inputMode="numeric"
                style={{
                  flex: 1,
                  backgroundColor: isDark ? "#0b1220" : "#f1f5f9",
                  color: C.text,
                  padding: 14,
                  borderRadius: 10,
                  textAlign: "center",
                  fontSize: 22,
                  fontWeight: "700",
                  borderWidth: 1,
                  borderColor: C.border,
                  fontVariant: ["tabular-nums"],
                }}
              />
              <TextInput
                placeholder={t("placeholder_qeran")}
                placeholderTextColor={C.sub}
                value={qeranInput}
                onChangeText={onChangeQeran}
                inputMode="numeric"
                style={{
                  width: 120,
                  backgroundColor: isDark ? "#0b1220" : "#f1f5f9",
                  color: C.text,
                  padding: 14,
                  borderRadius: 10,
                  textAlign: "center",
                  fontSize: 22,
                  fontWeight: "700",
                  borderWidth: 1,
                  borderColor: C.border,
                  fontVariant: ["tabular-nums"],
                }}
              />
            </View>
          )}
        </View>

        {/* Result card */}
        <View
          style={{
            backgroundColor: C.card,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: C.border,
            marginTop: 14,
            alignItems: "center",
          }}
        >
          {result.mode === "oldToNew" ? (
            <>
              <Text style={{ color: C.text, fontSize: 24, fontWeight: "800", textAlign: "center" }}>
                <Text style={{ color: C.ok, fontSize: 30, fontWeight: "800" }}>
                  {formatBigInt(result.newRial, lang)}
                </Text>{" "}
                {lang === "fa" ? t("new_rial") : t("result_new")} {lang === "fa" ? "و" : "&"}{" "}
                <Text style={{ color: C.qeran, fontSize: 26, fontWeight: "800" }}>
                  {formatSmall(result.qeran, lang)}
                </Text>{" "}
                {t("qeran")}
              </Text>

              {/* words */}
              <Text style={{ color: C.sub, textAlign: "center", marginTop: 8 }}>
                {lang === "fa"
                  ? `${t("letters_new")}: ${bigIntToPersianWords(
                      result.newRial
                    )}${result.qeran > 0 ? ` ریال و ${tripletToFaWords(result.qeran)} قِران` : " ریال"}`
                  : `${t("letters_new")}: ${formatBigInt(result.newRial, "en")} rial(s)` +
                    (result.qeran > 0 ? ` and ${result.qeran} qeran` : "")}
              </Text>

              {/* toman (old) from old rial */}
              <Text style={{ color: C.sub, textAlign: "center", marginTop: 4 }}>
                {lang === "fa"
                  ? t("approx_toman").replace("_", formatBigInt(result.tomanOld, "fa"))
                  : t("approx_toman").replace("_", formatBigInt(result.tomanOld, "en"))}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: C.text, fontSize: 24, fontWeight: "800", textAlign: "center" }}>
                <Text style={{ color: C.old, fontSize: 30, fontWeight: "800" }}>
                  {formatBigInt(result.oldRial, lang)}
                </Text>{" "}
                {t("result_old")}
              </Text>

              <Text style={{ color: C.sub, textAlign: "center", marginTop: 8 }}>
                {lang === "fa"
                  ? `${t("letters_old")}: ${bigIntToPersianWords(result.oldRial)} ریال`
                  : `${t("letters_old")}: ${formatBigInt(result.oldRial, "en")} rial(s)`}
              </Text>

              <Text style={{ color: C.sub, textAlign: "center", marginTop: 4 }}>
                {lang === "fa"
                  ? t("approx_toman").replace("_", formatBigInt(result.tomanOld, "fa"))
                  : t("approx_toman").replace("_", formatBigInt(result.tomanOld, "en"))}
              </Text>
            </>
          )}
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: C.card,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
              borderTopWidth: 1,
              borderColor: C.border,
            }}
          >
            <Text
              style={{
                color: C.text,
                fontSize: 18,
                fontWeight: "800",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {t("settings")}
            </Text>

            {/* Language */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginVertical: 8,
              }}
            >
              <Text style={{ color: C.text, fontWeight: "600" }}>{t("language")}</Text>
              <View style={{ flexDirection: "row" }}>
                <Pressable
                  onPress={() => setLang("fa")}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: lang === "fa" ? C.primary : C.card,
                    borderWidth: 1,
                    borderColor: C.border,
                    marginRight: 6,
                  }}
                >
                  <Text style={{ color: lang === "fa" ? "#fff" : C.text, fontWeight: "700" }}>
                    FA
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setLang("en")}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: lang === "en" ? C.primary : C.card,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  <Text style={{ color: lang === "en" ? "#fff" : C.text, fontWeight: "700" }}>
                    EN
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Theme */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginVertical: 8,
              }}
            >
              <Text style={{ color: C.text, fontWeight: "600" }}>{t("theme")}</Text>
              <View style={{ flexDirection: "row" }}>
                <Pressable
                  onPress={() => setTheme("auto")}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: theme === "auto" ? C.primary : C.card,
                    borderWidth: 1,
                    borderColor: C.border,
                    marginRight: 6,
                  }}
                >
                  <Text style={{ color: theme === "auto" ? "#fff" : C.text, fontWeight: "700" }}>
                    {t("auto")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTheme("light")}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: theme === "light" ? C.primary : C.card,
                    borderWidth: 1,
                    borderColor: C.border,
                    marginRight: 6,
                  }}
                >
                  <Text style={{ color: theme === "light" ? "#fff" : C.text, fontWeight: "700" }}>
                    {t("light")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTheme("dark")}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: theme === "dark" ? C.primary : C.card,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  <Text style={{ color: theme === "dark" ? "#fff" : C.text, fontWeight: "700" }}>
                    {t("dark")}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Contact Us */}
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: C.text, fontWeight: "700", marginBottom: 6 }}>
                {t("contact")}
              </Text>
              <Pressable
                onPress={openMail}
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: "#e2e8f0",
                }}
              >
                <Text style={{ color: "#0f172a", fontWeight: "700" }}>
                  {t("email_label")}: dev.yari1985@gmail.com
                </Text>
              </Pressable>
            </View>

            {/* Privacy (moved from home) */}
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: C.text, fontWeight: "700", marginBottom: 6 }}>
                {t("privacy_header")}
              </Text>
              <Text style={{ color: C.sub, lineHeight: 22 }}>{t("privacy_body")}</Text>
            </View>

            <Pressable
              onPress={() => setShowSettings(false)}
              style={{
                marginTop: 14,
                alignSelf: "center",
                backgroundColor: C.primary,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>{t("close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
