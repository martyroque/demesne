import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({
  className,
  onChange,
  ...props
}: React.ComponentProps<"textarea">) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 108)}px`;
    }
  };

  React.useEffect(() => {
    adjustHeight();
  }, [props.value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    adjustHeight();
    onChange?.(e);
  };

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[36px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none dark:bg-input/30",
        className
      )}
      ref={textareaRef}
      onChange={handleChange}
      {...props}
    />
  );
}

export { Textarea };
