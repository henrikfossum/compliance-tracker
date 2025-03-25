import { json, type LoaderFunctionArgs } from "@remix-run/node";
// or from "@remix-run/server-runtime"

export async function loader({ request, params }: LoaderFunctionArgs) {
  return json({ ok: true });
}
