import { useEffect, useState } from "react";
import QRCode from "qrcode";

type StudentQrCodeProps = {
  value: string;
  label: string;
  size?: number;
  className?: string;
  onGenerated?: (dataUrl: string) => void;
};

const getCssToken = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

/** Generates a crisp Canvas QR code with colors sourced from the active CSS design tokens. */
export function StudentQrCode({ value, label, size = 360, className = "", onGenerated }: StudentQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setDataUrl("");
    setError("");

    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: getCssToken("--ink", "#21170f"),
        light: getCssToken("--paper", "#fffdf7"),
      },
    }).then((url) => {
      if (!cancelled) {
        setDataUrl(url);
        onGenerated?.(url);
      }
    }).catch(() => {
      if (!cancelled) setError("تعذّر إنشاء رمز الطالب.");
    });

    return () => {
      cancelled = true;
    };
  }, [onGenerated, size, value]);

  if (error) {
    return <p className="qr-error" role="alert">{error}</p>;
  }

  if (!dataUrl) {
    return <div className={`qr-code qr-code--loading ${className}`} aria-label="جارٍ إنشاء رمز الطالب" />;
  }

  return (
    <figure className={`qr-code ${className}`}>
      <img src={dataUrl} alt={label} width={size} height={size} decoding="async" style={{ display: "block", width: "100%", height: "auto" }} />
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
