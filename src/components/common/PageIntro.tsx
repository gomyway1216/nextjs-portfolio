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
  const rootClassName = [
    styles.root,
    aside ? styles.withAside : styles.singleColumn,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={rootClassName} style={style}>
      <div className={styles.copy}>
        <div className={styles.kicker}>{kicker}</div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        {meta ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
      {children ? <div className={styles.footer}>{children}</div> : null}
    </header>
  );
};

export default PageIntro;
