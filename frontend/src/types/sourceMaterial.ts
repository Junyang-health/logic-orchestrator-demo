export type SourceFileEntry = {
  id: string;
  file: File;
  addedAt: number;
};

export function classifySourceKind(file: File): "excel" | "image" | "other" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "excel";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) return "image";
  return "other";
}
