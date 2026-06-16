export function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[hsl(210_25%_15%)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
