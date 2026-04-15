type SpinnerProps = {
  className?: string;
  label?: string;
};

export default function Spinner({ className = "h-4 w-4", label }: SpinnerProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        aria-hidden="true"
        className={`animate-spin text-current ${className}`}
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3.5"
        />
        <path
          className="opacity-90"
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3.5"
        />
      </svg>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
