import { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { Button } from "../components/Button";
import { getServerUrl, setServerUrl } from "../lib/api";

interface Props {
  onConnected: () => void;
}

export function ServerSetupScreen({ onConnected }: Props) {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getServerUrl().then((u) => {
      if (u) { setSaved(u); }
    });
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    try {
      const clean = url.replace(/\/+$/, "");
      const res = await fetch(`${clean}/api/auth/status`, { method: "GET" });
      if (res.ok) {
        await setServerUrl(clean);
        onConnected();
      } else {
        setError(`Server returned ${res.status}`);
      }
    } catch {
      setError("无法连接，请检查地址");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={s.center}>
      <Text style={s.title}>连接服务器</Text>
      {saved ? (
        <>
          <Text style={s.label}>当前服务器</Text>
          <Text style={s.val}>{saved}</Text>
          <Button title="使用此服务器" onPress={() => onConnected()} variant="primary" />
          <View style={s.sep} />
          <Text style={s.label}>更换服务器地址</Text>
        </>
      ) : null}
      <TextInput
        style={s.inp}
        value={url}
        onChangeText={setUrl}
        placeholder="https://calendar.example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {error ? <Text style={s.err}>{error}</Text> : null}
      <Button title={connecting ? "连接中..." : "连接"} onPress={handleConnect} loading={connecting} variant="primary" />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#fafafa" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
  label: { fontSize: 12, color: "#888", marginTop: 8 },
  val: { fontSize: 14, fontFamily: "monospace", marginTop: 4, backgroundColor: "#f5f5f5", padding: 8, borderRadius: 4, width: "100%", textAlign: "center" },
  sep: { height: 1, backgroundColor: "#e5e5e5", width: "100%", marginVertical: 16 },
  inp: { width: "100%", borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8 },
  err: { color: "#ef4444", marginBottom: 8 },
});
