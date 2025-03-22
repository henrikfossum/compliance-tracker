import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // No need to check URL suffix since the route guarantees it
  const jsCode = `
    console.log("✅ Script loaded successfully");
    document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;bottom:20px;left:20px;background:#2ecc71;color:white;padding:10px;border-radius:5px;z-index:9999;">✅ Compliance Banner</div>');
  `;
  
  return new Response(jsCode, {
    headers: { "Content-Type": "application/javascript" },
  });
};

// This is only needed to satisfy TypeScript
export default function Script() {
  return null;
}