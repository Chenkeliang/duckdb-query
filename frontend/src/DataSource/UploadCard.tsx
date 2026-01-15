import React from "react";
import { Upload } from "lucide-react";

const UploadCard = () => {
  return (
    <div className="border border-dashed border-border rounded-xl bg-surface p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:border-primary transition-colors">
      <Upload className="w-8 h-8 text-muted-fg mb-3" />
      <p className="text-foreground font-medium">Drag &amp; Drop files here</p>
      <p className="text-xs text-muted-fg mt-1">
        CSV, JSON, Parquet (Max 500MB)
      </p>
    </div>
  );
};

export default UploadCard;
