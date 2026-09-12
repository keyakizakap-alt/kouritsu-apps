"use client";

import { useId, useState } from "react";

export function ExpandableText({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const collapsible = text.length > (compact ? 120 : 180);

  return (
    <div className="expandable-text">
      <p
        id={id}
        className={`readable-text ${collapsible && !expanded ? "is-collapsed" : ""}`}
      >
        {text}
      </p>
      {collapsible ? (
        <button
          type="button"
          className="text-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "折りたたむ ↑" : "全文を表示 ↓"}
        </button>
      ) : null}
    </div>
  );
}
