export function findDisallowedRuntimePackageRequires(text, allowedExternals) {
  return Array.from(
    text.matchAll(/require\(\s*["'`]([^"'`]+)["'`]\s*\)/gu),
    (match) => match[1],
  ).filter((specifier) => !allowedExternals.has(specifier));
}
