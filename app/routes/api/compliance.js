import { json } from "@remix-run/node";

export const loader = async ({ request }) => {
  // Handle GET requests
  return json({ message: "Compliance API GET response" });
};

export const action = async ({ request }) => {
  // Handle POST requests or other actions
  const body = await request.json();
  return json({ message: "Compliance API POST response", data: body });
};