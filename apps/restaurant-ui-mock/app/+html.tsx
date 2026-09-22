import { ScrollViewStyleReset } from "expo-router/html";
import type { ReactNode } from "react";

export default function Document({ children }: { children: ReactNode }) {
  return <html lang="tr"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" /><ScrollViewStyleReset /><style dangerouslySetInnerHTML={{ __html: "html,body,#root{width:100%;max-width:100%;height:100%;margin:0;overflow:hidden;background:#FFF8EF}*{box-sizing:border-box}button,input,textarea{font:inherit}" }} /></head><body>{children}</body></html>;
}
