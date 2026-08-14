export function StepItem({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <div className="mb-4 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-secondary lg:h-14 lg:w-14">
        <span className="font-headings text-lg font-bold text-secondary-foreground lg:text-xl">
          {n}
        </span>
      </div>
      <p className="font-headings text-base font-bold text-foreground lg:text-lg">{title}</p>
      <p className="mt-1 font-body text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

export function StepConnector() {
  return <div className="mx-2 hidden h-0.5 flex-1 self-start bg-border lg:mt-7 lg:block" />;
}
