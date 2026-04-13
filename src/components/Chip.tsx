import styles from "../app/components.module.css";

type ChipVariant = "default" | "success" | "warning" | "error";

interface ChipProps {
  children: React.ReactNode;
  variant?: ChipVariant;
}

const variantMap: Record<ChipVariant, string> = {
  default: styles.chip,
  success: styles.chipSuccess,
  warning: styles.chipWarning,
  error: styles.chipError,
};

export function Chip({ children, variant = "default" }: ChipProps) {
  return <span className={variantMap[variant]}>{children}</span>;
}

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
}

export function ProgressBar({ value, className = "" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`${styles.progressTrack} ${className}`} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.progressFill} style={{ width: `${clamped}%` }} />
    </div>
  );
}
