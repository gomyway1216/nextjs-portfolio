import styles from './blog-post.module.css';

interface BlogPostSkeletonProps {
  label?: string;
}

const BlogPostSkeleton = ({ label = 'Loading post' }: BlogPostSkeletonProps) => (
  <main className={styles.page}>
    <div className={styles.shell}>
      <span className={styles.srOnly} role="status">
        {label}
      </span>
      <div className={styles.toolbar}>
        <div className={styles.skeletonBack} />
      </div>
      <article className={styles.skeletonArticle} aria-hidden="true">
        <header className={styles.skeletonHeader}>
          <div className={styles.skeletonCategory} />
          <div className={styles.skeletonTitle} />
          <div className={styles.skeletonTitleShort} />
          <div className={styles.skeletonDate} />
          <div className={styles.skeletonTags}>
            <span />
            <span />
            <span />
          </div>
        </header>
        <div className={styles.skeletonCover} />
        <div className={styles.skeletonBody}>
          <span />
          <span />
          <span />
          <span />
        </div>
      </article>
    </div>
  </main>
);

export default BlogPostSkeleton;
