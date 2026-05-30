declare module 'dompurify' {
  interface SanitizeConfig {
    ADD_TAGS?: string[];
    ADD_ATTR?: string[];
    [key: string]: unknown;
  }

  interface DOMPurifyInstance {
    sanitize(dirty: string | Node, config?: SanitizeConfig): string;
  }

  const DOMPurify: DOMPurifyInstance;
  export default DOMPurify;
}
