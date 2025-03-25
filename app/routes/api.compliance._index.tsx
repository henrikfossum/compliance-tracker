// app/routes/api.compliance._index.tsx
import { json } from "@remix-run/node";

export const loader = () => {
  return json({ message: "Base /api/compliance route" });
};
