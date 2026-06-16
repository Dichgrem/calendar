import { useState } from "react";
import { useI18n } from "../hooks/use-i18n";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

interface Props {
  open: boolean;
  onSaved: () => void;
}

export function ServerUrlDialog({ open, onSaved }: Props) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    setError("");
    const trimmed = url.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+/.test(trimmed)) {
      setError(t("serverDialog.invalidUrl"));
      return;
    }
    localStorage.setItem("serverUrl", trimmed);
    onSaved();
  };

  const handleSkip = () => {
    localStorage.removeItem("serverUrl");
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={() => {}}
      title={t("serverDialog.title")}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleSkip} className="h-8 text-xs">
            {t("serverDialog.skip")}
          </Button>
          <Button size="sm" onClick={handleSave} className="h-8 text-xs">
            {t("serverDialog.connect")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("serverDialog.desc")}</p>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("serverDialog.placeholder")}
          className="block w-full border rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  );
}
