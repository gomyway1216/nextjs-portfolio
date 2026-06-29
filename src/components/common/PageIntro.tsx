import type { CSSProperties, ReactNode } from 'react';
import styles from './PageIntro.module.css';

interface PageIntroProps {
  kicker: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  accent?: string;
  className?: string;
}

const PageIntro = ({
  kicker,
  title,
  subtitle,
  aside,
  meta,
  children,
  accent,
  className,
}: PageIntroProps) => {
  const style = accent ? ({ '--page-intro-accent': accent } as CSSProperties) : undefined;

  return (
    <header className={[styles.root, className].filter(Boolean).join(' ')} style={style}>
      <div className={styles.copy}>
        <p className={styles.kicker}>{kicker}</p>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {meta ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
      {children ? <div className={styles.footer}>{children}</div> : null}
    </header>
  );
};

export default PageIntro;
