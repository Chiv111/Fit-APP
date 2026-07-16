export function BrandLogo({ size = 36, className = "" }) {
  return (
    <span
      className={`brand-logo ${className}`.trim()}
      style={{ "--brand-logo-size": `${size}px` }}
    >
      <img src="/icons/anvil-logo.png" alt="Anvil" />
    </span>
  );
}
