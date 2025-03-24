// app/utils/cors.server.ts
export async function cors(request: Request): Promise<Response | null> {
  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400", // 24 hours
      },
    });
  }

  // For actual requests, add CORS headers but continue processing
  const response = new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });

  // Return null to indicate that the request should continue processing
  return null;
}