type SkeletonProps = {
  className: string;
};

export default function Skeleton({ className }: SkeletonProps) {
  return <div className={`animate-pulse rounded-2xl bg-white/8 ${className}`} />;
}
