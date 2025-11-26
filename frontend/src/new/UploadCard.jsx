import React from "react";
import { Upload } from "lucide-react";

const UploadCard = () => {
  return (
    <div className="border border-dashed border-[var(--dq-border)] rounded-xl bg-[var(--dq-surface)] p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[var(--dq-primary)] transition-colors">
      <Upload className="w-8 h-8 text-[var(--dq-text-tertiary)] mb-3" />
      <p className="text-[var(--dq-text-primary)] font-medium">
        Drag &amp; Drop files here
      </p>
      <p className="text-xs text-[var(--dq-text-tertiary)] mt-1">
        CSV, JSON, Parquet (Max 500MB)
      </p>
    </div>
  );
};

export default UploadCard;
