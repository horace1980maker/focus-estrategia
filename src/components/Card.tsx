import styles from "../app/components.module.css";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return <div className={`${styles.card} ${className}`}>{children}</div>;
}

interface CoachCalloutProps {
  children: React.ReactNode;
  className?: string;
}

export function CoachCallout({ children, className = "" }: CoachCalloutProps) {
  return (
    <aside className={`${styles.coachCallout} ${className}`} role="complementary">
      {children}
    </aside>
  );
}
