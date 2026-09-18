import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  hint: string;
  accept?: string;
  busy?: boolean;
  onFile: (file: File) => void | Promise<void>;
  compact?: boolean;
};

export function UploadCard({ title, hint, accept = ".xlsx,.xls,.csv", busy, onFile, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = (file: File | undefined) => {
    if (file) void onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files[0]);
      }}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card text-center transition-colors",
        compact ? "gap-2 p-5" : "gap-3 p-10",
        dragging && "border-primary bg-secondary",
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-secondary text-primary">
        {busy ? <Loader2 className="size-5 animate-spin" /> : <UploadCloud className="size-5" />}
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        Choose file
      </Button>
    </div>
  );
}
